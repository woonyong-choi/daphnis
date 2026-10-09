// 근거: docs/design/charts.md 면적 차트의 0 기준, x 순서, 범위와 입력표 계약.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chartOf, chartSource, withFolder } from './helpers.js';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';

const LINES = ['x "시간(s)"', 'y "대기 요청(건)"', 'series a "대기"', 'point x=2 a=4', 'point x=0 a=0', 'point x=1 a=8'];
const area = (lines = LINES) => `daphnis 2\n${chartSource('area', lines, { id: 'wait', title: '대기' })}`;
const SOURCE = area();
const without = (lines, from, to) => lines.map((line) => line.replace(from, to));

test('area_sorts_x_and_closes_the_fill_at_zero_without_changing_input_order', async () => {
  const result = await buildFigure(SOURCE, { strict: true });
  const svg = await toSvg(result, { isStatic: true });
  const path = svg.match(/<path d="([^"]+)"[^>]*class="chart-area chart-band wipe"/);
  assert.ok(path, '면적을 그리는 닫힌 경로가 있다');
  assert.match(path[1], / Z$/);
  const points = [...path[1].matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(points.map(([x]) => x), [...points.slice(0, 3).map(([x]) => x).sort((a, b) => a - b), points[2][0], points[0][0]]);
  assert.equal(points[0][1], points.at(-1)[1], '입력값 0과 닫힘의 기준점은 같은 높이다');
  assert.equal(points.at(-2)[1], points.at(-1)[1], '바닥은 수평이다');
  assert.deepEqual(result.figure.nodes[0].plot.chart.rows.map((row) => row.values.x), [2, 0, 1]);
  assert.match(await toHtml(result, 'area'), /<th scope="row">2<\/th><td>4<\/td>/);
});

test('area_rejects_ambiguous_baselines_missing_values_and_duplicate_x', async () => {
  for (const [source, message] of [
    [area(['scale log', ...LINES]), /area.*0.*log/],
    [area(['zero off', ...LINES]), /zero off/],
    [area(without(LINES, 'a=4', 'a=-')), /missing/],
    [area(without(LINES, 'x=2', 'x=1')), /appears twice/],
    [area(without(LINES, 'a=4', 'a=4 a.low=3 a.high=5')), /not a value/],
    [area(['series a "A"', 'point x=0 a=1']), /at least two/],
  ]) await assert.rejects(buildFigure(source), message);
});

test('area_supports_signed_values_and_series_reveal_with_x_highlight', async () => {
  const result = await buildFigure(`${area(without(LINES, 'a=4', 'a=-4'))}scene "드러내기" mode=once\n  reveal wait.a\n  light wait x=2\n`, { strict: true });
  assert.equal(result.timeline.steps.length, 1);
  assert.deepEqual(chartOf(result).rowKeys, ['x=2', 'x=0', 'x=1']);
  const svg = await toSvg(result);
  const d = svg.match(/<path d="([^"]+)"[^>]*class="chart-area chart-band wipe"/)[1];
  const ys = [...d.matchAll(/[ML] [\d.-]+ ([\d.-]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys[1] < ys.at(-1) && ys[2] > ys.at(-1), '양수와 음수 면은 0 기준의 위아래에 놓인다');
});

// 근거: 값 출처 계약. JSON 키 대응은 숫자 x와 계열 역할을 보존한다.
test('area_json_input_matches_inline_points_and_rejects_absent_values', async () => {
  await withFolder(async (folder) => {
    const path = join(folder, 'area.json');
    writeFileSync(path, JSON.stringify([{ x: 2, count: 4 }, { x: 0, count: 0 }, { x: 1, count: 8 }]));
    const header = area(['x "시간(s)"', 'y "대기 요청(건)"', 'series a "대기" key="count"', 'data "area.json"']);
    const actual = await buildFigure(header, { baseDir: folder, strict: true });
    assert.equal(chartOf(actual).body, chartOf(await buildFigure(SOURCE)).body);
    writeFileSync(path, JSON.stringify([{ x: 0, count: 1 }, { x: 1 }]));
    await assert.rejects(buildFigure(header, { baseDir: folder }), /needs a=value/);
  });
});
