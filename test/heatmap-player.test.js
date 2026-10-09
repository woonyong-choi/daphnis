// 근거: charts.md 히트맵은 좁은 화면에서도 모든 행·열·값을 읽을 수 있고 재생 중 제목 위치를 유지해야 한다. 좁은 화면은 글자를 줄이지 않고 좁은 배치로 다시 놓고, 칸에 들어가지 않는 값은 입력 오류다(docs/design/charts.md 좁은 화면, figure-check.md 1번).
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
// 재생이 있는 장면 하나(밝히기)를 단 히트맵 원본
const heatmap = (title, lines, light = 'light c "서버" "캐시"') => `daphnis 2\n${chartSource('heatmap', lines, { title })}scene "밝히기" mode=once\n  ${light}\n`;
const SOURCES = [
  heatmap('서버별 캐시 사용', ['cell "서버" "캐시" 12', 'cell "서버" "원본" 123', 'cell "배치" "캐시" 0', 'cell "배치" "원본" 42']),
  heatmap('긴 행과 열의 교차표', ['cell "첫 번째 서버의 요청" "캐시를 사용한 요청" 12', 'cell "첫 번째 서버의 요청" "캐시 없는 요청" 123', 'cell "두 번째 서버의 요청" "캐시를 사용한 요청" 0', 'cell "두 번째 서버의 요청" "캐시 없는 요청" 42'], 'light c "첫 번째 서버의 요청" "캐시를 사용한 요청"'),
  heatmap('긴 소숫값의 교차표', ['decimals 6', 'cell "a" "x" 123.123456', 'cell "a" "y" 987.987654'], 'light c "a" "x"'),
  heatmap('여러 열의 원본 행렬', ['decimals 2', ...Array.from({ length: 4 }, (_, i) => `cell "행" "열${i}" ${900 + i}.12`)], 'light c "행" "열0"'),
];

// 근거: 설계 figure-check.md 1번 "글이 칸 안에 들어간다"(오류), charts.md 좁은 화면 "글자 크기를 줄이거나 이름·점을 생략하지 않는다". 좁은 배치는 열 8개의 칸 폭이 14px이라 소수 자릿수를 줄여도 값 글자가 들어가지 않는다. 넓은 배치는 만들어지고 좁은 배치를 싣는 HTML 만들기가 그 칸의 줄에서 입력 오류로 끝낸다. 옛 시험은 이런 원본을 판 안 가로 이동으로 받았다
test('heatmap_columns_too_narrow_for_their_values_end_the_html_build_with_a_check_1_error', async () => {
  const eight = heatmap('많은 열의 원본 행렬', ['decimals 2', ...Array.from({ length: 8 }, (_, i) => `cell "행" "열${i}" ${900 + i}.12`)], 'light c "행" "열0"');
  const result = await buildFigure(eight, { strict: true });

  await assert.rejects(toHtml(result, '모바일 히트맵'), (error) => {
    const [problem] = error.problems;
    return problem.severity === 'error' && problem.line === 4 && /^cell value "900\.12" is wider than its space \(14px\)\. Shorten the name$/.test(problem.message.replace(/^\[check 1\] /, ''));
  });
});

// cost: time O(t² + p), heap O(t² + p), stack O(1), io 1
// vars: t = 글자 요소 수, p = 칸 수
// basis: estimate
// 히트맵 판 하나의 화면 상태: 칸 수, 칸 숫자, 행과 열 이름, 제목 위치와 (글자 겹침, 읽을 수 있는 크기)는 readChartPanel이 잰다.
async function inspectPlot(page) {
  const panel = await readChartPanel(page);
  const plot = await page.evaluate(() => {
    const svg = document.querySelector('.dp-panel svg');
    const title = svg.querySelector('.chart-title').getBoundingClientRect();
    const names = (selector) => [...svg.querySelectorAll(selector)].map((el) => el.textContent.replace(/\s/g, ''));
    return { cells: svg.querySelectorAll('.chart-heat-cell').length, values: [...svg.querySelectorAll('.chart-cell')].map((el) => el.textContent), rowNames: names('.chart-label'), columnNames: names('.chart-tick'), title: { x: title.x, y: title.y, width: title.width, height: title.height } };
  });
  return { ...panel, ...plot };
}

for (const [engine, launch] of ENGINES) {
  test(`heatmap_${engine}_keeps_matrix_values_labels_and_playback`, async () => {
    const browser = await launch();
    try {
      for (const source of SOURCES) {
        const result = await buildFigure(source, { strict: true });
        const html = await toHtml(result, '모바일 히트맵');
        const rows = chartModelOf(result).rows;
        for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
          const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme });
          const before = await inspectPlot(page);
          assert.equal(before.pageOverflow <= 0, true, JSON.stringify({ engine, width, before: { ...before, values: undefined } }));
          assert.deepEqual(before.overlaps, [], `${engine} ${colorScheme} ${width}px`);
          assert.ok(isReadable(before.minSize), `${engine} ${colorScheme} ${width}px: 가장 작은 글자 ${before.minSize}px`);
          assert.equal(before.cells, rows.length);
          assert.equal(before.values.length, rows.length);
          assert.deepEqual(before.rowNames, [...new Set(rows.map((row) => row.row.replace(/\s/g, '')))]);
          assert.deepEqual(before.columnNames, [...new Set(rows.map((row) => row.col.replace(/\s/g, '')))]);
          assert.deepEqual(before.values.map((text) => Number(text.replaceAll(',', ''))), rows.map((row) => row.values.value));
          await page.clock.runFor(300);
          const playing = await inspectPlot(page);
          assert.deepEqual(playing.title, before.title, '재생 중 제목이 움직이지 않는다');
          assert.deepEqual(playing.values, before.values);
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}
