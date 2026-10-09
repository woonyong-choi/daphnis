// 좁은 화면에서 막대 끝값을 읽고, 폭을 바꿔도 고른 장면을 유지한다. 좁은 화면은 글자를 줄이지 않고 이름과 값을 줄 바꿔 다시 놓은 좁은 배치를 쓴다(docs/design/charts.md 좁은 화면, playback.md 판). 좁히지 못하는 입력만 판 안에서 옆으로 민다.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchChrome, withPage } from './chrome.js';
import { isReadable, resizeTo, stateOf } from './mobile-chart.js';
import { playerHtml } from './player-compiled.js';

const SOURCE = [
  'daphnis 2',
  'chart accuracy "배포 전후 정확도" bar {',
  '  x "정확도(%)"',
  '  series before "배포 전"',
  '  series after "배포 후"',
  '  row "검색" before=70.3 after=91.4',
  '  row "추천" before=62 after=88',
  '}',
  'scene "전" mode=once',
  '  reveal accuracy.before',
  'scene "후" mode=once',
  '  reveal accuracy.before',
  '  reveal accuracy.after',
  '',
].join('\n');

let browser;
before(async () => {
  browser = await launchChrome();
});
after(async () => {
  await browser.close();
});

// cost: time O(v·page), heap O(page), stack O(1), io v
// vars: v = 화면 폭 수, page = 브라우저 페이지 비용
// basis: estimate
test('compact_bar_keeps_all_values_readable_and_preserves_the_selected_scene_across_resize', async () => {
  const { html } = await playerHtml(SOURCE);
  await withPage(browser, html, { viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' }, async (page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('tab', { name: '후', exact: true }).click();
    for (const width of [320, 390, 430, 1280, 320]) {
      await resizeTo(page, width);
      const state = await stateOf(page);

      assert.equal(state.pageOverflow <= 0, true, JSON.stringify({ width, state }));
      assert.ok(isReadable(state.minSize), `${width}px: 가장 작은 글자 ${state.minSize}px`);
      assert.ok(state.values.includes('91.4') && state.values.includes('70.3'), `${width}px: ${state.values}`);
      assert.deepEqual(state.overlaps, [], `${width}px: 글자끼리 겹치지 않는다`);
      assert.equal(state.scene, 1, `${width}px: 고른 장면이 유지된다`);
      if (state.panelScrolls) assert.equal(state.panelIsReachable, true, `${width}px: 옆으로 미는 판은 키보드로 닿는다`);
    }
    assert.equal((await stateOf(page)).panelScrolls, false, '320px에서 이 차트는 좁은 배치로 판 안에 들어가 옆으로 밀 필요가 없다');
  });
});
