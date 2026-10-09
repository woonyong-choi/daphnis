// 폭 전환은 그림만 바꾸고 같은 사건 시계·선택·값·초점을 유지해야 한다(docs/design/layout.md 좁은 화면, playback.md 화면 배치와 좁은 화면).
// 재생 단추와 배속, 반복 메뉴가 없어 시계는 가짜 시계로만 흐르고 장면 탭이 단계를 고른다. Chrome이나 WebKit이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { launchChrome, readState } from './chrome.js';
import { openPaused } from './mobile-chart.js';
import { playerHtml } from './player-compiled.js';

const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
const TRACK = 'track a -> b -> c time=4s legs="1s, 3s" set="nb+1@b, nc+1@c"';
// 둘째 장면은 2배속이다. 배속이 있어도 폭 전환이 시계를 바꾸지 않는다.
const SOURCE = `daphnis 2\nbox a "요청"\nbox b "처리"\nbox c "저장"\nvalue nb "처리 수" on=b\nvalue nc "저장 수" on=c\na -> b\nb -> c\nscene "전달" mode=once for=8s\n  ${TRACK}\nscene "재시도" mode=once speed=2 for=8s\n  ${TRACK}\n`;
// 좁은 배치가 판을 좁힌 너비(px). 넓은 배치의 판은 이보다 넓다(docs/design/charts.md 좁은 화면).
const NARROW_PANEL_MAX = 272;
const WIDE = 1280;
const SWITCH_WIDTHS = [320, 390, 430];
// 픽셀 반올림 오차 허용(px). WebKit의 SVG 화면 변환 반올림 오차는 0.01px까지만 허용한다.
const PX_SLACK = 0.01;
const MIN_TEXT_PX = 11;

// cost: time O(s), heap O(s), stack O(1), io 2
// vars: s = SVG 원소 수
// basis: estimate
// 재생기의 지금 상태 한 장: 시계(장면, 경과, 재생 중, 끝), 값 글자, 고른 탭, 중복 id, 선 모양, 점 수, 초점, 배치(판 폭), 넘침.
async function snapshot(page) {
  const state = await readState(page);
  const dom = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    const panel = document.querySelector('.dp-panel');
    return {
      duplicateIds: ids.length - new Set(ids).size,
      paths: window.probe.stage.paths.map((path) => path.getAttribute('d')),
      focused: document.activeElement.id,
      panelWidth: Number.parseFloat(getComputedStyle(panel).getPropertyValue('--panel-w')),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  return { clock: { scene: state.scene, elapsed: state.elapsed, isPlaying: state.isPlaying, ended: state.ended, d: state.d }, values: state.values, selected: state.selected, packets: state.packets, ...dom };
}

// cost: time O(s), heap O(s), stack O(1), io 2
// vars: s = SVG 원소 수
// basis: estimate
// 화면 폭을 바꾸고 재생기가 배치를 고르도록 resize 알림을 낸 뒤의 상태.
async function resize(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  return snapshot(page);
}

const isNarrow = (shot) => shot.panelWidth <= NARROW_PANEL_MAX;

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 검사할 상태 수
// basis: estimate
function assertSameState(before, after) {
  for (const key of ['clock', 'values', 'selected', 'packets', 'focused']) assert.deepEqual(after[key], before[key], key);
  assert.equal(after.duplicateIds, 0);
  assert.equal(after.overflow, false);
}

// cost: time O(s), heap O(s), stack O(1), io 1
// vars: s = SVG 원소 수
// basis: estimate
async function verifySwitch(page, width) {
  await page.getByRole('tab').nth(1).click();
  await page.clock.runFor(1200);
  await page.locator('#n-1').focus();
  const wide = await snapshot(page);
  assert.equal(wide.focused, 'n-1');
  assert.equal(isNarrow(wide), false);
  assert.equal(wide.clock.scene, 1);
  const narrow = await resize(page, width);
  assertSameState(wide, narrow);
  assert.equal(isNarrow(narrow), true, `${width}px: 좁은 배치를 쓴다(판 폭 ${narrow.panelWidth})`);
  assert.notDeepEqual(narrow.paths, wide.paths, '좁은 배치는 선 모양이 다르다');
  assert.equal(narrow.values[0], '1');
  const playing = await snapshot(page);
  assertSameState(playing, await resize(page, WIDE));
  await page.clock.runFor(100);
  const advanced = await snapshot(page);
  assert.ok(advanced.clock.elapsed > playing.clock.elapsed, '폭을 오가도 시계는 이어서 흐른다');
  const paused = await snapshot(page);
  await page.clock.runFor(100);
  assertSameState({ ...paused, clock: advanced.clock }, { ...(await resize(page, width)), clock: advanced.clock });
}

// cost: time O(page), heap O(page), stack O(1), io 1
// vars: page = 브라우저 페이지 비용
// basis: estimate
async function verifyFullscreen(page) {
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
  const before = await snapshot(page);
  await page.locator('.fl-full').click();
  const full = await resize(page, WIDE);
  assert.equal(isNarrow(full), true, '전체 화면에서는 현재 배치를 고정한다');
  assertSameState({ ...before, focused: full.focused, clock: full.clock }, full);
  await page.locator('.fl-full').click();
  const after = await snapshot(page);
  assert.equal(isNarrow(after), false, '돌아오면 다시 폭을 판정한다');
  assertSameState({ ...before, focused: after.focused, clock: after.clock }, after);
}

for (const [name, launch] of ENGINES) {
  // cost: time O(v·page), heap O(page), stack O(1), io v
  // vars: v = 화면 조건 수, page = 브라우저 페이지 비용
  // basis: estimate
  test(`${name}_responsive_player_preserves_clock_values_selection_and_live_ids`, async () => {
    const { html } = await playerHtml(SOURCE, { baseDir: 'test' });
    const browser = await launch();
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of SWITCH_WIDTHS) {
        const { page, errors } = await openPaused(browser, html, { viewport: { width: WIDE, height: 900 }, colorScheme });
        await verifySwitch(page, width);
        await verifyFullscreen(page);
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
}

// cost: time O(s), heap O(s), stack O(1), io 1
// vars: s = SVG 원소 수
// basis: estimate
// 좁은 화면 판이 읽을 만한지: 페이지는 넘치지 않고 글자는 줄지 않으며 태그가 넘치지 않고, 판 안에서 옆으로 밀어야 할 때만 안내를 보인다(layout.md: 공간이 부족하면 그림 영역만 가로로 스크롤하고 안내를 보인다).
async function assertCanvasFits(page, label) {
  const fit = await page.evaluate(() => {
    const canvas = document.querySelector('.fl-canvas');
    const svgs = [...canvas.querySelectorAll('svg.fl')];
    const minText = Math.min(...svgs.flatMap((svg) => [...svg.querySelectorAll('text')]).map((el) => parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a));
    const clippedTags = svgs.flatMap((svg) => [...svg.querySelectorAll('.tag')]).filter((tag) => {
      const text = tag.getBBox();
      const box = tag.previousElementSibling.getBBox();
      return text.x < box.x || text.y < box.y || text.x + text.width > box.x + box.width || text.y + text.height > box.y + box.height;
    }).map((tag) => tag.textContent);
    const panelScrolls = [...canvas.querySelectorAll('.dp-panel')].some((panel) => panel.scrollWidth - panel.clientWidth > 1);
    return { inner: canvas.scrollWidth - canvas.clientWidth, outer: document.documentElement.scrollWidth - innerWidth, minText, hint: document.querySelector('.fl-scroll-hint').hidden, clippedTags, panelScrolls };
  });
  const scrolls = fit.inner > 1 || fit.panelScrolls;
  assert.ok(fit.outer <= 1 && fit.minText >= MIN_TEXT_PX - PX_SLACK && !fit.clippedTags.length, `${label}: ${JSON.stringify(fit)}`);
  assert.equal(fit.hint, !scrolls, `${label}: 옆으로 밀어야 할 때만 안내를 보인다 ${JSON.stringify(fit)}`);
}

// 좁은 화면에서 읽히는지 보는 예제. 그래프, 흐름, 클래스, 상태, 순서, 큐, API 카드가 섞인다.
const SIBLINGS = ['architecture', 'flow', 'class', 'state', 'queue', 'api', 'memory', 'integration', 'sequence'];

for (const [name, launch] of ENGINES) {
  // cost: time O(n·v·page), heap O(page), stack O(1), io n·v
  // vars: n = 예제 수, v = 화면 조건 수, page = 브라우저 페이지 비용
  // basis: estimate
  test(`${name}_narrow_sibling_figures_fit_while_playing_and_after_a_scene_change`, async () => {
    const browser = await launch();
    try {
      for (const figure of SIBLINGS) {
        const source = readFileSync(new URL(`../examples/${figure}.dap`, import.meta.url), 'utf8');
        const html = await toHtml(await buildFigure(source, { baseDir: 'examples' }), figure);
        for (const colorScheme of ['light', 'dark']) for (const width of SWITCH_WIDTHS) {
          const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme });
          const label = `${figure} ${colorScheme} ${width}px`;
          await assertCanvasFits(page, label);
          await page.clock.runFor(4000);
          await assertCanvasFits(page, `${label} 재생 중`);
          await page.getByRole('tab').last().click();
          await assertCanvasFits(page, `${label} 마지막 장면`);
          assert.deepEqual(errors, [], label);
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  });
}
