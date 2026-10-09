// 장면 재생기의 화면 계약: 재생 조작 없음, 도구 막대(내려받기·전체 화면) 나타남, 탭 배치, 내려받기와 다시 내려받기, 320px 이상 반응형(docs/design/playback.md 장면).
// 실제 Chrome에서 잰다. Chrome이 없으면 시험이 실패한다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { withFolder } from './helpers.js';
import { LONG_TABS, MIXED, MULTI, NO_TIME, SINGLE, launchChrome, playerHtml, readState, withPage } from './player-compiled.js';

// 둘째 장면이 2배속 반복인 두 장면 그림. 내려받은 정본이 장면 설정을 보존하는지 본다.
const DOWNLOAD = MULTI.replace('scene "Two" mode=once', 'scene "Two" mode=loop speed=2');
// 장면 설정이 없는 장면(기본은 정지)
const STATIC_ONE = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "Only"\n  a -> b time=300ms\n';
// 순서 판 하나뿐인 그림. 순서 판은 다시 배치하지 않고, 참여자 다섯이 읽을 수 있는 폭이 화면보다 넓어 320px에서 판 안에서 밀린다. 차트 판과 그래프 판은 좁은 배치가 있어 밀리지 않는다(responsive-charts.test.js).
const WIDE = ['daphnis 2', 'box a "서비스 가"', 'box b "서비스 나"', 'box c "서비스 다"', 'box d "서비스 라"', 'box e "서비스 마"', 'view calls sequence "호출" {', '  a', '  b', '  c', '  d', '  e', '}', 'scene "호출" mode=once', '  a -> b "요청" time=300ms', '  b -> c "전달" time=300ms', '  c -> d "저장" time=300ms', '  d -> e "알림" time=300ms', ''].join('\n');
const SELECTORS_GONE = '.fl-pause, .fl-rate, .fl-rate-menu, .fl-repeat, .fl-ring, .fl-position, .fl-caption, .fl-transport, .fl-context, .fl-bar, [aria-live]';
const EDGE_TOLERANCE = 1;
const CENTER_TOLERANCE = 2;
const READABLE_TEXT = 11;
// 내려받기, 전체 화면, 확대, 축소, 전체 보기
const ICON_BUTTONS = 5;
const FRAME_TOLERANCE_MS = 80;
// 이동 300ms가 있는 한 번 장면이 끝나는 가짜 시간. 박자 길이는 이동에 머무름이 더해져 6초를 조금 넘는다.
const ONCE_END_MS = 8000;
// 문서를 열기 전에 가짜 시계를 멈춰 두는 시각. 열리는 동안 재생기가 먼저 돌지 않는다.
const FROZEN_AT_MS = 60_000;

const box = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const { left, right, top, bottom } = el.getBoundingClientRect();
  return { left, right, top, bottom };
});
const opacityOf = (page) => page.locator('.fl-view-tools').evaluate((el) => getComputedStyle(el).opacity);
const revealed = (page) => page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-view-tools')).opacity === '1');

describe('player scene ui', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 장면 계약. 재생·일시정지·배속·반복·진행 고리·단계 번호·아래 설명 글이 없고, 키보드나 포인터로 재생을 멈출 수 없다
  test('ui_playback_controls_captions_and_hidden_gestures_are_gone', async () => {
    const { html } = await playerHtml(MULTI);
    await withPage(browser, html, {}, async (page) => {
      assert.equal(await page.locator(SELECTORS_GONE).count(), 0);
      for (const name of ['재생', '일시정지', '배속', '반복']) assert.equal(await page.getByRole('button', { name }).count(), 0, name);
      assert.deepEqual(await page.locator('.fl-foot > *').evaluateAll((els) => els.map((el) => el.className)), ['fl-tabs']);
      // 첫 장면은 이동 300ms 둘에 효과 꼬리 400ms를 더한 1000ms다. 그 안에서 재생 조작이 시계를 멈추지 못하는지 본다.
      await page.clock.runFor(400);
      const before = await readState(page);
      await page.focus('.fl-figure');
      await page.keyboard.press('Space');
      await page.locator('.fl-canvas').click({ position: { x: 40, y: 40 } });
      await page.locator('svg.fl .fl-node').first().hover();
      assert.equal(await page.locator('svg.fl .is-hovered, svg.fl .fl-edge.hover').count(), 0, '도형에 올려도 카드와 선이 켜지지 않는다');
      await page.clock.runFor(200);
      const after = await readState(page);
      assert.equal(after.isPlaying, true);
      assert.ok(after.elapsed > before.elapsed, `${before.elapsed} -> ${after.elapsed}`);
    });
  });

  // 근거: 장면 계약. 도구 막대는 오른쪽 위에 내려받기, 맨 오른쪽 전체 화면 순서이고 이름이 있으며, 마우스는 올리거나 키보드 초점이 오면 서서히 나타난다
  test('ui_toolbar_order_names_and_smooth_reveal_on_hover_and_keyboard_focus', async () => {
    const { html } = await playerHtml(MULTI);
    await withPage(browser, html, {}, async (page) => {
      // 나타남과 사라짐은 CSS 전환(브라우저 시간)이고 waitForFunction이 프레임으로 기다리므로, 문서가 열린 뒤에는 가짜 시계를 다시 흐르게 한다.
      await page.clock.resume();
      const buttons = await page.locator('.fl-view-tools > button').evaluateAll((els) => els.map((el) => ({ name: el.getAttribute('aria-label'), title: el.title, has: Boolean(el.querySelector('svg')), right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left })));
      assert.deepEqual(buttons.map((b) => [b.name, b.title, b.has]), [['HTML 내려받기', 'HTML 내려받기', true], ['전체 화면', '전체 화면', true]]);
      assert.ok(buttons[0].right <= buttons[1].left + EDGE_TOLERANCE, '내려받기가 전체 화면 왼쪽에 있다');
      const canvas = await box(page, '.fl-surface');
      assert.ok(canvas.right - buttons[1].right < 24 && canvas.right - buttons[1].right >= 0, '전체 화면 단추가 맨 오른쪽 위에 있다');
      assert.equal(await page.locator('.fl-zoom').evaluate((el) => getComputedStyle(el).display), 'none');
      assert.equal(await opacityOf(page), '0');
      const transition = await page.locator('.fl-view-tools').evaluate((el) => [getComputedStyle(el).transitionProperty, getComputedStyle(el).transitionDuration]);
      assert.deepEqual([transition[0], transition[1] !== '0s'], ['opacity', true]);
      await page.hover('.fl-canvas');
      await revealed(page);
      await page.mouse.move(0, 0);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-view-tools')).opacity === '0');
      await page.evaluate(() => document.activeElement.blur());
      for (let i = 0; i < 6 && !(await page.evaluate(() => document.activeElement?.closest('.fl-view-tools'))); i++) await page.keyboard.press('Tab');
      await revealed(page);
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'HTML 내려받기');
    });
  });

  // 근거: 장면 계약. 터치(손가락) 입력에서는 도구 막대가 늘 보이고 그림 위에 겹치지 않으며, 움직임 줄이기에서는 전환이 없다
  test('ui_toolbar_is_always_visible_without_overlap_on_touch_and_has_no_transition_when_reduced', async () => {
    const { html } = await playerHtml(MULTI);
    await withPage(browser, html, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } }, async (page) => {
      assert.equal(await opacityOf(page), '1');
      const [tools, svg] = [await box(page, '.fl-view-tools'), await box(page, 'svg.fl')];
      assert.ok(tools.bottom <= svg.top + EDGE_TOLERANCE, `도구 막대(${tools.bottom})가 그림(${svg.top})을 가린다`);
      assert.ok(tools.left >= 0 && tools.right <= 390 + EDGE_TOLERANCE);
    });
    await withPage(browser, html, { reducedMotion: 'reduce' }, async (page) => {
      assert.equal(await page.locator('.fl-view-tools').evaluate((el) => getComputedStyle(el).transitionDuration), '0s');
    });
  });

  // 근거: 장면 계약. 단계가 하나뿐이면 탭이 없고, 둘 이상이면 그림 아래 가운데에 놓인다(본문에 삽입한 재생기도 같다)
  test('ui_single_scene_hides_tabs_and_multiple_scenes_center_below_the_drawing_including_embed', async () => {
    for (const source of [SINGLE, NO_TIME]) {
      await withPage(browser, (await playerHtml(source)).html, {}, async (page) => {
        assert.equal((await readState(page)).tabsHidden, true);
        assert.equal(await page.getByRole('tab').first().isVisible(), false);
      });
    }
    const { html } = await playerHtml(MULTI);
    const geometry = (scope) => scope.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const [tabs, figure, canvas] = [rect('.fl-tabs'), rect('.fl-figure'), rect('.fl-canvas')];
      return { offset: (tabs.left + tabs.right) / 2 - (figure.left + figure.right) / 2, below: tabs.top - canvas.bottom, embedded: document.documentElement.classList.contains('embedded') };
    });
    await withPage(browser, html, {}, async (page) => {
      const shown = await geometry(page);
      assert.ok(Math.abs(shown.offset) <= CENTER_TOLERANCE && shown.below >= -EDGE_TOLERANCE, JSON.stringify(shown));
      assert.equal(shown.embedded, false);
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    await page.setContent('<iframe style="width: 800px; height: 700px; border: 0"></iframe>');
    const frame = page.frames()[1];
    await frame.setContent(html);
    const embedded = await geometry(frame);
    assert.ok(Math.abs(embedded.offset) <= CENTER_TOLERANCE && embedded.below >= -EDGE_TOLERANCE && embedded.embedded, JSON.stringify(embedded));
    assert.equal(await frame.locator('.fl-view-tools > button').count(), 2);
    await page.close();
  });

  // 근거: 내려받기 계약. 정본 템플릿을 내려받고, 내려받은 파일과 다시 내려받은 파일이 바이트까지 같으며, 열면 첫 장면이다. 바깥 요청이 없다
  test('download_exports_the_canonical_template_offline_and_re_download_is_byte_stable', async () => {
    const { html, timeline } = await playerHtml(DOWNLOAD, { probe: false });
    const [hop] = timeline.segs[0].hops;
    await withFolder(async (folder) => {
      const original = join(folder, 'original.html');
      writeFileSync(original, html);
      const requests = [];
      // cost: time O(page), heap O(page), stack O(1), io page
      // vars: page = 페이지 하나를 여는 비용
      // basis: estimate
      const open = async (path, options) => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, ...options });
        page.on('request', (request) => requests.push(request.url()));
        page.on('pageerror', (error) => assert.fail(error.message));
        await page.clock.install({ time: 0 });
        await page.clock.pauseAt(FROZEN_AT_MS);
        await page.goto(`file://${path}`);
        return page;
      };
      // cost: time O(n), heap O(n), stack O(1), io 1
      // vars: n = 문서 크기
      // basis: estimate
      const save = async (page, name) => {
        const pending = page.waitForEvent('download');
        await page.getByRole('button', { name: 'HTML 내려받기', exact: true }).click();
        const download = await pending;
        const path = join(folder, name);
        await download.saveAs(path);
        return { path, filename: download.suggestedFilename() };
      };
      // 지금 장면, 시간, 전체 화면, 확대를 바꿔 놓은 뒤에 내려받아도 정본 그대로여야 한다.
      const first = await open(original);
      await first.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
      await first.getByRole('tab', { name: 'Two', exact: true }).click();
      await first.clock.runFor(1500);
      await first.getByRole('button', { name: '전체 화면', exact: true }).click();
      await first.getByRole('button', { name: '확대', exact: true }).click();
      const one = await save(first, 'one.html');
      await first.close();
      assert.equal(one.filename, 'scene.html');
      assert.ok(readFileSync(one.path).equals(readFileSync(original)), '내려받은 파일이 원본과 다르다');

      const second = await open(one.path);
      assert.equal(await second.locator('.fl-tabs button.on').textContent(), 'One');
      assert.equal(await second.evaluate(() => document.querySelector('.fl-figure').classList.contains('full')), false);
      await second.clock.runFor((hop.at ?? 0) + hop.ms / 2);
      assert.equal(await second.evaluate(() => [...document.querySelectorAll('svg.fl .fl-packet')].some((el) => el.style.opacity !== '0')), true, '첫 장면 설정(한 번 재생)이 살아 있다');
      const fonts = await second.evaluate(async () => {
        await document.fonts.ready;
        return { count: document.fonts.size, loaded: [...document.fonts].filter((font) => font.status === 'loaded').length, icons: document.querySelectorAll('.fl-view-tools button svg').length };
      });
      assert.ok(fonts.count > 0 && fonts.loaded > 0 && fonts.icons === ICON_BUTTONS, JSON.stringify(fonts));
      const two = await save(second, 'two.html');
      await second.close();
      const third = await open(two.path);
      const three = await save(third, 'three.html');
      await third.close();
      for (const path of [two.path, three.path]) assert.ok(readFileSync(path).equals(readFileSync(original)), `${path}: 다시 내려받은 파일이 달라졌다`);
      assert.deepEqual([statSync(one.path).size, statSync(two.path).size, statSync(three.path).size], [statSync(original).size, statSync(original).size, statSync(original).size]);
      assert.deepEqual(requests.filter((url) => !/^(file|data|blob):/.test(url)), [], '바깥 요청이 있다');
    });
  });

  // 근거: 반응형 계약. 320px 이상에서 도구 막대와 탭이 잘리지 않고, 많은 탭은 줄바꿈되며 문서가 가로로 넘치지 않는다
  test('ui_320_390_430_keep_toolbar_and_wrapped_tabs_inside_the_screen', async () => {
    const { html } = await playerHtml(LONG_TABS);
    for (const options of [{}, { hasTouch: true, isMobile: true }]) for (const width of [320, 390, 430]) {
      await withPage(browser, html, { ...options, viewport: { width, height: 800 } }, async (page) => {
        const fit = await page.evaluate(() => {
          const rects = (selector) => [...document.querySelectorAll(selector)].map((el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, clipped: el.scrollWidth > el.clientWidth + 1 }));
          return { overflow: document.documentElement.scrollWidth - innerWidth, tools: rects('.fl-view-tools, .fl-view-tools > button'), tabs: rects('.fl-tabs, .fl-tabs button') };
        });
        assert.ok(fit.overflow <= EDGE_TOLERANCE, `${width}px: 문서가 ${fit.overflow}px 넘친다`);
        for (const item of [...fit.tools, ...fit.tabs]) assert.ok(item.left >= -EDGE_TOLERANCE && item.right <= width + EDGE_TOLERANCE && !item.clipped, `${width}px: ${JSON.stringify(item)}`);
      });
    }
  });

  // 근거: 반응형 계약. 읽을 수 있는 글자 크기로 들어가지 않는 넓은 판은 글자를 줄이지 않고 그 판 구역 안에서 가로로 민다. 문서 전체는 넘치지 않는다
  test('ui_wide_figure_at_320_pans_inside_its_panel_without_shrinking_text_below_readable', async () => {
    const { html } = await playerHtml(WIDE);
    await withPage(browser, html, { viewport: { width: 320, height: 800 } }, async (page) => {
      const fit = await page.evaluate(() => {
        const panel = document.querySelector('.dp-panel');
        const sizes = [...panel.querySelectorAll('svg.fl text')].map((el) => parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a);
        return { pan: panel.scrollWidth - panel.clientWidth, outer: document.documentElement.scrollWidth - innerWidth, min: Math.min(...sizes), hint: document.querySelector('.fl-scroll-hint').hidden, focusable: panel.tabIndex, role: panel.getAttribute('role'), minWidth: panel.querySelector('svg').getBoundingClientRect().width };
      });
      assert.ok(fit.pan > 0 && fit.outer <= EDGE_TOLERANCE && fit.min >= READABLE_TEXT - 0.01 && !fit.hint && fit.focusable === 0 && fit.role === 'region', JSON.stringify(fit));
      await page.evaluate(() => document.querySelector('.dp-panel').scrollTo(1e6, 0));
      assert.ok((await page.evaluate(() => document.querySelector('.dp-panel').scrollLeft)) > 0);
    });
  });

  // 근거: 반응형 계약. 판이 여럿인 혼합 그림은 320px에서 판마다 따로 가로로 밀린다. 글자는 읽을 수 있는 크기보다 작아지지 않고, 판이 화면에 들어가면 밀리지 않으며, 문서는 넘치지 않는다
  test('ui_mixed_panels_at_320_scroll_per_panel_keep_readable_text_and_never_overflow_the_page', async () => {
    const { html, result } = await playerHtml(MIXED);
    assert.equal(result.scene.panels.length, 3);
    for (const width of [320, 390, 1200]) {
      await withPage(browser, html, { viewport: { width, height: 800 } }, async (page) => {
        // 판의 읽을 수 있는 폭은 지금 그려진 배치(좁은 화면이면 좁은 배치)의 판 정보다.
        const fit = await page.evaluate(() =>
          [...document.querySelectorAll('.dp-panel')].map((panel, i) => {
            const sizes = [...panel.querySelectorAll('svg.fl text')].map((el) => parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a);
            return { view: panel.dataset.view, client: panel.clientWidth, scroll: panel.scrollWidth, svg: panel.querySelector('svg').getBoundingClientRect().width, min: Math.min(...sizes), minWidth: window.probe.data.panels[i].minWidth };
          }),
        );
        const outer = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(outer <= EDGE_TOLERANCE, `${width}px: 문서가 ${outer}px 넘친다`);
        fit.forEach((item) => {
          assert.ok(item.min >= READABLE_TEXT - 0.01, `${width}px ${item.view}: 글자 ${item.min}px`);
          assert.ok(item.svg >= item.minWidth - 0.5, `${width}px ${item.view}: 판 폭 ${item.svg}가 읽을 수 있는 폭 ${item.minWidth}보다 좁다`);
          // 판은 읽을 수 있는 폭이 컨테이너보다 넓을 때만 판 안에서 밀린다. 들어가면 밀리지 않는다.
          assert.equal(item.scroll > item.client + 1, item.minWidth > item.client + 1, `${width}px ${item.view}: 밀림이 폭과 맞지 않는다 ${JSON.stringify(item)}`);
        });
        if (width === 1200) for (const item of fit) assert.ok(item.scroll <= item.client + 1, `${item.view}: 넓은 화면에서 판이 밀린다`);
        // 판이 밀려도 한 판만 밀린다. 다른 판의 위치는 그대로다.
        if (width === 320) {
          await page.evaluate(() => document.querySelector('.dp-panel').scrollTo(1e6, 0));
          const left = await page.evaluate(() => [...document.querySelectorAll('.dp-panel')].map((panel) => panel.scrollLeft));
          assert.ok(left[0] > 0 && left[1] === 0 && left[2] === 0, JSON.stringify(left));
        }
      });
    }
  });

  // 근거: 장면 계약. 장면 설정이 없는 그림은 정지이고 시계가 흐르지 않으며, 시간 흐름이 없는 그림도 도구 막대를 쓸 수 있다
  test('ui_figure_without_scene_settings_is_static_and_keeps_the_toolbar', async () => {
    const { html } = await playerHtml(STATIC_ONE);
    await withPage(browser, html, {}, async (page) => {
      const first = await readState(page);
      assert.deepEqual([first.isPlaying, first.ended], [false, true]);
      await page.clock.runFor(2000 + FRAME_TOLERANCE_MS);
      assert.deepEqual(await readState(page), first, '정지 장면은 시간이 흘러도 움직이지 않는다');
      assert.equal(await page.locator('.fl-view-tools > button').count(), 2);
    });
    await withPage(browser, (await playerHtml(SINGLE)).html, {}, async (page) => {
      await page.clock.runFor(ONCE_END_MS);
      const state = await readState(page);
      assert.deepEqual([state.isPlaying, state.ended], [false, true], '한 번 장면은 끝나면 멈춘다');
    });
    await withPage(browser, (await playerHtml(NO_TIME)).html, {}, async (page) => {
      assert.deepEqual([(await readState(page)).isPlaying, await page.locator('.fl-view-tools > button').count()], [false, 2]);
    });
  });
});
