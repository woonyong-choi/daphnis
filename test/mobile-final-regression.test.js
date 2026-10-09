// 근거: 전체 화면의 맞춤은 판 묶음의 실제 좌표 크기로 잰다(src/player/view.js layoutFull). 문서 안의 보기 폭(--view-w, 표준 캔버스 폭 이상)으로 한 번 더 줄이면
// 390px 화면에서 316 폭 그림이 128px로 줄어 글자가 5px가 된다. 실제 Chrome·WebKit에서 브라우저 전체 화면과 대체 모양을 둘 다 잰다. 브라우저가 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { webkit } from 'playwright-core';
import { createClock } from '../src/animate/clock.js';
import { createWindows } from '../src/animate/windows.js';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { parseFigure } from '../src/source/parse.js';
import { toSvg } from '../src/svg.js';
import { CAPTURE, launchChrome, readState, withPage } from './chrome.js';

// 판 하나인 그래프, 그래프와 순서 보기가 섞인 그림(판 둘), 좁은 배치가 따로 있는 넓은 그래프. 모두 장면이 둘이다.
const SOURCES = {
  single: ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b', 'scene "하나" mode=once', '  a -> b time=600ms', 'scene "둘" mode=once', '  a -> b time=600ms', ''].join('\n'),
  mixed: ['daphnis 2', 'box client "Client"', 'box worker "Worker"', 'client -> worker', 'view g graph {', '  client worker', '}', 'view s sequence {', '  client worker', '}', 'scene "첫" mode=once', '  client -> worker "req" time=600ms', 'scene "둘" mode=once', '  client -> worker "again" time=600ms', ''].join('\n'),
  wide: 'daphnis 2\nbox a "출발"\nbox b "처리"\nbox c "저장"\nvalue nb "처리 수" on=b\nvalue nc "저장 수" on=c\na -> b\nb -> c\nscene "전달" mode=once for=8s\n  track a -> b -> c time=4s legs="1s, 3s" set="nb+1@b, nc+1@c"\nscene "다시" mode=once\n  a -> b time=300ms\n',
};
const VIEWPORTS = [
  { name: '320', width: 320, height: 568, mobile: true },
  { name: '390', width: 390, height: 900, mobile: true },
  { name: '430', width: 430, height: 932, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
];
// 픽셀 반올림과 스크롤바 여유(px)
const TOLERANCE = 1.5;
const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
// 브라우저 전체 화면이 아니라 창을 덮는 대체 모양을 쓰게 한다(iframe에 allowfullscreen이 없을 때와 같다).
const FALLBACK = () => Object.defineProperty(document, 'fullscreenEnabled', { value: false });

// 재생기를 window.probe로 꺼낸 문서
async function pageHtml(source) {
  return (await toHtml(await buildFigure(source), 'mobile')).replace("figurePlay(document.querySelector('.fl-figure'),", `${CAPTURE}figurePlay(document.querySelector('.fl-figure'),`);
}

// 그림 영역과 판 SVG의 지금 크기. 판의 좌표 크기(viewBox)와 화면 크기를 함께 읽는다.
function measure(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.fl-canvas');
    const panels = document.querySelector('.dp-panels');
    return {
      full: document.querySelector('.fl-figure').classList.contains('full'),
      client: { w: canvas.clientWidth, h: canvas.clientHeight },
      scroll: { w: canvas.scrollWidth, h: canvas.scrollHeight, left: canvas.scrollLeft, top: canvas.scrollTop },
      layout: panels.dataset.layout,
      bundleVar: panels.style.getPropertyValue('--bundle-w'),
      svgs: [...panels.querySelectorAll('svg.fl')].map((svg) => ({ w: svg.getBoundingClientRect().width, h: svg.getBoundingClientRect().height, box: { w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height } })),
    };
  });
}

// 판 묶음의 실제 좌표 크기와, 그 크기가 영역에 들어가는 맞춤 폭
function expectedFit(m) {
  const w = Math.max(...m.svgs.map((svg) => svg.box.w));
  const h = m.svgs.reduce((sum, svg) => sum + svg.box.h, 0);
  return { w, h, fit: Math.min(m.client.w, (m.client.h * w) / h) };
}

// 확대 배수 zoom에서 맞춤이 한 번만 적용됐다: 가장 넓은 판은 맞춤 폭 × 배수이고, 판마다 자기 좌표 폭 비율과 자기 종횡비를 지킨다.
function assertFitted(m, zoom, label) {
  const { w, fit } = expectedFit(m);
  const width = fit * zoom;
  assert.ok(m.full, `${label}: 전체 화면이다`);
  for (const svg of m.svgs) {
    assert.ok(Math.abs(svg.w - (width * svg.box.w) / w) <= TOLERANCE, `${label}: 판 폭 ${svg.w} (기대 ${(width * svg.box.w) / w}) ${JSON.stringify(m)}`);
    assert.ok(Math.abs(svg.h - (svg.w * svg.box.h) / svg.box.w) <= TOLERANCE, `${label}: 판 종횡비 ${JSON.stringify(svg)}`);
  }
  assert.ok(Math.abs(Math.max(...m.svgs.map((svg) => svg.w)) - width) <= TOLERANCE, `${label}: 가장 넓은 판이 맞춤 폭이다`);
  assert.equal(Number(m.bundleVar), w, `${label}: 분모는 묶음의 실제 폭이다`);
}

// 맞춤이 영역의 한 차원을 채운다: 폭이 영역 폭이거나 묶음 높이가 영역 높이다. 어느 쪽도 영역을 넘지 않는다.
function assertFillsOneDimension(m, label) {
  const { fit } = expectedFit(m);
  const height = m.svgs.reduce((sum, svg) => sum + svg.h, 0);
  const widest = Math.max(...m.svgs.map((svg) => svg.w));
  assert.ok(widest <= m.client.w + TOLERANCE && height <= m.client.h + TOLERANCE, `${label}: 영역 안에 들어간다 ${widest}x${height} / ${m.client.w}x${m.client.h}`);
  const isWidthBound = Math.abs(widest - m.client.w) <= TOLERANCE;
  const isHeightBound = Math.abs(height - m.client.h) <= TOLERANCE;
  assert.ok(isWidthBound || isHeightBound, `${label}: 폭이나 높이 한쪽을 채운다 ${widest}x${height} / ${m.client.w}x${m.client.h}`);
  assert.ok(Math.abs(widest - fit) <= TOLERANCE, `${label}: 폭이 맞춤 폭이다`);
}

// 가짜 시계가 멈춰 있어 requestAnimationFrame이 돌지 않는다. 시계를 흘리지 않고 배치만 강제로 끝낸다(장면 시각을 건드리지 않는다).
const settle = (page) => page.evaluate(() => document.querySelector('.fl-canvas').getBoundingClientRect().width);

for (const [engine, launch] of ENGINES) {
  describe(`mobile final: fullscreen fit (${engine})`, () => {
    for (const mode of ['native', 'fallback']) {
      for (const [sourceName, source] of Object.entries({ single: SOURCES.single, mixed: SOURCES.mixed })) {
        for (const viewport of VIEWPORTS) {
          // cost: time O(page), heap O(page), stack O(1), io 1
          // vars: page = 브라우저 페이지 비용
          // basis: estimate
          test(`${sourceName}_${viewport.name}_${mode}_fullscreen_fits_the_real_bundle_once_and_zoom_exit_keep_the_scene`, async () => {
            const html = await pageHtml(source);
            const browser = await launch();
            try {
              await withPage(browser, html, { viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.mobile && engine === 'chrome', hasTouch: viewport.mobile && engine === 'chrome' }, async (page) => {
                if (mode === 'fallback') await page.evaluate(FALLBACK);
                await page.locator('[role="tab"]').nth(1).click();
                await page.clock.runFor(300);
                const before = await measure(page);
                const stateBefore = await readState(page);
                assert.equal(stateBefore.scene, 1);

                await page.locator('.fl-full').click();
                await page.waitForFunction(() => document.querySelector('.fl-figure').classList.contains('full'));
                await settle(page);
                const full = await measure(page);
                assertFitted(full, 1, 'fit');
                assertFillsOneDimension(full, 'fit');
                // 두 번 줄이면 문서 안 폭보다 작아진다. 맞춤은 화면이 그림보다 좁아도 문서 안 폭 아래로 내려가지 않는다.
                const widest = Math.max(...full.svgs.map((svg) => svg.w));
                const widestBefore = Math.max(...before.svgs.map((svg) => svg.w));
                assert.ok(widest >= Math.min(widestBefore, full.client.w) - TOLERANCE, `이중 축소 없음: 전체 ${widest}, 문서 안 ${widestBefore}`);

                // 판의 상대 크기는 문서 안과 같다
                const ratioFull = full.svgs.map((svg) => svg.w / widest);
                for (const [i, svg] of full.svgs.entries()) assert.ok(Math.abs(ratioFull[i] - svg.box.w / expectedFit(full).w) < 0.01);

                // 확대: 맞춤 폭 × 배수. 영역이 넘치면 스크롤되고 끝까지 갈 수 있다.
                const step = await page.evaluate(() => window.probe.data.metrics.zoomStep);
                await page.locator('[data-zoom="in"]').click();
                const zoomed = await measure(page);
                assertFitted(zoomed, step, 'zoom in');
                assert.ok(zoomed.scroll.w >= Math.floor(expectedFit(zoomed).fit * step) - TOLERANCE, '확대한 폭만큼 스크롤 영역이 커진다');
                await page.locator('[data-zoom="in"]').click();
                const zoomed2 = await measure(page);
                assertFitted(zoomed2, step * step, 'zoom in x2');
                const maxLeft = zoomed2.scroll.w - zoomed2.client.w;
                if (maxLeft > TOLERANCE) {
                  const reached = await page.evaluate((left) => {
                    const canvas = document.querySelector('.fl-canvas');
                    canvas.scrollLeft = left + 100;
                    return canvas.scrollLeft;
                  }, maxLeft);
                  assert.ok(Math.abs(reached - maxLeft) <= TOLERANCE, `오른쪽 끝까지 밀린다 ${reached}/${maxLeft}`);
                }
                await page.locator('[data-zoom="fit"]').click();
                assertFitted(await measure(page), 1, 'fit again');
                await page.locator('[data-zoom="out"]').click();
                assertFitted(await measure(page), 1, 'zoom out is clamped at fit');

                // 장면과 시각은 보는 방식을 바꿔도 그대로다
                const stateFull = await readState(page);
                assert.equal(stateFull.scene, stateBefore.scene);
                assert.equal(stateFull.elapsed, stateBefore.elapsed);

                // 나가면 문서 안 모습으로 정확히 돌아온다: 판 폭, 가운데 놓기, 스크롤, 묶음 분모 변수
                await page.locator('.fl-full').click();
                await page.waitForFunction(() => !document.querySelector('.fl-figure').classList.contains('full'));
                await settle(page);
                const after = await measure(page);
                assert.equal(after.full, false);
                assert.equal(after.bundleVar, '', '분모 변수를 남기지 않는다');
                assert.deepEqual(after.svgs.map((svg) => Math.round(svg.w)), before.svgs.map((svg) => Math.round(svg.w)));
                assert.deepEqual([after.scroll.left, after.scroll.top], [0, 0]);
                const stateAfter = await readState(page);
                assert.equal(stateAfter.scene, stateBefore.scene);
                assert.equal(stateAfter.elapsed, stateBefore.elapsed);
                await page.clock.runFor(100);
                assert.ok((await readState(page)).elapsed > stateBefore.elapsed, '나간 뒤에도 시계가 흐른다');
              });
            } finally {
              await browser.close();
            }
          });
        }
      }
    }

    // cost: time O(page), heap O(page), stack O(1), io 1
    // vars: page = 브라우저 페이지 비용
    // basis: estimate
    test('the_390_graph_is_not_shrunk_to_a_third_in_fullscreen_and_text_stays_readable', async () => {
      const html = await pageHtml(SOURCES.single);
      const browser = await launch();
      try {
        await withPage(browser, html, { viewport: { width: 390, height: 900 } }, async (page) => {
          await page.evaluate(FALLBACK);
          const before = await measure(page);
          await page.locator('.fl-full').click();
          await settle(page);
          const full = await measure(page);
          // 문서 안에서 읽던 글자보다 전체 화면의 글자가 작아지지 않는다(재현 값: 316 → 128, 비율 0.405)
          assert.ok(full.svgs[0].w >= before.svgs[0].w * 0.99, `${before.svgs[0].w} → ${full.svgs[0].w}`);
          assert.ok(full.svgs[0].w / full.svgs[0].box.w >= 1, '좌표 한 칸이 1px 이상이다');
        });
      } finally {
        await browser.close();
      }
    });

    // cost: time O(page), heap O(page), stack O(1), io 1
    // vars: page = 브라우저 페이지 비용
    // basis: estimate
    test('a_resize_in_fullscreen_refits_and_exit_then_swaps_to_the_narrow_layout_and_refits_that_bundle', async () => {
      const html = await pageHtml(SOURCES.wide);
      const browser = await launch();
      try {
        await withPage(browser, html, { viewport: { width: 1280, height: 800 } }, async (page) => {
          await page.evaluate(FALLBACK);
          await page.locator('.fl-full').click();
          await settle(page);
          const wideFull = await measure(page);
          assertFitted(wideFull, 1, 'wide');
          assertFillsOneDimension(wideFull, 'wide');
          const wideBox = expectedFit(wideFull);

          // 전체 화면 중 창이 좁아져도 배치는 그대로이고 새 영역에 다시 맞춘다
          await page.setViewportSize({ width: 320, height: 568 });
          await page.waitForFunction(() => parseFloat(document.querySelector('.dp-panels').style.getPropertyValue('--fit-w')) <= 320);
          const resized = await measure(page);
          assert.equal(resized.layout, wideFull.layout);
          assert.equal(expectedFit(resized).w, wideBox.w);
          assertFitted(resized, 1, 'resized');
          assertFillsOneDimension(resized, 'resized');

          // 나가면 좁은 배치로 바뀌고, 다시 들어가면 그 묶음의 실제 크기에 맞춘다
          await page.locator('.fl-full').click();
          await settle(page);
          const narrow = await measure(page);
          assert.equal(narrow.layout, 'narrow');
          assert.ok(expectedFit(narrow).w < wideBox.w, '좁은 배치의 판이 더 좁다');
          await page.locator('.fl-full').click();
          await settle(page);
          const narrowFull = await measure(page);
          assert.equal(narrowFull.layout, 'narrow');
          assertFitted(narrowFull, 1, 'narrow');
          assertFillsOneDimension(narrowFull, 'narrow');
        });
      } finally {
        await browser.close();
      }
    });

    // cost: time O(page), heap O(page), stack O(1), io 1
    // vars: page = 브라우저 페이지 비용
    // basis: estimate
    test('wheel_zoom_keeps_the_point_under_the_pointer_and_the_overflow_pans_to_both_ends', async () => {
      const html = await pageHtml(SOURCES.mixed);
      const browser = await launch();
      try {
        await withPage(browser, html, { viewport: { width: 390, height: 600 } }, async (page) => {
          await page.evaluate(FALLBACK);
          await page.locator('.fl-full').click();
          await settle(page);
          const at = await page.evaluate(() => {
            const box = document.querySelector('.fl-canvas').getBoundingClientRect();
            return { x: box.left + box.width * 0.3, y: box.top + 80 };
          });
          const fractionAt = () => page.evaluate(({ x, y }) => {
            const panels = document.querySelector('.dp-panels').getBoundingClientRect();
            return { x: (x - panels.left) / panels.width, y: (y - panels.top) / panels.height };
          }, at);
          const start = await fractionAt();
          await page.mouse.move(at.x, at.y);
          for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
          await settle(page);
          const zoomed = await measure(page);
          assert.ok(zoomed.scroll.w > zoomed.client.w + TOLERANCE, '확대하면 가로로 넘친다');
          const end = await fractionAt();
          // 가로로는 영역을 넘치므로 포인터 아래 그림 자리가 머문다. 세로로는 묶음이 영역보다 낮은 동안 스크롤할 수 없어(위에 붙어 있다) 자리를 지킬 수 없으므로 재지 않는다.
          assert.ok(Math.abs(end.x - start.x) < 0.02, `${JSON.stringify(start)} → ${JSON.stringify(end)}`);
          // 끝까지 밀 수 있고, 밀어도 판 크기는 그대로다
          const edges = await page.evaluate(() => {
            const canvas = document.querySelector('.fl-canvas');
            canvas.scrollTo(0, 0);
            const first = [canvas.scrollLeft, canvas.scrollTop];
            canvas.scrollTo(canvas.scrollWidth, canvas.scrollHeight);
            return { first, last: [canvas.scrollLeft, canvas.scrollTop], max: [canvas.scrollWidth - canvas.clientWidth, canvas.scrollHeight - canvas.clientHeight] };
          });
          assert.deepEqual(edges.first, [0, 0]);
          assert.ok(Math.abs(edges.last[0] - edges.max[0]) <= TOLERANCE && Math.abs(edges.last[1] - edges.max[1]) <= TOLERANCE, JSON.stringify(edges));
          const panned = await measure(page);
          assert.deepEqual(panned.svgs.map((svg) => Math.round(svg.w)), zoomed.svgs.map((svg) => Math.round(svg.w)));
        });
      } finally {
        await browser.close();
      }
    });
  });
}

// 입력 데이터 표(details.fl-data 첫 표)의 행마다 칸 글자 목록
function dataRowsOf(html) {
  const table = html.match(/<details class="fl-data">[\s\S]*?<table>([\s\S]*?)<\/table>/)[1];
  return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<t[dh][^>]*>([^<]*)<\/t[dh]>/g)].map(([, cell]) => cell));
}

const pieSource = (kind, head = '') => `daphnis 2\nchart share "몫" ${kind} {\n${head}  row "가" value=4\n  row "나" value=9\n}\nview main plot {\n  share\n}\n`;

// cost: time O(1), heap O(out), stack O(1)
// vars: out = HTML 글자 수
// basis: estimate
test('pie_and_donut_data_table_shows_computed_percentages_in_the_chart_number_format_and_inputs_as_written', async () => {
  // 4 ÷ 13 = 30.769230769230766…: 표의 비율 칸은 조각 글(30.8%)과 같은 자릿수이고, 입력 값 칸은 적은 그대로다.
  for (const kind of ['pie', 'donut']) {
    const html = await toHtml(await buildFigure(pieSource(kind)), 'share');
    assert.deepEqual(dataRowsOf(html), [['항목', '값', '비율(%)'], ['가', '4', '30.8'], ['나', '9', '69.2']], kind);
    assert.ok(!/<td>\d+\.\d{4,}<\/td>/.test(html), `${kind}: 표시 칸에 긴 소수가 없다`);
  }
  // 머리 줄 decimals가 있으면 그 자릿수다
  const decimals = await toHtml(await buildFigure(pieSource('pie', '  decimals 3\n')), 'share');
  assert.deepEqual(dataRowsOf(decimals).slice(1).map((row) => row[2]), ['30.769', '69.231']);
  // 입력 값은 반올림하지 않는다
  const raw = await toHtml(await buildFigure('daphnis 2\nchart share "몫" pie {\n  row "가" value=1.2345678\n  row "나" value=2\n}\nview main plot {\n  share\n}\n'), 'share');
  assert.equal(dataRowsOf(raw)[1][1], '1.2345678');
});

// cost: time O(1), heap O(out), stack O(1)
// vars: out = HTML 글자 수
// basis: estimate
test('pie_fraction_metadata_keeps_full_precision_while_the_displayed_cell_is_formatted', async () => {
  const result = await buildFigure(pieSource('pie'));
  const svg = await toSvg(result, { scene: 0 });
  const fractions = [...svg.matchAll(/data-fraction="([^"]+)"/g)].map(([, value]) => value);
  assert.deepEqual(fractions.map(Number), [4 / 13, 9 / 13]);
  assert.ok(fractions.every((value) => value.length > 8), `정밀도를 유지한다: ${fractions}`);
  const html = await toHtml(result, 'share');
  assert.deepEqual(dataRowsOf(html).slice(1).map((row) => row[2]), ['30.8', '69.2']);
});

// 원본을 읽어 오류를 `줄: 문구` 목록으로 돌려준다(오류가 없으면 빈 목록).
function problemsOf(source) {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    return error.problems.map((problem) => `${problem.line}: ${problem.message}`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
test('an_edge_end_that_is_already_reported_is_not_also_reported_as_not_drawn', () => {
  // 거절된 선언(대문자 이름)의 이름 오류는 선언 줄에 하나만 있다. 그 이름을 쓰는 선이 "그려지지 않는다"를 덧붙이지 않는다.
  for (const source of ['daphnis 2\ngroup a "A" {\n  box Step "나"\n}\nbox c "C"\nStep -> c', 'daphnis 2\nbox Step "나"\nbox c "C"\nStep -> c']) {
    const found = problemsOf(source);
    assert.equal(found.length, 1, found.join('\n'));
    assert.match(found[0], /^\d+: "Step" is not a valid name/);
  }
  assert.ok(problemsOf('daphnis 2\ngroup a "A" {\n  box Step "나"\n}\nbox c "C"\nStep -> c')[0].startsWith('3:'), '이름 오류는 선언 줄에 있다');
  // 모르는 카드는 모르는 카드로만 알린다
  assert.deepEqual(problemsOf('daphnis 2\nbox a "A"\nbox b "B"\na -> zz'), ['4: unknown card "zz". Did you mean "a"? Declared: a, b']);
  // 두 끝이 다 모르는 이름이면 끝마다 하나씩이고 그려지지 않는다는 알림은 없다
  const both = problemsOf('daphnis 2\nbox a "A"\nyy -> zz');
  assert.equal(both.length, 2);
  assert.ok(both.every((message) => message.includes('unknown card')), both.join('\n'));
});

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
test('a_valid_edge_that_no_graph_view_holds_is_still_reported_and_unrelated_problems_stay', () => {
  const SEPARATED = 'daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nview g graph {\n  a\n  c\n}\nview h graph {\n  b\n  c\n}';
  assert.deepEqual(problemsOf(SEPARATED), ['5: edge a -> b is not drawn: no graph view holds both "a" and "b"']);
  // 풀리지 않은 선 하나가 다른 선의 진단을 삼키지 않는다
  const found = problemsOf(`${SEPARATED}\na -> zz\nb -> c\nc -> c`);
  assert.ok(found.some((message) => message.includes('edge a -> b is not drawn')), found.join('\n'));
  assert.ok(found.some((message) => message.includes('unknown card "zz"')), found.join('\n'));
  assert.ok(found.some((message) => message.includes('cannot go from "c" to itself')), found.join('\n'));
  assert.ok(!found.some((message) => message.includes('a -> zz is not drawn')), found.join('\n'));
});

// 상태가 논리 경계에서 바로 바뀌는지 HTML 재생기와 움직이는 SVG를 같은 시각에 견준다. 값 글자, 후광, 알약 꼬리 같은 저작된 움직임은 이 비교에 넣지 않는다.
// 한 장면에 차트 계열 보임, 막대 흐림과 굵기(light), 도형 켜짐(light), 카드 내용 층, 조용한 선(보임과 강조가 한 요소에서 따로 움직인다)이 모두 들어 있다.
const BOUNDARY_SOURCE = [
  'daphnis 2',
  'box web "웹"',
  'box api "API"',
  'store db "DB"',
  'value depth "깊이" on=db from=2',
  'on db depth+1',
  'chart load "부하" bar {',
  '  x "지연(ms)"',
  '  series ms "지연"',
  '  series cap "한도"',
  '  row "지금" ms=depth cap=6',
  '  row "최대" ms=6 cap=6',
  '}',
  'view main graph right "구조" {',
  '  web',
  '  api',
  '  db',
  '  load',
  '}',
  'web -> api',
  'api -> db',
  'web -> db quiet',
  'scene "하나" mode=once',
  '  web -> api "주문" time=600ms',
  '  reveal load.ms',
  '  wait 400ms',
  '  show db "첫 상태"',
  '  api -> db "저장" time=600ms',
  '  light api',
  '  light load "지금"',
  '  wait 400ms',
  '  web -> db time=600ms',
  '  reveal load.cap',
  'scene "둘" mode=once',
  '  show db "둘째 상태"',
  '  light db',
  '  light load "최대"',
  '  web -> db time=600ms',
  '  reveal load.cap',
  '  api -> db "저장" time=600ms',
  '',
].join('\n');
// 경계 앞 24ms, 경계, 경계 뒤 40·100·200ms 근처. 재생기 시계는 프레임 단위로 흘러 실제 시각은 읽어서 쓴다.
const BOUNDARY_OFFSETS = [-40, 0, 40, 100, 200];

// 조상까지 곱한 불투명도와 보임, 종류별 칠·색·굵기. 두 표면이 같은 모습인지 가리는 서명이다.
function signatureOf(root) {
  const rgb = (value) => {
    const context = document.createElement('canvas').getContext('2d');
    context.canvas.width = 1;
    context.canvas.height = 1;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data.join(',');
  };
  return [...root.querySelectorAll('[class*="cs-"], [class*="cr-"], .fl-layer, .fl-edge, .fl-stroke, .fl-card, .part-bg, .grid-cell, .fl-path')].map((el, i) => {
    let opacity = 1;
    let isHidden = false;
    for (let node = el; node && node !== root.parentNode; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      if (style.visibility === 'hidden') isHidden = true;
    }
    const style = getComputedStyle(el);
    const extra = el.matches('.fl-edge') ? ` color=${rgb(style.color)}` : el.matches('rect.fl-stroke, .fl-card, .part-bg, .grid-cell') ? ` fill=${rgb(style.fill)}` : el.matches('.ink') ? ` weight=${style.fontWeight}` : '';
    return `${el.tagName}.${(el.getAttribute('class') ?? '').trim().split(/\s+/)[0]}#${i} opacity=${opacity.toFixed(2)}${isHidden ? ' hidden' : ''}${extra}`;
  });
}

// 움직이는 SVG를 시각 at(ms)에 두고 CSS 애니메이션도 같은 시각에 멈춘 채 서명을 읽는다
const svgSignatureAt = (page, at) => page.evaluate(([source, time]) => {
  const root = document.querySelector('svg');
  root.pauseAnimations();
  root.setCurrentTime(time / 1000);
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = time;
  }
  return new Function(`return (${source})`)()(root.querySelector('.fl-motion') ?? root);
}, [signatureOf.toString(), at]);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
test('windows_switch_at_the_boundary_by_default_and_keep_an_explicit_fade_and_stack_overlapping_animations', () => {
  const segs = [{ t0: 0, t1: 1000 }, { t0: 1000, t1: 2000 }];
  const clock = createClock(2000, { mode: 'once' });
  const rulesOf = (css) => css.join('\n');
  // 기본: 앞 구간 끝 직전의 값이 경계 바로 뒤에 새 값이 된다(경사 구간이 없다). 한 퍼센트에 키 둘이 겹치지 않는다.
  const plain = [];
  createWindows(clock, segs, plain).windows([false, true], { on: 'opacity: 1', off: 'opacity: 0' });
  const [, keyframes] = /@keyframes a0 \{ ([^}]*\}[^}]*\}) \}/.exec(rulesOf(plain));
  assert.equal(keyframes.split('}').filter((part) => part.includes('{')).length, 2, keyframes);
  assert.match(keyframes, /^0%,[\d.]+% \{ opacity: 0 \} [\d.]+%,100% \{ opacity: 1 \}$/);
  // 저작된 서서히 감은 그대로다: 켜질 때와 꺼질 때가 따로 걸린다
  const faded = [];
  createWindows(clock, segs, faded).windows([false, true], { on: 'stroke: red', off: 'stroke: blue', fade: { on: 120, off: 300 } });
  assert.match(rulesOf(faded), /\{ stroke: blue \} [\d.]+%,100% \{ stroke: red \}/, rulesOf(faded));
  // 한 요소에 걸리는 두 애니메이션은 속성 하나에 쌓인다
  const stacked = [];
  const { windows, stack } = createWindows(clock, segs, stacked);
  const [first, second] = [windows([false, true], { on: 'opacity: 1', off: 'opacity: 0' }), windows([true, false], { on: 'color: red', off: 'color: blue' })];
  const own = stack([first, undefined, second]);
  assert.notEqual(own, first);
  assert.match(rulesOf(stacked), new RegExp(`\\.fl \\.${own} \\{ animation: ${first} [^,;]+, ${second} [^,;]+; \\}`));
  assert.equal(stack([first]), first);
  assert.equal(stack([undefined, undefined]), '');
});

for (const [engine, launch] of ENGINES) {
  // cost: time O(b·o·page), heap O(page), stack O(1), io 1
  // vars: b = 경계 수, o = 경계마다 시각 수, page = 브라우저 페이지 비용
  // basis: estimate
  test(`semantic_state_switches_at_the_logical_boundary_in_html_and_animated_svg_${engine}`, async () => {
    const result = await buildFigure(BOUNDARY_SOURCE, { strict: true });
    const html = (await toHtml(result, 'boundary')).replace("figurePlay(document.querySelector('.fl-figure'),", `${CAPTURE}figurePlay(document.querySelector('.fl-figure'),`);
    const browser = await launch();
    try {
      let changes = 0;
      for (const scene of [0, 1]) {
        const segs = result.timeline.segs.filter((seg) => seg.si === scene);
        const start = Math.min(...segs.map((seg) => seg.t0));
        const boundaries = [...new Set(segs.map((seg) => seg.t0 - start))].filter((time) => time > 0);
        const times = [...new Set(boundaries.flatMap((boundary) => BOUNDARY_OFFSETS.map((offset) => boundary + offset)))].filter((time) => time > 0).sort((a, b) => a - b);
        const svg = await toSvg(result, { scene });
        const samples = [];
        await withPage(browser, html, {}, async (page) => {
          if (scene > 0) await page.locator('[role="tab"]').nth(scene).click();
          let now = 0;
          for (const time of times) {
            await page.clock.runFor(time - now);
            now = time;
            const state = await readState(page);
            samples.push({ time, elapsed: state.elapsed, scene: state.scene, signature: await page.evaluate(`(${signatureOf})(document.querySelector('.dp-panels'))`) });
          }
        });
        const page = await browser.newPage();
        await page.setContent(`<body>${svg}</body>`);
        for (const [i, sample] of samples.entries()) {
          assert.equal(sample.scene, scene);
          const shown = await svgSignatureAt(page, sample.elapsed);
          assert.deepEqual(shown, sample.signature, `${engine} 장면 ${scene} 시각 ${sample.time}ms(재생기 ${sample.elapsed}ms)`);
          if (i && JSON.stringify(sample.signature) !== JSON.stringify(samples[i - 1].signature)) changes++;
        }
        await page.close();
      }
      // 비교가 빈 비교가 아니다: 경계를 지나며 보이는 모습이 실제로 여러 번 바뀐다
      assert.ok(changes >= 8, `경계에서 바뀐 횟수 ${changes}`);
    } finally {
      await browser.close();
    }
  });
}
