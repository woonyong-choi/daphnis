// 마지막 회귀 감사의 수용된 결함들 가운데 실제 브라우저(Chrome, WebKit)가 필요한 부분: 같은 장면이 HTML 정지, 움직임 줄이기, 정지 SVG, 움직이는 SVG 끝에서 같은 모습인지, 원·도넛 흐림, 히트맵 굵기 범위,
// 키 하나짜리 SMIL, 그리고 상태가 실제 시간과 앞 기록에 따르지 않는지. 브라우저가 없으면 건너뛰지 않고 실패한다.
// 모든 읽기는 시계를 옮긴 바로 뒤에 계산 스타일로 한다. 전환을 끝까지 감거나 기다리지 않는다(상태에 CSS 전환이 있으면 이 시험이 실패한다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { launchChrome } from './chrome.js';
import { chartSource } from './helpers.js';
import { openPaused } from './mobile-chart.js';
import { playerHtml } from './player-compiled.js';

const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
const VIEWPORT = { width: 1280, height: 900 };
const BARS = ['x "대기(건)"', 'series a "A"', 'row "메일" a=12', 'row "리포트" a=7', 'row "이미지" a=20'];
const HEAT = ['cell "메일" "월" 1', 'cell "메일" "화" 2', 'cell "이미지" "월" 3', 'cell "이미지" "화" 4'];
const ROWS = ['row "메일" value=12', 'row "리포트" value=7', 'row "이미지" value=20'];
const DECLARED = 'daphnis 2\nbox a "A"\nbox b "B"\nqueue q "Q" slots=4 from=2\nvalue n "N" on=b from=5\nvalue len "L" on=b ref=q\nvalue hidden "H" from=9\na -> b\nb -> q\n';
const read = (name) => readFileSync(new URL(`../examples/${name}.dap`, import.meta.url), 'utf8');

// 행 k마다 "면/글자/글자 굵기". 면은 행 묶음 안의 첫 도형, 글자는 `.ink`다. 불투명도는 조상까지 곱한 실제 값이다.
function looks(count) {
  const effective = (el) => {
    let opacity = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentNode) opacity *= Number(getComputedStyle(node).opacity);
    return Number(opacity.toFixed(2));
  };
  // 움직임 줄이기에서는 마지막 모습 층만 보이고 움직임 층은 display: none이다.
  const motion = document.querySelector('.fl-motion');
  const still = document.querySelector('.fl-still');
  const root = still && getComputedStyle(motion).display === 'none' ? still : (motion ?? document);
  return Array.from({ length: count }, (_, k) => {
    const face = root.querySelector(`[data-chart="c"] .cr-${k}:not(.ink) rect, [data-chart="c"] .cr-${k}:not(.ink) path`);
    const ink = [...root.querySelectorAll(`[data-chart="c"] .cr-${k}.ink`)].find((el) => getComputedStyle(el).visibility !== 'hidden');
    return `${face ? effective(face) : '-'}/${ink ? effective(ink) : '-'}/${ink ? getComputedStyle(ink).fontWeight : '-'}`;
  }).join(' ');
}

// 보이는 글(도형 이름 제외)과 보이는 찬 칸 수. 보임은 조상 불투명도 곱과 보임 속성이 정한다.
function visibleValues() {
  const effective = (el) => {
    let opacity = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentNode) opacity *= Number(getComputedStyle(node).opacity);
    return opacity;
  };
  const shown = (el) => getComputedStyle(el).visibility !== 'hidden' && effective(el) > 0.01;
  const motion = document.querySelector('.fl-motion');
  const still = document.querySelector('.fl-still');
  const root = still && getComputedStyle(motion).display === 'none' ? still : (motion ?? document);
  const texts = [...root.querySelectorAll('text')].filter(shown).map((el) => el.textContent.trim()).filter((text) => !['A', 'B', 'Q'].includes(text));
  const fills = [...root.querySelectorAll('.queue-fill')].filter(shown).map((el) => el.querySelectorAll('rect').length);
  return `${texts.join(',')} | q=${fills.join('+') || 0}`;
}

// 움직이는 SVG를 시각 seconds로 옮기고 CSS 애니메이션도 같은 시각에 둔다.
const seek = (page, seconds) => page.evaluate((at) => {
  document.querySelector('svg').pauseAnimations();
  document.querySelector('svg').setCurrentTime(at);
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = at * 1000;
  }
}, seconds);

// 한 장면을 다섯 곳에서 같은 함수로 읽는다: HTML 끝, HTML 움직임 줄이기, 정지 SVG, 움직이는 SVG 끝, 움직이는 SVG의 움직임 줄이기 층.
async function fiveSurfaces(browser, source, probe, ...args) {
  const result = await buildFigure(source, { strict: true });
  const html = await toHtml(result, 'regression');
  const out = {};
  for (const [name, reducedMotion] of [['htmlEnd', 'no-preference'], ['htmlReduced', 'reduce']]) {
    const { page, errors } = await openPaused(browser, html, { viewport: VIEWPORT, reducedMotion });
    await page.clock.runFor(10_000);
    out[name] = await page.evaluate(probe, ...args);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.setContent(await toSvg(result, { scene: 0, isStatic: true }));
  out.staticSvg = await page.evaluate(probe, ...args);
  await page.setContent(await toSvg(result, { scene: 0 }));
  await seek(page, (result.timeline.presentation[0] || 1) / 1000 - 0.001);
  out.animatedEnd = await page.evaluate(probe, ...args);
  await page.close();
  const still = await browser.newPage({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  await still.setContent(await toSvg(result, { scene: 0 }));
  out.svgReduced = await still.evaluate(probe, ...args);
  await still.close();
  return out;
}

const same = (surfaces, expected, message) => {
  for (const [name, actual] of Object.entries(surfaces)) assert.equal(actual, expected, `${message}: ${name}`);
};

for (const [engine, launch] of ENGINES) {
  // 근거: 정지는 고른 장면의 완성된 상태이고 움직임 줄이기는 한 바퀴의 마지막 상태다. 지속하는 차트 `light`(흐림, 히트맵 굵기)는 그 상태에 속하고 일시 효과만 끝난다.
  test(`${engine}_chart_light_final_state_is_the_same_on_all_five_surfaces`, async () => {
    const browser = await launch();
    try {
      const dim = `${values.opacity.dim}/${values.opacity['dim-ink']}/400`;
      const bar = (dimmed) => [0, 1, 2].map((k) => (dimmed.includes(k) ? dim : '1/1/400')).join(' ');
      const heat = (lit) => [0, 1, 2, 3].map((k) => `1/1/${lit.includes(k) ? 600 : 400}`).join(' ');
      for (const [name, steps, expected] of [
        ['none', 'scene "none" mode=once\n  wait 300ms\n', bar([])],
        ['subset', 'scene "subset" mode=once\n  light c "이미지"\n  wait 300ms\n', bar([0, 1])],
        ['all', 'scene "all" mode=once\n  light c "메일"\n  light c "리포트"\n  light c "이미지"\n  wait 300ms\n', bar([])],
        ['zero', 'scene "zero" mode=once\n  light c "메일"\n', bar([1, 2])],
        ['static', 'scene "static" mode=static\n  wait 300ms\n  light c "리포트"\n', bar([0, 2])],
      ]) same(await fiveSurfaces(browser, `daphnis 2\n${chartSource('bar', BARS)}${steps}`, looks, 3), expected, `${engine} 막대 ${name}`);
      for (const [name, steps, expected] of [
        ['none', 'scene "none" mode=once\n  wait 300ms\n', heat([])],
        ['subset', 'scene "subset" mode=once\n  light c "이미지" "화"\n  wait 300ms\n', heat([3])],
        ['all', 'scene "all" mode=once\n  light c "메일" "월"\n  light c "메일" "화"\n  light c "이미지" "월"\n  light c "이미지" "화"\n  wait 300ms\n', heat([])],
        ['zero', 'scene "zero" mode=once\n  light c "메일" "월"\n', heat([0])],
      ]) same(await fiveSurfaces(browser, `daphnis 2\n${chartSource('heatmap', HEAT)}${steps}`, looks, 4), expected, `${engine} 히트맵 ${name}`);
    } finally { await browser.close(); }
  });

  // 근거: 원과 도넛도 행 흐림의 공통 규칙을 따른다. 밝히지 않은 조각은 면 dim, 글자 dim-ink로 흐려지고 밝힌 조각은 1, 라벨 글 굵기는 그대로(500)다. 히트맵만 흐리지 않는다.
  test(`${engine}_pie_and_donut_dim_unlit_rows_like_every_other_chart_and_keep_label_weight`, async () => {
    const browser = await launch();
    try {
      for (const type of ['pie', 'donut']) {
        const dim = `${values.opacity.dim}/${values.opacity['dim-ink']}/500`;
        const surfaces = await fiveSurfaces(browser, `daphnis 2\n${chartSource(type, ROWS)}scene "s" mode=once\n  light c "이미지"\n  wait 300ms\n`, looks, 3);
        same(surfaces, `${dim} ${dim} 1/1/500`, `${engine} ${type}`);
      }
    } finally { await browser.close(); }
  });

  // 근거: 값 카드 줄과 큐는 선언한 처음 모습(from)이 있다. 장면이 없으면 어디에도 안 그려졌다. 고른 장면의 끝 값과 장면 끝 시각의 상쇄도 모든 곳에서 같다.
  test(`${engine}_declared_values_and_scene_final_values_are_the_same_on_all_five_surfaces`, async () => {
    const browser = await launch();
    try {
      for (const [name, steps, expected] of [
        ['scene-less', '', 'N,L,5,2 | q=2'],
        ['plus', 'scene "plus" mode=once\n  a -> b set="n+2"\n', 'N,L,7,2 | q=2'],
        ['header', 'scene "header" mode=static set="n=7, q=3"\n  light a\n', 'N,L,7,3 | q=3'],
        ['net', 'scene "net" mode=once\n  a -> b set="n+1, n-1"\n', 'N,L,5,2 | q=2'],
      ]) {
        const surfaces = steps ? await fiveSurfaces(browser, `${DECLARED}${steps}`, visibleValues) : await sceneLess(browser);
        same(surfaces, expected, `${engine} ${name}`);
      }
    } finally { await browser.close(); }
  });

  // 근거: 키 하나짜리 이산 SMIL을 WebKit은 적용하지 않아 바뀌지 않는 값 줄과 큐 찬 칸이 한 바퀴 내내 안 보였다. 모든 시각에서 안 바뀐 줄은 보이고, 바뀐 줄은 앞 글이 끝에서 꺼져 마지막 글 하나만 남는다.
  test(`${engine}_animated_svg_shows_unchanged_rows_at_every_moment_and_exactly_the_last_changed_variant_at_the_end`, async () => {
    const browser = await launch();
    try {
      const result = await buildFigure(`${DECLARED}scene "plus" mode=once\n  a -> b set="n+2"\n`, { strict: true });
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.setContent(await toSvg(result, { scene: 0 }));
      for (const at of [0.1, 0.5, 0.9, 1.149, 5]) {
        await seek(page, at);
        const [, n, len, fills] = (await page.evaluate(visibleValues)).match(/^N,L,(\d),(\d) \| q=(.*)$/);
        assert.ok(['5', '7'].includes(n), `${engine} ${at}s: N은 한 글 (${n})`);
        assert.equal(len, '2', `${engine} ${at}s: 안 바뀐 참조 값은 늘 보인다`);
        assert.equal(fills, '2', `${engine} ${at}s: 안 바뀐 큐 찬 칸은 늘 보인다`);
      }
      await seek(page, 5);
      assert.match(await page.evaluate(visibleValues), /^N,L,7,2/);
      await page.close();

      const queue = await toSvg(await buildFigure('daphnis 2\nbox b "B"\nqueue q "Q" slots=4 from=2\nb -> q\nscene "take" mode=once\n  q -> b set="q-1"\n', { strict: true }), { scene: 0 });
      const queuePage = await browser.newPage({ viewport: VIEWPORT });
      await queuePage.setContent(queue);
      const seen = [];
      for (const at of [0.1, 0.5, 0.9, 1.149, 5]) {
        await seek(queuePage, at);
        seen.push((await queuePage.evaluate(visibleValues)).split(' | ')[1]);
      }
      assert.equal(seen[0], 'q=2', `${engine}: 처음 두 칸`);
      assert.ok(seen.slice(1).every((fill) => ['q=2', 'q=1'].includes(fill)), `${engine}: 한 번에 한 묶음 (${seen})`);
      assert.deepEqual(seen.slice(-3), ['q=1', 'q=1', 'q=1'], `${engine}: 논리 끝 뒤에는 마지막 값 한 칸만 남는다 (${seen})`);
      await queuePage.close();
    } finally { await browser.close(); }
  });

  // 근거: `.fl:has(.chart-cell.dim)`이 판 전체를 범위로 잡아, 한 판의 두 히트맵 카드 가운데 하나만 밝혀도 다른 카드의 모든 숫자가 굵어졌다.
  test(`${engine}_heatmap_bold_stays_inside_its_own_chart_card`, async () => {
    const browser = await launch();
    try {
      const card = (id) => `chart ${id} "${id}" heatmap {\n${HEAT.map((line) => `  ${line}`).join('\n')}\n}\n`;
      const source = `daphnis 2\n${card('h1')}${card('h2')}view g graph {\n  h1\n  h2\n}\nscene "s" mode=once\n  light h1 "이미지" "화"\n  wait 300ms\n`;
      const { page } = await openPaused(browser, await toHtml(await buildFigure(source, { strict: true }), 'two heatmaps'), { viewport: VIEWPORT });
      await page.clock.runFor(10_000);
      const weights = await page.evaluate(() => ['h1', 'h2'].map((id) => [...document.querySelectorAll(`[data-chart="${id}"] .chart-cell.ink`)].map((el) => getComputedStyle(el).fontWeight)));
      assert.deepEqual(weights, [['400', '400', '400', '600'], ['400', '400', '400', '400']], `${engine}: 밝힌 카드만 굵은 칸을 갖는다`);
      await page.close();
    } finally { await browser.close(); }
  });

  // 근거: 상태에 CSS 전환이 있으면 같은 장면 같은 시각의 모습이 실제 시간과 앞 기록에 따랐다(카드 내용 층이 서서히 사라지는 동안 옛 글과 새 글이 함께 보이고 접근성 트리와 화면이 어긋났다).
  // 시계를 옮긴 바로 뒤 계산 스타일을 읽고, 새 페이지에서 직접 온 것과 앞 장면을 다 지나온 것이 같은 모습인지, 옛 변형이 보이지 않는지 본다.
  test(`${engine}_html_state_at_a_sampled_time_does_not_depend_on_real_time_or_history`, async () => {
    const browser = await launch();
    try {
      for (const name of ['queue', 'flow']) {
        const { html, result } = await playerHtml(read(name), { baseDir: 'examples' });
        const scenes = result.timeline.steps.length;
        for (const scene of [Math.min(2, scenes - 1), scenes - 1]) {
          for (const wait of [600, 1500]) {
            const direct = await sampled(browser, html, { scene, wait, history: false });
            const repeated = await sampled(browser, html, { scene, wait, history: false });
            const played = await sampled(browser, html, { scene, wait, history: true });
            assert.deepEqual(repeated.signature, direct.signature, `${engine} ${name} 장면 ${scene} +${wait}ms: 새 페이지를 되풀이해도 같다`);
            assert.deepEqual(played.signature, direct.signature, `${engine} ${name} 장면 ${scene} +${wait}ms: 앞 장면을 지나온 것과 직접 간 것이 같다`);
            for (const layers of direct.layersByCard) assert.ok(layers.visible <= 1, `${engine} ${name} 장면 ${scene} +${wait}ms: 한 카드에 보이는 내용 층은 하나뿐 (${JSON.stringify(layers)})`);
            assert.deepEqual(direct.exposed, direct.shown, `${engine} ${name} 장면 ${scene} +${wait}ms: 접근성 트리와 보이는 변형이 같다`);
          }
        }
      }
    } finally { await browser.close(); }
  });
}

// 장면 없는 문서: 재생기가 그리지 않는 HTML이라 시계 없이 그대로 읽는다.
async function sceneLess(browser) {
  const result = await buildFigure(DECLARED, { strict: true });
  const out = {};
  for (const [name, reducedMotion] of [['htmlEnd', 'no-preference'], ['htmlReduced', 'reduce']]) {
    const { page } = await openPaused(browser, await toHtml(result, 'declared'), { viewport: VIEWPORT, reducedMotion });
    out[name] = await page.evaluate(visibleValues);
    await page.close();
  }
  const narrow = await openPaused(browser, await toHtml(result, 'declared'), { viewport: { width: 320, height: 900 } });
  out.htmlNarrow = await narrow.page.evaluate(visibleValues);
  await narrow.page.close();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.setContent(await toSvg(result, { isStatic: true }));
  out.staticSvg = await page.evaluate(visibleValues);
  await page.setContent(await toSvg(result));
  out.animatedEnd = await page.evaluate(visibleValues);
  await page.close();
  return out;
}

// 접근성 트리에 오르는 요소. 보임이 hidden이거나 display가 none이면 트리에서 빠진다.
async function exposure(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
  const exposed = [];
  for (const nodeId of nodeIds) {
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
    exposed.push(nodes[0]?.ignored === false);
  }
  await cdp.detach();
  return exposed;
}

// 시계를 옮긴 바로 뒤의 상태 한 장. signature는 상태가 정하는 요소의 계산 스타일, layersByCard는 카드마다 보이는 내용 층 수,
// exposed와 shown은 변형 글이 접근성 트리에 오르는지(Chrome만 잰다)와 계산 스타일로 보이는지다.
async function sampled(browser, html, { scene, wait, history }) {
  const { page } = await openPaused(browser, html, { viewport: VIEWPORT });
  if (history) {
    // 앞 장면들을 끝까지 지나온 뒤 고른 장면으로 간다.
    await page.clock.runFor(8000);
    await page.locator('[role="tab"]').nth(0).click();
    await page.clock.runFor(3000);
  }
  await page.locator('[role="tab"]').nth(scene).click();
  await page.clock.runFor(wait);
  const state = await page.evaluate(() => {
    const effective = (el) => {
      let opacity = 1;
      for (let node = el; node && node.nodeType === 1; node = node.parentNode) opacity *= Number(getComputedStyle(node).opacity);
      return Number(opacity.toFixed(3));
    };
    const style = (el) => {
      const css = getComputedStyle(el);
      return [css.opacity, css.visibility, css.fontWeight, css.stroke, css.fill, css.color].join('|');
    };
    const state = [...document.querySelectorAll('.fl-layer, .fl-card, text[data-v], .queue-fill, .fl-status, .fl-edge, .fl-stroke, [class*="cr-"], [class*="cs-"]')];
    const layers = [...document.querySelectorAll('.fl-node')].map((node) => {
      const own = [...node.querySelectorAll('.fl-layer')];
      return { layers: own.length, visible: own.filter((layer) => getComputedStyle(layer).visibility !== 'hidden' && effective(layer) > 0.01).length };
    });
    return { signature: state.map(style), layersByCard: layers.filter((entry) => entry.layers > 0) };
  });
  const selectors = ['text[data-v]', '.fl-status text', '.fl-layer text'];
  const exposed = [];
  const shown = [];
  for (const selector of selectors) {
    shown.push(...(await page.evaluate((query) => [...document.querySelectorAll(query)].map((el) => {
      let opacity = 1;
      for (let node = el; node && node.nodeType === 1; node = node.parentNode) opacity *= Number(getComputedStyle(node).opacity);
      return getComputedStyle(el).visibility !== 'hidden' && opacity > 0.01;
    }), selector)));
    if (browser.browserType().name() === 'chromium') exposed.push(...(await exposure(page, selector)));
  }
  await page.close();
  return { ...state, shown, exposed: exposed.length ? exposed : shown };
}
