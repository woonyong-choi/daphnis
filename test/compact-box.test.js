// 상자 그림은 좁은 화면에서도 같은 축으로 비교하고, 중앙값 글자를 도형과 겹치지 않게 읽는다. 좁은 화면은 글자를 줄이지 않고 이름과 값을 줄 바꿔 다시 놓은 좁은 배치를 쓴다(docs/design/charts.md 좁은 화면).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchChrome, withPage } from './chrome.js';
import { isReadable, resizeTo, stateOf } from './mobile-chart.js';
import { playerHtml } from './player-compiled.js';

const SOURCE = [
  'daphnis 2',
  'chart latency "응답 시간 분포" box {',
  '  x "시간(ms)"',
  '  row "조회" min=5 q1=12 median=22 q3=40 max=90',
  '  row "검색" min=80 q1=150 median=230 q3=400 max=900',
  '  row "집계" min=200 q1=450 median=610 q3=900 max=1500',
  '}',
  '',
].join('\n');
const LOG_SOURCE = [
  'daphnis 2',
  'chart latency "긴 항목 이름이 있는 응답 시간 분포" box {',
  '  x "시간(ms)"',
  '  scale log',
  '  rule 100 "목표 응답 시간"',
  '  row "캐시에 저장된 결과를 찾은 요청" min=1 q1=2 median=4 q3=8 max=16',
  '  row "다른 서버를 거쳐 새로 조회한 요청" min=10 q1=20 median=40 q3=80 max=1000',
  '}',
  'scene "분포" mode=once',
  '  light latency "캐시에 저장된 결과를 찾은 요청"',
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
// vars: v = 원본과 화면 폭 조합 수, page = 브라우저 페이지 비용
// basis: estimate
test('compact_box_keeps_names_medians_and_rules_readable_without_text_collisions', async () => {
  for (const source of [SOURCE, LOG_SOURCE]) {
    const { html } = await playerHtml(source);
    await withPage(browser, html, { viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' }, async (page) => {
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 390, 430]) {
        await resizeTo(page, width);
        const state = await stateOf(page);

        assert.equal(state.pageOverflow <= 0, true, JSON.stringify({ width, state }));
        assert.ok(isReadable(state.minSize), `${width}px: 가장 작은 글자 ${state.minSize}px`);
        assert.deepEqual(state.overlaps, [], `${width}px`);
        assert.deepEqual(state.values, source === SOURCE ? ['중앙값 22', '중앙값 230', '중앙값 610'] : ['중앙값 4', '중앙값 40']);
        // 공통 기준선은 모든 행을 지난다. 좁은 배치가 행마다 끊어 그려도 조각은 모두 같은 자리에 있다.
        if (source === LOG_SOURCE) {
          assert.ok(state.rules >= 1, '기준선이 있다');
          assert.equal(state.ruleLefts.length, 1, `${width}px: 기준선 조각이 모두 같은 자리다 ${state.ruleLefts}`);
        }
        assert.equal(state.panelScrolls, false, `${width}px: 좁은 배치가 이름과 값을 줄 바꿔 판 안에 넣는다(글자를 줄이지 않는다)`);
      }
    });
  }
});
