// 차트 재생기: 차트의 CSS 움직임(막대 자람, 값 글자 나타남)이 장면의 시계를 따르는지(docs/playback.md 장면).
// 재생 단추, 배속 메뉴, 진행 고리는 없어졌다. 일시정지는 문서 가림, 배속은 장면의 `speed=`, 단계 이동은 장면 탭이 맡으므로 같은 계약을 그 길로 실제 Chrome의 Web Animations 상태에서 잰다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { launchChrome, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';

// 장면 One은 2배속으로 계열 a가 자라고, 장면 Two는 a가 자란 뒤 b가 드러난다.
const SOURCE = ['daphnis 2', 'chart c "제목" bar {', '  x "Value(ms)"', '  series a "A"', '  series b "B"', '  row "R" a=1 b=2', '}', 'scene "One" mode=once speed=2', '  reveal c.a', 'scene "Two" mode=once', '  reveal c.a', '  reveal c.b', ''].join('\n');
const SAMPLE_MS = 300;

// 차트 움직임(CSS 애니메이션)의 지금 상태와 계열이 숨었는지.
const chartState = (page) =>
  page.evaluate(() => ({
    animations: [...document.querySelector('svg.fl').getAnimations({ subtree: true })].filter((a) => a.animationName?.startsWith('chart-')).map((a) => ({ name: a.animationName, playState: a.playState, time: a.currentTime })),
    hidden: [...document.querySelectorAll('[data-chart="c"] [class*="cs-"]')].map((el) => [el.getAttribute('class').match(/cs-\d+/)[0], el.classList.contains('hidden')]),
  }));

describe('chart player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 이슈 #77, playback.md 장면: 차트 움직임은 브라우저 시계를 따로 따르지 않고 장면 시각에 멈춰 놓이며, 장면의 speed가 논리 시각을 배로 센다
  test('player_chart_motion_sits_at_the_scene_time_and_the_authored_speed_scales_it', async () => {
    const { html } = await playerHtml(SOURCE);
    await withPage(browser, html, {}, async (page) => {
      const start = await chartState(page);
      assert.ok(start.animations.length >= 2, `움직임 ${start.animations.length}개`);
      assert.deepEqual(start.animations.map((a) => a.time), start.animations.map(() => 0));

      await page.clock.runFor(SAMPLE_MS);
      const state = await readState(page);
      const moving = await chartState(page);

      assert.equal(state.phase, 'play');
      assert.ok(state.elapsed > 0 && state.elapsed <= SAMPLE_MS);
      assert.equal(state.segElapsed, state.elapsed * 2, '장면의 speed=2가 논리 시각을 두 배로 센다');
      assert.ok(moving.animations.every((a) => a.playState === 'paused'), '움직임은 늘 멈춰 두고 시각만 놓는다');
      assert.ok(moving.animations.every((a) => a.time === state.segElapsed), moving.animations.map((a) => a.time).join());
    });
  });

  // 근거: playback.md 장면 once: 끝나면 마지막 모습이다. 움직임이 남지 않고 드러낸 계열이 모두 보인다. 문서를 가리면 시계가 멈춘다
  test('player_once_scene_ends_with_no_chart_motion_left_and_a_hidden_document_freezes_it', async () => {
    const { html } = await playerHtml(SOURCE);
    await withPage(browser, html, {}, async (page) => {
      await page.clock.runFor(SAMPLE_MS);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenAt = await chartState(page);
      const frozenAt = await readState(page);
      await page.clock.runFor(SAMPLE_MS);
      const stillHidden = await chartState(page);
      assert.ok(hiddenAt.animations.every((a) => a.time > 0), '가리기 전에 움직임이 진행했다');
      assert.equal((await readState(page)).elapsed, frozenAt.elapsed, '가려진 동안 장면 시계가 멈춘다');
      assert.deepEqual(stillHidden.animations.map((a) => a.time), hiddenAt.animations.map((a) => a.time), '문서가 가려진 동안 움직임이 멈춰 있다');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await page.clock.runFor(5000);
      const end = await readState(page);
      const final = await chartState(page);

      assert.deepEqual([end.phase, end.ended], ['final', true]);
      assert.deepEqual(final.animations, []);
      assert.equal(final.hidden.some(([, isHidden]) => isHidden), false);
    });
  });

  // 근거: playback.md 장면: 다른 장면으로 가면 새 장면이 시간 0에서 시작하고 아직 드러나지 않은 계열이 숨는다. 선택한 장면의 배속과 멈춤 상태가 그대로 따른다
  test('player_scene_change_restarts_the_chart_motion_and_hides_series_not_yet_revealed', async () => {
    const { html } = await playerHtml(SOURCE);
    await withPage(browser, html, {}, async (page) => {
      await page.getByRole('tab', { name: 'Two', exact: true }).click();
      const restarted = await chartState(page);
      const entered = await readState(page);

      assert.equal(entered.scene, 1);
      assert.equal(entered.elapsed, 0);
      assert.ok(restarted.animations.every((a) => a.time === 0), restarted.animations.map((a) => a.time).join());
      assert.deepEqual(restarted.hidden.filter(([name]) => name === 'cs-1').map(([, isHidden]) => isHidden), [true, true], '아직 드러나지 않은 계열 b가 숨는다');

      await page.clock.runFor(SAMPLE_MS);
      const later = await readState(page);
      const moving = await chartState(page);
      assert.equal(later.segElapsed, later.elapsed, '장면 Two는 1배속이다');
      assert.ok(moving.animations.every((a) => a.time === later.segElapsed));

      await page.getByRole('tab', { name: 'One', exact: true }).click();
      await page.getByRole('tab', { name: 'Two', exact: true }).click();
      const again = await chartState(page);
      assert.ok(again.animations.every((a) => a.time === 0), '다시 들어서면 처음부터다');
    });
  });
});
