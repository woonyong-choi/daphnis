// 시각 수정: 차트 공통 규칙(선 굵기, 끝 이름 자리, 갱신 표식)을 그리기 단계에서 잰다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { categoryPaint } from '../src/chart-palette.js';
import { values } from '../src/tokens.js';
import { barRows, drawChart, figureOf, names, pointRows, sampleRows } from './chart-v2-fixture.js';

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const strokeWidths = (body) => [...body.matchAll(/<(?:path|line)[^>]*\sstroke-width="([\d.]+)"[^>]*>/g)].map((m) => Number(m[1]));
const lineTwo = () => drawChart(figureOf('line', { series: names(2), rows: pointRows([[1, 3, 5], [2, 6, 4], [3, 4, 8]]) })).body;

test('every_series_line_has_the_common_border_strong_weight_and_no_casing_exists_for_the_yellow_series', () => {
  const bodies = {
    line: lineTwo(),
    step: drawChart(figureOf('step', { series: names(2), rows: pointRows([[1, 1, 3], [2, 4, 2], [3, 2, 5]]) })).body,
    ecdf: drawChart(figureOf('ecdf', { series: names(2), rows: sampleRows([[1, 'a'], [2, 'a'], [1, 'b'], [4, 'b']]) })).body,
  };
  for (const [type, body] of Object.entries(bodies)) {
    const lines = [...body.matchAll(/<path d="M[^"]*" fill="none"[^>]*class="(?:draw|wipe)[^"]*"/g)];
    assert.equal(lines.length, 2, `${type}: 계열마다 선 하나(받침 없음)`);
    const widths = [...body.matchAll(/<path d="M[^"]*" fill="none"[^>]*?stroke-width="([\d.]+)"[^>]*class="(?:draw|wipe)/g)].map((m) => Number(m[1]));
    assert.deepEqual(widths, [values.border.strong, values.border.strong], `${type}: 선 굵기가 같다`);
    assert.doesNotMatch(body, /chart-series-outline/);
  }
});

test('the_yellow_series_line_uses_its_family_border_and_its_dot_keeps_the_anchor_fill_with_the_same_family_ring', () => {
  const body = lineTwo();
  const yellow = categoryPaint(1);
  const line = body.match(/<path d="M[^"]*" fill="none"[^>]*stroke="([^"]+)"/g).map((tag) => tag.match(/stroke="([^"]+)"/)[1]);
  assert.equal(line[1], yellow.border, '노랑 선은 같은 계열의 테두리 값이다');
  // 점 모양은 범주 번호를 따라 노랑(1번)은 사각형이다.
  const dot = body.match(new RegExp(`<rect[^>]*fill="${yellow.fill.replace(/[()]/g, '\\$&')}"[^>]*class="dot"[^>]*>`));
  assert.ok(dot, '노랑 점은 앵커 면 색이다');
  assert.match(dot[0], new RegExp(`stroke="${yellow.border.replace(/[()]/g, '\\$&')}"`), '같은 계열의 경계 고리가 있다');
});

test('the_legend_line_swatch_has_one_line_of_the_common_weight_for_every_series', () => {
  const body = lineTwo();
  const legend = body.match(/<line [^>]*stroke-width="([\d.]+)"[^>]*\/>/g) ?? [];
  const swatches = legend.filter((tag) => !/class="chart-(?:grid|break)/.test(tag));
  assert.equal(swatches.length, 2, '범례 선 칸은 계열마다 하나다');
  for (const tag of swatches) assert.match(tag, new RegExp(`stroke-width="${values.border.strong}"`));
});

test('range_bars_and_the_difference_interval_use_one_common_weight_for_light_and_dark_families', () => {
  const dumbbell = drawChart(figureOf('dumbbell', { series: names(2), rows: [{ label: '웹', values: { a: 10, 'a.low': 8, 'a.high': 12, b: 20, 'b.low': 18, 'b.high': 22 } }] })).body;
  const ranges = [...dumbbell.matchAll(/<line [^>]*class="chart-range pop"[^>]*>/g)];
  assert.equal(ranges.length, 2);
  for (const range of ranges) assert.match(range[0], new RegExp(`stroke-width="${values.size.chart.range}"`));
  assert.doesNotMatch(dumbbell, /\.rc"/, '받침 표식이 없다');
  const difference = drawChart(figureOf('difference', { series: names(1), rows: [{ label: '웹', values: { a: 4, 'a.low': 2, 'a.high': 6 } }] })).body;
  assert.doesNotMatch(difference, /\.ic"/);
});

test('no_source_file_draws_a_casing_or_names_the_old_helper', () => {
  for (const file of walk('src').filter((f) => /\.(js|css)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /chart-series-outline|hasCasing/, file);
  }
});
