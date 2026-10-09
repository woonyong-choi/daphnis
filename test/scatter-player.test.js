// 근거: charts.md 산점도는 좁은 화면에서도 모든 점·이름·연결과 재생 중 제목 위치를 유지해야 한다. 좁은 화면은 글자를 줄이지 않고 이름을 위아래로 비켜 놓은 좁은 배치를 쓴다(docs/design/charts.md 좁은 화면).
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
// 재생이 있는 장면 하나(밝히기)를 단 산점도 원본
const scatter = (title, points, tail = []) => `daphnis 2\n${chartSource('scatter', ['x "시간(ms)"', 'y "비용(원)"', ...points, ...tail], { title })}scene "밝히기" mode=once\n  light c ${/point ("[^"]+")/.exec(points[0])[1]}\n`;
// 한 자리에 겹친 긴 이름들: 차트가 위아래로 비켜 놓은 뒤에도 겹치면 그림 검사 2번 오류이므로(docs/design/figure-check.md) 비켜 놓을 수 있는 원본이어야 한다
const STACKED = Array.from({ length: 8 }, (_, i) => `point "같은 위치에서 관측한 요청의 평균 처리 지연 시간 ${i}" x=5 y=5`);
// 가까이 모여 있지만 다른 좌표에 있는 점들: 좁은 배치가 이름을 위아래로 비켜 놓아야 한다
const CLUSTER = Array.from({ length: 6 }, (_, i) => `point "관측한 요청의 평균 처리 지연 ${i}" x=${5 + i} y=${5 + i * 0.8}`);
const SOURCES = [
  scatter('서버 크기와 비용', ['point "alpha" x=2 y=3', 'point "beta" x=5 y=5', 'point "gamma" x=8 y=2', 'point "delta" x=9 y=9'], ['link "alpha" -> "beta"', 'link "beta" -> "gamma"']),
  scatter('겹친 좌표의 이름', ['point "alpha" x=5 y=5', 'point "beta" x=5 y=5', 'point "far" x=1 y=1']),
  scatter('긴 이름의 관측값', ['point "서버를 확장하기 전 관측한 요청의 평균 응답 시간" x=8 y=8', 'point "서버를 확장한 뒤 관측한 요청의 평균 응답 시간" x=2 y=2']),
  scatter('가까이 모인 긴 이름', [...CLUSTER, 'point "끝" x=14 y=14']),
];

// 근거: 설계 figure-check.md 2번 "산점도 점 이름은 차트가 위아래와 좌우로 비켜 놓은 뒤에도 서로 겹친 넓이 0"(오류), charts.md 좁은 화면 "좁은 배치가 이름을 줄 바꿔 다시 놓는다". 넓은 배치는 비켜 놓지만 좁은 배치가 비켜 놓지 못하는 원본은 좁은 배치를 싣는 HTML 만들기가 그 점 줄에서 입력 오류로 끝낸다. 옛 시험은 이런 원본을 판 안 가로 이동으로 받았다
test('scatter_names_that_the_narrow_layout_cannot_place_apart_end_the_html_build_with_a_check_2_error', async () => {
  const result = await buildFigure(scatter('겹친 긴 이름', [...STACKED, 'point "끝" x=10 y=10']), { strict: true });

  await assert.rejects(toHtml(result, '모바일 산점도'), (error) => {
    const [problem] = error.problems;
    return error.problems.length >= 1 && problem.severity === 'error' && problem.line === 11 && /overlaps point name/.test(problem.message) && /Change a coordinate or rename a point so the names can be placed apart/.test(problem.message);
  });
});

// cost: time O(t² + p), heap O(t² + p), stack O(1), io 1
// vars: t = 글자 요소 수, p = 점 수
// basis: estimate
// 산점도 판 하나의 화면 상태: 점과 연결 수, 점 이름(획 없는 바탕 글자인지, 줄 수), 제목 위치와 (글자 겹침, 읽을 수 있는 크기)는 readChartPanel이 잰다.
async function inspectPlot(page) {
  const panel = await readChartPanel(page);
  const plot = await page.evaluate(() => {
    const svg = document.querySelector('.dp-panel svg');
    const title = svg.querySelector('.chart-title').getBoundingClientRect();
    const names = [...svg.querySelectorAll('.chart-name')];
    return { strokedNames: names.filter((el) => getComputedStyle(el).stroke !== 'none').length, maxLines: Math.max(...names.map((el) => el.querySelectorAll('tspan').length)), points: svg.querySelectorAll('circle.pop').length, names: names.map((el) => el.textContent), links: svg.querySelectorAll('.chart-link').length, title: { x: title.x, y: title.y, width: title.width, height: title.height } };
  });
  return { ...panel, ...plot };
}

for (const [engine, launch] of ENGINES) {
  test(`scatter_${engine}_keeps_narrow_names_points_links_and_titles`, async () => {
    const browser = await launch();
    try {
      for (const source of SOURCES) {
        const result = await buildFigure(source, { strict: true });
        const html = await toHtml(result, '모바일 산점도');
        const model = chartModelOf(result);
        for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
          const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme });
          const before = await inspectPlot(page);
          assert.equal(before.pageOverflow <= 0, true, JSON.stringify({ engine, width, before }));
          assert.deepEqual(before.overlaps, [], `${engine} ${colorScheme} ${width}px`);
          assert.equal(before.strokedNames, 0, '점 이름은 글자 획을 덮는 테두리 대신 별도 바탕을 사용한다');
          if (source === SOURCES[2]) assert.ok(before.maxLines <= 2, '넓은 쪽을 사용하면 긴 이름은 두 줄에 들어간다');
          assert.ok(isReadable(before.minSize), `${engine} ${colorScheme} ${width}px: 가장 작은 글자 ${before.minSize}px`);
          assert.equal(before.points, model.rows.length);
          assert.equal(before.links, model.links.length);
          assert.deepEqual(before.names, model.rows.map((row) => row.label));
          await page.clock.runFor(300);
          const playing = await inspectPlot(page);
          assert.deepEqual(playing.title, before.title, '재생 중 제목이 움직이지 않는다');
          assert.equal(playing.points, before.points);
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}
