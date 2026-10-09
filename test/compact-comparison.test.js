// 가로 비교 차트는 좁은 화면에서도 부호, 계열 값, 합계가 겹치지 않고 읽히며 페이지를 넘치지 않고, 장면을 바꿔도 제목이 움직이지 않는다.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchChrome, withPage } from './chrome.js';
import { isReadable, resizeTo, stateOf } from './mobile-chart.js';
import { playerHtml } from './player-compiled.js';

const doc = (type, lines, tail) => `daphnis 2\nchart c "제목" ${type} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n${tail}`;
const SCENES = (series) => ['scene "하나" mode=once', ...series.map((name) => `  reveal c.${name}`), 'scene "둘" mode=once', ...series.map((name) => `  reveal c.${name}`), ''].join('\n');
const SOURCES = {
  dumbbell: doc('dumbbell', ['x "토큰 수(개)"', 'series base "기억 없음" role=compare', 'series ours "기억 붙임" role=main', 'row "질문 하나" base=120000 ours=31000'], SCENES(['base', 'ours'])),
  'dumbbell-long': doc('dumbbell', ['x "토큰 수(개)"', 'series base "이전에 처리한 여러 요청의 결과를 아직 저장하지 않은 상태" role=compare', 'series ours "이전에 처리한 여러 요청의 결과를 다시 활용하는 상태" role=main', 'row "질문 하나" base=120000 ours=31000'], SCENES(['base', 'ours'])),
  difference: doc('difference', ['x "차이(%p)"', 'decimals 1', 'series d "차이"', 'rule -10 "기준선"', 'row "음수 쪽" d=-6.4 d.low=-9.8 d.high=-3', 'row "양수 쪽" d=3.2 d.low=-0.4 d.high=6.8'], SCENES(['d'])),
  stacked: doc('stacked', ['x "요청 시간(ms)"', 'series queue "대기"', 'series run "실행"', 'series io "입출력"', 'row "요청 A" queue=10 run=65 io=25', 'row "요청 B" queue=20 run=50 io=30'], SCENES(['queue', 'run', 'io'])),
};

let browser;
before(async () => {
  browser = await launchChrome();
});
after(async () => {
  await browser.close();
});

// cost: time O(v·page), heap O(page), stack O(1), io v
// vars: v = 예제와 화면 폭 조합 수, page = 브라우저 페이지 비용
// basis: estimate
test('compact_comparisons_keep_signed_ticks_named_values_and_sums_readable_without_collisions', async () => {
  for (const [name, source] of Object.entries(SOURCES)) {
    const { html } = await playerHtml(source);
    await withPage(browser, html, { viewport: { width: 320, height: 1000 }, reducedMotion: 'reduce' }, async (page) => {
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 390, 430]) {
        await resizeTo(page, width, 1000);
        const before = await page.locator('.dp-panel svg .chart-title').boundingBox();
        await page.getByRole('tab', { name: '둘', exact: true }).click();
        assert.deepEqual(await page.locator('.dp-panel svg .chart-title').boundingBox(), before, `${name} ${width}px: 장면 전환으로 제목이 움직인다`);
        await page.getByRole('tab', { name: '하나', exact: true }).click();
        const state = await stateOf(page);

        assert.equal(state.pageOverflow <= 0, true, JSON.stringify({ name, width, state }));
        assert.ok(isReadable(state.minSize), `${name} ${width}px: 가장 작은 글자 ${state.minSize}px`);
        assert.deepEqual(state.overlaps, [], JSON.stringify({ name, width, state }));
        if (name === 'difference') {
          assert.ok(state.ticks.includes('-10'));
          assert.ok(state.values.includes('−6.4'));
        } else if (name.startsWith('dumbbell')) {
          // 좁은 배치는 값 글자 앞에 계열 이름을 붙이고 긴 이름은 줄을 나눈다(`기억 없음 120k`, `... 저장하지` / `않은 상태 120k`). 숫자로 끝나는 줄의 숫자가 읽히는지 본다.
          assert.deepEqual(state.values.filter((value) => /\d+k$/.test(value)).map((value) => value.split(' ').at(-1)), ['120k', '31k'], state.values.join(' | '));
        } else assert.ok(state.values.includes('+ 3: 25 = 100'), `합계가 값 목록 끝에 있다: ${state.values}`);
      }
    });
  }
});
