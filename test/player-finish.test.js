// 재생 끝에서는 결과를 유지하고 명시한 반복(`mode=loop`)만 처음으로 돌아간다(#162, docs/design/playback.md 장면 들어가기와 끝).
// 재생기에는 재생·반복 단추와 위치 글이 없다. 장면 탭이 단계를 고르고 장면의 `mode=`가 끝난 뒤를 정한다. Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { sliceTimeline } from '../src/svg.js';
import { FRAME_MS, launchChrome, readState, withPage } from './chrome.js';
import { FLOW, playerHtml } from './player-compiled.js';

// 가짜 시계를 맞출 때 프레임 한 칸 오차를 허용한다
const FRAME_SLACK = 2 * FRAME_MS;

describe('player finish', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(page), heap O(page), stack O(1), io page
  // vars: page = 페이지 하나를 여는 비용
  // basis: estimate
  // 원본의 재생기를 가짜 시계로 열어 body(page, { total(첫 장면 표시 길이), result })를 돌린다.
  async function withPlayer(source, body) {
    const { html, result } = await playerHtml(source, { baseDir: 'test' });
    const total = sliceTimeline(result.timeline, 0, result.scene).presentation[0];
    await withPage(browser, html, { viewport: { width: 1400, height: 900 } }, (page) => body(page, { total, result }));
  }

  const visible = (page) => page.locator('[data-v][opacity="1"]').allTextContents();

  // 근거: #162, playback.md 장면 "한 번 재생하는 장면은 끝나면 마지막 모습과 값을 유지하고 다음 장면으로 넘어가지 않는다. 지금 장면의 탭을 다시 누르면 아무 일도 없고 시계도 되감기지 않는다. 떠났다가 돌아오면 처음 값에서 다시 시작한다"
  test('player_once_scene_finishes_holds_its_values_and_replays_only_when_entered_again', async () => {
    await withPlayer(FLOW, async (page, { total }) => {
      await page.clock.runFor(total + 300);
      const end = await readState(page);
      assert.equal(end.ended, true, '한 번 재생하는 장면이 끝났다');
      assert.equal(end.scene, 0, '끝나도 다음 장면으로 넘어가지 않는다');
      const endValues = await visible(page);
      assert.ok(endValues.length > 0);

      await page.clock.runFor(total * 2);
      assert.deepEqual(await visible(page), endValues, '끝난 뒤 시간이 흘러도 값이 그대로다');
      assert.equal((await readState(page)).ended, true);

      await page.getByRole('tab', { name: 'First' }).click();
      const pressedAgain = await readState(page);
      assert.equal(pressedAgain.ended, true, '지금 장면의 탭을 다시 눌러도 시계가 되감기지 않는다');
      assert.deepEqual(await visible(page), endValues);

      await page.getByRole('tab', { name: 'Last' }).click();
      const second = await readState(page);
      assert.deepEqual([second.scene, second.ended], [1, false], '다른 장면에 들어서면 그 장면이 처음부터 재생된다');
      await page.getByRole('tab', { name: 'First' }).click();
      const again = await readState(page);
      assert.deepEqual([again.scene, again.ended], [0, false], '떠났다가 돌아오면 다시 재생한다');
      assert.ok(again.d <= FRAME_SLACK, `처음 시각에서 시작한다(${again.d}ms)`);
    });
  });

  // 근거: #162. 되돌아가는 반복은 장면 머리의 `mode=loop`만 맡는다(기본은 한 번). 반복하는 장면은 끝나지 않고 처음 값에서 다시 시작한다
  test('player_repeat_is_the_explicit_scene_mode_and_a_loop_scene_never_finishes', async () => {
    await withPlayer(FLOW.replace('scene "First" mode=once', 'scene "First" mode=loop'), async (page, { total }) => {
      await page.clock.runFor(total * 2.5);
      const state = await readState(page);

      assert.equal(state.ended, false, '반복하는 장면은 끝나지 않는다');
      assert.equal(state.scene, 0);
      assert.ok(state.d < total, `한 바퀴를 돈 장면 안 시각 ${state.d}ms는 장면 길이 ${total}ms보다 짧다`);
    });
    await withPlayer(FLOW, async (page, { total }) => {
      await page.clock.runFor(total * 2.5);
      assert.equal((await readState(page)).ended, true, '`mode`를 적지 않거나 once이면 한 번만 재생한다');
    });
  });
});
