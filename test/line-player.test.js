// 근거: charts.md 선과 면적 차트는 좁은 화면에서도 점·계열·신뢰구간을 보존하고 글자와 재생 시각이 맞아야 한다. 좁은 화면은 글자를 줄이지 않고 좁은 배치로 다시 놓지만 점이 나타나는 시각(data-at × 자라는 시간)은 넓은 배치와 같은 규칙이다.
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
const TWO_SERIES = ['x "주차"', 'y "처리량(건)"', 'series ours "우리" role=main', 'series base "기준" role=compare', 'point x=1 ours=12 base=10', 'point x=2 ours=18 base=11', 'point x=3 ours=15 base=12', 'point x=4 ours=21 base=12'];
const SOURCES = [
  ['line', `daphnis 2\n${chartSource('line', TWO_SERIES, { title: '주차별 처리량' })}scene "비교" mode=once\n  reveal c.base\n  reveal c.ours\n`],
  ['area', `daphnis 2\n${chartSource('area', TWO_SERIES, { title: '주차별 처리량' })}scene "채움" mode=once\n  reveal c.base\n  reveal c.ours\n`],
  ['line', `daphnis 2\n${chartSource('line', ['x "가로축의 긴 설명과 관측 시각"', 'y "관측된 값의 긴 설명과 단위(건)"', 'series a "주요 관측값"', 'rule 100000000000000 "상한 기준"', 'point x=100000000000000 a=1 a.low=0 a.high=2', 'point x=100000000000001 a=3', 'point x=100000000000002 a=2'], { title: '긴 제목과 큰 값의 선 차트' })}scene "관측" mode=once\n  reveal c.a\n`],
];

// cost: time O(t² + p), heap O(t² + p), stack O(1), io 1
// vars: t = 글자 요소 수, p = 점 수
// basis: estimate
// 선과 면적 판 하나의 화면 상태: 점과 면적 수, 제목 위치, 자라는 점의 나타남 시각(delay)과 (글자 겹침, 읽을 수 있는 크기)는 readChartPanel이 잰다.
async function inspectPlot(page) {
  const panel = await readChartPanel(page);
  const plot = await page.evaluate(() => {
    const svg = document.querySelector('.dp-panel svg');
    const title = svg.querySelector('.chart-title').getBoundingClientRect();
    const dots = [...svg.querySelectorAll('.play .dot')].map((el) => ({ at: Number(el.dataset.at), delay: parseFloat(getComputedStyle(el).animationDelay) * 1000 }));
    return { points: svg.querySelectorAll('.dot:not(.chart-interval)').length, areas: svg.querySelectorAll('.chart-area').length, title: { x: title.x, y: title.y, width: title.width, height: title.height }, dots };
  });
  return { ...panel, ...plot };
}

for (const [engine, launch] of ENGINES) {
  test(`line_and_area_${engine}_keep_narrow_text_points_and_reveal_timing`, async () => {
    const browser = await launch();
    try {
      for (const [kind, source] of SOURCES) {
        const result = await buildFigure(source, { strict: true });
        const html = await toHtml(result, '모바일 선과 영역');
        const model = chartModelOf(result);
        for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
          const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme });
          const before = await inspectPlot(page);
          assert.equal(before.pageOverflow <= 0, true, JSON.stringify({ engine, width, before: { ...before, dots: undefined } }));
          assert.deepEqual(before.overlaps, [], `${engine} ${colorScheme} ${width}px`);
          assert.ok(isReadable(before.minSize), `${engine} ${colorScheme} ${width}px: 가장 작은 글자 ${before.minSize}px`);
          assert.equal(before.points, model.rows.length * model.series.length);
          assert.equal(before.areas, kind === 'area' ? model.series.length : 0);
          await page.clock.runFor(300);
          const playing = await inspectPlot(page);
          assert.deepEqual(playing.title, before.title, '재생 중 제목이 움직이지 않는다');
          assert.ok(playing.dots.length > 0);
          assert.equal(playing.points, before.points);
          for (const dot of playing.dots) assert.ok(Math.abs(dot.delay - Math.round(dot.at * result.timeline.growMs)) < 1, JSON.stringify({ engine, width, dot }));
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}
