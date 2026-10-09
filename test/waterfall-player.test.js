// 근거: charts.md 워터폴. 감소는 직전 누계에서 왼쪽으로 자라고 이름과 계산식은 움직이지 않는다. 재생은 장면 시계를 따르므로 가짜 시계를 흘려 잰다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';
import { chartModelOf, chartSource } from './helpers.js';
import { isReadable, openPaused, readChartPanel } from './mobile-chart.js';

const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
// 첫 장면은 차트 전체가 자라는 박자와 잠깐의 대기뿐이고(빈 장면은 오류다), 둘째 장면은 다섯째 행("감소 2")만 밝힌다.
const waterfall = (title, lines, light = 'light c "감소 2"') => `daphnis 2\n${chartSource('waterfall', lines, { title })}scene "자람" mode=once\n  wait 1s\nscene "선택" mode=once\n  ${light}\n`;
const MAIN = waterfall('처리 시간 누계', ['x "시간(ms)"', 'row "기본 처리" value=100', 'row "증가" value=30', 'row "감소 1" value=-20', 'total "중간"', 'row "감소 2" value=-40', 'total "최종"']);
const WIDE = waterfall('증가 감소와 영점을 가로지르는 긴 항목 이름', ['x "음수와 양수를 함께 비교하는 아주 긴 누적 처리 시간(ms)"', 'rule -5 "기준 누계"', 'row "처음부터 손실이 난 아주 긴 이름의 단계" value=-12.34567', 'row "다시 회복해서 영점을 넘어서는 단계" value=20.45678', 'total "현재 누계를 다시 계산하지 않는 중간 합계"', 'row "변화가 전혀 없는 단계" value=0', 'row "작은 감소가 있는 마지막 처리 단계" value=-0.12345', 'total "최종 합계"'], 'light c "최종 합계"');

// cost: time O(r), heap O(r), stack O(1), io 1
// vars: r = 막대와 글자 수
// basis: estimate
// 지금 화면의 첫 막대(양수)와 다섯째 행 막대(음수)의 가로 위치와 폭, 제목, 행 이름, 값 글자의 위치.
function measureGrowth(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.dp-panel svg');
    const box = (selector) => {
      const r = svg.querySelector(selector).getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    const labels = [...svg.querySelectorAll('.chart-title,.chart-label,.chart-value')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    return { positive: box('.cr-0 .chart-waterfall-bar'), negative: box('.cr-4 .chart-waterfall-bar'), labels };
  });
}

// cost: time O(page), heap O(page), stack O(1), io 1
// vars: page = 브라우저 페이지 비용
// basis: estimate
test('waterfall_changes_grow_from_the_previous_total_without_moving_mobile_labels', async () => {
  const result = await buildFigure(MAIN);
  const browser = await launchChrome();
  try {
    const { page, errors } = await openPaused(browser, await toHtml(result, 'waterfall'), { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    await page.clock.runFor(result.timeline.growMs / 4);
    const first = await measureGrowth(page);
    await page.clock.runFor(result.timeline.growMs);
    const last = await measureGrowth(page);
    assert.ok(first.positive.width > 0 && first.positive.width < last.positive.width);
    assert.ok(first.negative.width > 0 && first.negative.width < last.negative.width);
    assert.ok(Math.abs(first.positive.left - last.positive.left) < 0.1, '증가는 왼쪽 끝이 고정된 채 오른쪽으로 자란다');
    assert.ok(Math.abs(first.negative.right - last.negative.right) < 0.1, '감소는 오른쪽 끝(직전 누계)이 고정된 채 왼쪽으로 자란다');
    assert.deepEqual(first.labels, last.labels);
    await page.getByRole('tab', { name: '선택', exact: true }).click();
    const dim = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.dp-panel svg .chart-waterfall-growth [class*="cr-"]')].filter((el) => !el.classList.contains('ink')).map((el) => [el.getAttribute('class').match(/cr-(\d+)/)[1], el.classList.contains('dim')])));
    assert.equal(dim[4], false, '밝힌 행은 선명하다');
    assert.equal(dim[0], true, '나머지 행은 흐려진다');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});

// 근거: 좁은 워터폴도 모든 증감·합계와 계산식을 글자 축소 없이 읽을 수 있어야 한다(docs/design/charts.md 좁은 화면: 좁은 배치로 다시 놓는다).
for (const [engine, launch] of ENGINES) {
  test(`waterfall_${engine}_narrow_rows_preserve_values_and_read_without_text_collisions`, async () => {
    const browser = await launch();
    try {
      for (const source of [MAIN, WIDE]) {
        const result = await buildFigure(source, { strict: true });
        const html = await toHtml(result, '모바일 워터폴');
        const model = chartModelOf(result);
        for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
          const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
          const state = await readChartPanel(page);
          const plot = await page.evaluate(() => {
            const svg = document.querySelector('.dp-panel svg');
            return { rows: [...svg.querySelectorAll('.chart-waterfall-growth [data-from]')].map((el) => [Number(el.dataset.from), Number(el.dataset.to)]), connectors: svg.querySelectorAll('.chart-waterfall-connector').length, ruleLefts: [...new Set([...svg.querySelectorAll('line.chart-rule:not(.chart-waterfall-connector)')].map((el) => Math.round(el.getBoundingClientRect().left * 2) / 2))] };
          });

          assert.equal(state.pageOverflow <= 0, true, JSON.stringify({ engine, width, state }));
          assert.deepEqual(state.overlaps, [], `${engine} ${colorScheme} ${width}px`);
          assert.ok(isReadable(state.minSize), `${engine} ${colorScheme} ${width}px: 가장 작은 글자 ${state.minSize}px`);
          assert.deepEqual(plot.rows, model.ledger.map(({ from, to }) => [from, to]));
          assert.equal(plot.connectors, model.rows.length - 1);
          // 좁은 배치가 기준선을 행마다 끊어 그려도 선언한 기준선마다 같은 자리 하나다(모든 행을 지나는 공통 기준선)
          assert.equal(plot.ruleLefts.length, model.rules.length, `기준선 자리 ${plot.ruleLefts}`);
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}
