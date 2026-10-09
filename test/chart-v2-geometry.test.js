// 차트 v2 그리기 기하: 같은 틀로 그린 모든 종류가 계열 N개, 기대값, 결측, 0, 무늬, 직접 라벨, 고정 축 규칙을 지키는지 확인한다.
// 입력은 정규 차트 입력(IR)을 직접 만든 것이다(test/chart-v2-fixture.js). 원본 해석기를 거치지 않으므로 원본에서 그림까지(E2E)는 이 시험의 범위가 아니다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { categoryPaint } from '../src/chart-palette.js';
import { assertFinite } from '../src/chart/guard.js';
import { categoryIndex, seriesPaint } from '../src/chart/metrics.js';
import { barRows, drawChart, figureOf, names, pointRows, sampleRows, attrsOf, textsOf } from './chart-v2-fixture.js';

const ROLES = (list) => list.map(([id, label, role]) => [id, label, role]);
const count = (body, pattern) => (body.match(pattern) ?? []).length;
const legend = (body) => textsOf(body, 'chart-legend');
const rects = (body, fill) => [...body.matchAll(new RegExp(`<rect [^>]*fill="${fill.replace(/[()]/g, '\\$&')}"[^>]*>`, 'g'))].map((m) => m[0]);

test('series_color_comes_from_the_shared_category_paint_for_5_and_12_series', () => {
  for (const count of [5, 12]) {
    const figure = figureOf('bar', { series: names(count), rows: barRows([['r', ...Array.from({ length: count }, (_, i) => i + 1)]]) });
    const { body } = drawChart(figure);
    for (let i = 0; i < count; i++) {
      const paint = categoryPaint(i);
      assert.equal(seriesPaint(figure.chart, i).fill, paint.fill);
      assert.ok(body.includes(`fill="${paint.fill}" stroke="${paint.border}"`), `series ${i}`);
    }
  }
});

test('main_series_takes_category_zero_and_the_rest_follow_in_order', () => {
  const chart = { series: [{ role: 'compare' }, { role: undefined }, { role: 'main' }, { role: 'reference' }] };
  assert.deepEqual([0, 1, 2, 3].map((i) => categoryIndex(chart, i)), [1, 2, 0, 3]);
  assert.deepEqual([0, 1].map((i) => categoryIndex({ series: [{ role: 'main' }, { role: 'compare' }] }, i)), [0, 1]);
  assert.deepEqual([0, 1].map((i) => categoryIndex({ series: [{ role: 'compare' }, { role: 'main' }] }, i)), [1, 0]);
  assert.equal(categoryIndex({ series: [{}] }, 0), 0);
  assert.equal(categoryIndex({ series: [] }, 0), 0);
});

test('legend_has_one_entry_per_series_in_order_for_bar_stacked_percent_line_step_ecdf', () => {
  for (const count of [5, 12]) {
    const expected = names(count).map(([, label]) => label);
    const make = {
      bar: () => figureOf('bar', { series: names(count), rows: barRows([['r', ...Array.from({ length: count }, (_, i) => i + 1)]]) }),
      stacked: () => figureOf('stacked', { series: names(count), rows: barRows([['r', ...Array.from({ length: count }, (_, i) => i + 1)]]) }),
      percent: () => figureOf('percent', { series: names(count), rows: barRows([['r', ...Array.from({ length: count }, (_, i) => i + 1)]]) }),
      line: () => figureOf('line', { series: names(count), rows: pointRows([[1, ...Array.from({ length: count }, (_, i) => i)], [2, ...Array.from({ length: count }, (_, i) => i + 2)]]) }),
      step: () => figureOf('step', { series: names(count), rows: pointRows([[1, ...Array.from({ length: count }, (_, i) => i)], [2, ...Array.from({ length: count }, (_, i) => i + 2)]]) }),
      ecdf: () => figureOf('ecdf', { series: names(count), rows: sampleRows(names(count).flatMap(([id], i) => [[i + 1, id], [i + 3, id]])) }),
    };
    for (const [type, build] of Object.entries(make)) {
      const entries = legend(drawChart(build()).body);
      const keyed = ['bar', 'stacked', 'percent'].includes(type);
      assert.deepEqual(entries.map((text) => text.replace(/^\d+ /, '')), expected, `${type} ${count}`);
      // 번호 키는 막대 종류만 단다
      assert.deepEqual(entries.map((text) => /^\d+ /.test(text)), expected.map(() => keyed), `${type} keys`);
      if (keyed) assert.deepEqual(entries.map((text) => Number.parseInt(text, 10)), expected.map((_, i) => i + 1));
    }
  }
});

test('a_single_bar_series_keeps_an_unnumbered_legend_and_two_series_geometry_is_unchanged', () => {
  const one = drawChart(figureOf('bar', { series: names(1), rows: barRows([['r', 4]]) }));
  assert.deepEqual(legend(one.body), ['계열 A']);
  // 두 계열 막대 사이는 신뢰구간 줄이 놓일 자리까지 STEP = 12 + 16 = 28
  const two = drawChart(figureOf('bar', { series: names(2), rows: barRows([['r', 4, 3]]) }));
  const bars = [...two.body.matchAll(/<rect x="[^"]*" y="([^"]*)" width="[^"]*" height="12"[^>]*class="grow"/g)].map((m) => Number(m[1]));
  assert.equal(bars.length, 2);
  assert.equal(bars[1] - bars[0], 28);
  // 셋 이상이고 신뢰구간이 없으면 막대 사이는 12 + 6 = 18로 좁힌다
  const three = drawChart(figureOf('bar', { series: names(3), rows: barRows([['r', 4, 3, 2]]) }));
  const tight = [...three.body.matchAll(/<rect x="[^"]*" y="([^"]*)" width="[^"]*" height="12"[^>]*class="grow"/g)].map((m) => Number(m[1]));
  assert.deepEqual([tight[1] - tight[0], tight[2] - tight[1]], [18, 18]);
});

test('color_overflow_beyond_seven_uses_patterns_and_shapes_and_each_pattern_def_is_emitted_once', () => {
  const { body, patternKeys, defs } = drawChart(figureOf('bar', { series: names(12), rows: barRows([['r', ...Array.from({ length: 12 }, (_, i) => i + 1)]]) }));
  // 앞 일곱은 단색이고 여덟째부터 무늬가 덮인다
  assert.equal(count(body, /class="chart-pattern grow"/g), 5);
  assert.equal(patternKeys.length, 5);
  assert.deepEqual(patternKeys, [...patternKeys].sort());
  assert.equal(new Set(patternKeys).size, patternKeys.length);
  for (const key of patternKeys) {
    assert.equal(count(defs, new RegExp(`<pattern id="${key}"`, 'g')), 1);
    assert.ok(body.includes(`url(#${key})`));
  }
  // 정의는 body 안에 없다: 조립 단계가 SVG마다 한 번 넣는다
  assert.ok(!body.includes('<pattern'));
});

test('pattern_ids_are_content_hashed_so_two_panels_agree_without_colliding', () => {
  const build = () => drawChart(figureOf('stacked', { series: names(9), rows: barRows([['r', ...Array.from({ length: 9 }, () => 1)]]) }));
  const [a, b] = [build(), build()];
  assert.deepEqual(a.patternKeys, b.patternKeys);
  assert.equal(a.defs, b.defs);
  // 서로 다른 무늬는 다른 id를 갖는다(범주 7은 파랑 해치, 8은 노랑 점)
  const keys = drawChart(figureOf('bar', { series: names(12), rows: barRows([['r', ...Array.from({ length: 12 }, () => 1)]]) })).patternKeys;
  assert.equal(new Set(keys).size, 5);
});

test('a_chart_within_the_first_seven_has_no_pattern_defs', () => {
  const { patternKeys, defs, body } = drawChart(figureOf('bar', { series: names(7), rows: barRows([['r', 1, 2, 3, 4, 5, 6, 7]]) }));
  assert.deepEqual(patternKeys, []);
  assert.equal(defs, '');
  assert.ok(!body.includes('url(#'));
});

test('reference_bar_is_hollow_with_a_same_family_border_and_actual_bars_are_filled', () => {
  const figure = figureOf('bar', { series: ROLES([['a', '실제', 'main'], ['b', '계획', 'reference']]), rows: barRows([['r', 3, 5]]) });
  const { body } = drawChart(figure);
  const barRects = [...body.matchAll(/<rect [^>]*class="grow"[^>]*>/g)].map((m) => m[0]);
  assert.equal(barRects.length, 2);
  assert.ok(barRects[0].includes(`fill="${categoryPaint(0).fill}"`));
  assert.ok(barRects[1].includes('fill="none"'));
  // 기대값의 색은 자기 범주(1번)의 같은 계열 테두리 값이다
  assert.ok(barRects[1].includes(`stroke="${categoryPaint(1).border}"`));
  assert.ok(!body.includes('rim'));
});

test('reference_line_is_dashed_with_hollow_markers_and_actual_lines_have_no_dash_attribute', () => {
  const figure = figureOf('line', { series: ROLES([['a', '실제', 'main'], ['b', '계획', 'reference']]), rows: pointRows([[1, 1, 2], [2, 3, 4], [3, 2, 6]]) });
  const { body } = drawChart(figure);
  const paths = [...body.matchAll(/<path d="M[^"]*" fill="none"[^>]*>/g)].map((m) => m[0]).filter((p) => !p.includes('chart-leader'));
  const actual = paths.filter((p) => p.includes(`stroke="${categoryPaint(0).border}"`));
  const reference = paths.filter((p) => p.includes(`stroke="${categoryPaint(1).border}"`));
  assert.equal(actual.length, 1);
  assert.ok(!actual[0].includes('stroke-dasharray') && !actual[0].includes('chart-dashed'));
  assert.ok(reference.every((p) => p.includes('chart-dashed')));
  // 점선은 길이가 아니라 x 위치로 드러낸다(wipe)
  assert.ok(reference[0].includes('wipe') && !reference[0].includes('pathLength'));
  assert.ok(actual[0].includes('class="draw"') && actual[0].includes('pathLength="1"'));
  // 점 모양은 범주 번호를 따라 실제 계열(0번)은 원, 기대값 계열(1번)은 사각형이다.
  const dots = [...body.matchAll(/<(?:circle|rect) [^>]*class="dot"[^>]*>/g)].map((m) => m[0]);
  assert.equal(dots.filter((d) => d.startsWith('<rect') && d.includes('fill="var(--color-bg)"')).length, 3);
  assert.equal(dots.filter((d) => d.startsWith('<circle') && d.includes(`fill="${categoryPaint(0).border}"`)).length, 3);
});

test('missing_points_have_no_marker_and_no_data_at_while_complete_series_keep_theirs', () => {
  const figure = figureOf('line', { series: names(2), rows: pointRows([[1, 1, 5], [2, null, 6], [3, 3, 7], [4, 4, 8]]) });
  const { body } = drawChart(figure);
  const dots = [...body.matchAll(/<(?:circle|rect) [^>]*class="dot" data-at="([^"]*)"/g)];
  // 계열 a: 점 3개(결측 하나 뺌), 계열 b: 점 4개. 결측 자리에는 요소 자체가 없다. 모양은 범주 번호를 따라 a는 원, b는 사각형이다.
  assert.equal(dots.length, 7);
  assert.equal(count(body, /<g class="cr-1"><g class="cs-0">/g), 0);
  assert.equal(count(body, /<g class="cr-1"><g class="cs-1">/g), 1);
});

test('a_gap_makes_the_series_path_restart_with_M_and_use_wipe_arrival', () => {
  const figure = figureOf('line', { series: names(1), rows: pointRows([[1, 1], [2, 2], [3, null], [4, 4], [5, 5]]) });
  const { body, dotAts } = drawChart(figure);
  const d = body.match(/<path d="(M[^"]*)" fill="none" stroke="[^"]*" stroke-width="[^"]*" class="wipe"/)[1];
  assert.equal(count(d, /M/g), 2);
  assert.equal(count(body, /class="dot" data-at/g), 4);
  // 묶음 사이 이동은 길이 0이라 두 묶음이 x 비율로 나뉜다: 첫 묶음 끝 점과 둘째 묶음 첫 점이 다른 시각이다
  assert.ok(dotAts.length >= 3);
});

test('step_series_path_uses_only_M_H_V_in_the_drawing', () => {
  const figure = figureOf('step', { series: names(2), rows: pointRows([[1, 1, 3], [2, 4, 2], [3, 2, 5]]) });
  const { body } = drawChart(figure);
  // 밝은 계열(노랑)도 받침 없이 계열마다 경로 하나다
  const paths = [...body.matchAll(/<path d="(M[^"]*)" fill="none"[^>]*class="(?:draw|wipe)/g)].map((m) => m[1]);
  assert.equal(paths.length, 2);
  assert.equal(new Set(paths).size, 2);
  for (const d of paths) assert.deepEqual([...new Set(d.match(/[A-Za-z]/g))].sort(), ['H', 'M', 'V']);
});

test('line_step_and_ecdf_with_two_or_more_series_have_one_end_label_per_series', () => {
  for (const count of [2, 5, 12]) {
    const line = drawChart(figureOf('line', { series: names(count), rows: pointRows([[1, ...Array.from({ length: count }, (_, i) => i)], [2, ...Array.from({ length: count }, (_, i) => i + 1)]]) }));
    const step = drawChart(figureOf('step', { series: names(count), rows: pointRows([[1, ...Array.from({ length: count }, (_, i) => i)], [2, ...Array.from({ length: count }, (_, i) => i + 1)]]) }));
    const ecdf = drawChart(figureOf('ecdf', { series: names(count), rows: sampleRows(names(count).flatMap(([id], i) => [[i + 1, id], [i + 3, id]])) }));
    for (const { body } of [line, step, ecdf]) assert.equal(count_(body), count);
  }
  const one = drawChart(figureOf('line', { series: names(1), rows: pointRows([[1, 1], [2, 2]]) }));
  assert.equal(count_(one.body), 0);
  function count_(body) {
    return (body.match(/class="chart-end-label"/g) ?? []).length;
  }
});

test('end_labels_keep_y_order_and_never_overlap_when_series_end_at_the_same_value', () => {
  const rows = pointRows([[1, 5, 5, 5, 5], [2, 5, 5, 5, 5]]);
  const { body } = drawChart(figureOf('line', { series: names(4), rows }));
  const tops = [...body.matchAll(/<text x="[^"]*" y="([^"]*)" fill="[^"]*" class="chart-end-label"/g)].map((m) => Number(m[1]));
  assert.equal(tops.length, 4);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] >= 11, `label ${i} is a line below the previous one`);
  // 같은 값에서 끝나면 계열 순서가 위에서 아래로 이어진다
  assert.deepEqual([...tops].sort((a, b) => a - b), tops);
});

test('end_label_room_is_fixed_by_series_names_so_every_frame_has_the_same_plot_width', () => {
  const extent = { min: 0, max: 4000 };
  const a = drawChart(figureOf('line', { series: names(2), extent, rows: pointRows([[1, 1, 2], [2, 3, 4]]) }));
  const b = drawChart(figureOf('line', { series: names(2), extent, rows: pointRows([[1, 100, 2000], [2, 3000, 4]]) }));
  const gridEnds = (body) => [...body.matchAll(/<line x1="([^"]*)" x2="([^"]*)" y1="[^"]*" y2="[^"]*" class="chart-grid"/g)].map((m) => [m[1], m[2]].join('-'));
  assert.ok(gridEnds(a.body).length > 2);
  assert.deepEqual(gridEnds(a.body), gridEnds(b.body));
  // 끝 이름 자리는 계열 이름이 정하므로 이름이 같으면 어느 값에서도 같다
  assert.equal(a.height, b.height);
});

test('signed_stacked_extent_reaches_the_negative_sum_and_zero_is_drawn', () => {
  const figure = figureOf('stacked', { series: names(3), rows: barRows([['r1', 3, -4, -2], ['r2', 5, 1, 2]]) });
  const { body } = drawChart(figure);
  const ticks = textsOf(body, 'chart-tick');
  assert.ok(ticks.some((t) => t.startsWith('-')), `negative tick in ${ticks}`);
  assert.ok(ticks.includes('0'));
  assert.ok(body.includes('class="chart-zero"'));
  // 음수 조각은 0선 왼쪽, 양수 조각은 오른쪽
  const zero = Number(body.match(/<line x1="([^"]*)" x2="[^"]*" y1="[^"]*" y2="[^"]*" class="chart-zero"/)[1]);
  const segments = [...body.matchAll(/<rect x="([^"]*)" y="[^"]*" width="([^"]*)" height="12" fill="[^"]*" stroke="[^"]*" stroke-width="[^"]*" class="stack-segment grow"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(segments.length, 6);
  assert.ok(segments[1][0] + segments[1][1] <= zero + 0.5, 'negative segment ends at zero');
  assert.ok(segments[0][0] >= zero - 0.5, 'positive segment starts at zero');
});

test('percent_axis_runs_0_to_100_regardless_of_data', () => {
  const small = drawChart(figureOf('percent', { series: names(2), rows: barRows([['r', 1, 1]]) }));
  const large = drawChart(figureOf('percent', { series: names(2), rows: barRows([['r', 9000, 1]]) }));
  for (const { body } of [small, large]) assert.deepEqual(textsOf(body, 'chart-tick'), ['0', '20', '40', '60', '80', '100']);
});

test('percent_zero_sum_and_missing_rows_draw_no_bar_and_say_why_next_to_the_data', () => {
  const figure = figureOf('percent', { series: names(2), rows: barRows([['정상', 30, 20], ['합 0', 0, 0], ['결측', 5, null]]) });
  const { body } = drawChart(figure);
  const segments = [...body.matchAll(/width="([^"]*)" height="12" fill="[^"]*" stroke="[^"]*" stroke-width="[^"]*" class="stack-segment grow"/g)].map((m) => Number(m[1]));
  assert.equal(segments.length, 6);
  assert.ok(segments.slice(0, 2).every((w) => w > 0));
  assert.ok(segments.slice(2).every((w) => w === 0), 'no bar for zero-sum or missing rows');
  const statuses = [...body.matchAll(/<text [^>]*class="chart-missing"([^>]*)>([^<]*)</g)].map((m) => [m[2], m[1].includes('visibility="hidden"')]);
  // 안내 글 칸은 합이 0일 수 있는 퍼센트 행마다 늘 있고(정상 행은 숨김), 막대가 없는 행에서만 보인다
  assert.equal(statuses.length, 3);
  const shown = statuses.filter(([, hidden]) => !hidden).map(([text]) => text);
  assert.deepEqual(shown, ['합계 0 · 비율 정의 불가', '비교 없음']);
  // 퍼센트와 원값을 함께 적고 행 끝에 합계. 반올림한 퍼센트의 합을 100으로 맞추지 않는다
  const values = textsOf(body, 'chart-value');
  assert.ok(values.includes('1: 60.0% (30)'));
  assert.ok(values.includes('2: 40.0% (20)'));
  assert.ok(values.includes('합계 50'));
  assert.ok(values.includes('2: −'));
});

test('stacked_missing_row_lists_a_dash_and_omits_the_total', () => {
  const { body } = drawChart(figureOf('stacked', { series: names(2), rows: barRows([['정상', 3, 4], ['결측', 5, null]]) }));
  const values = textsOf(body, 'chart-value');
  assert.ok(values.includes('+ 2: 4 = 7'));
  assert.ok(values.includes('+ 2: −'));
  assert.ok(!values.some((text) => text.includes('= 5')));
});

test('ecdf_draws_markers_per_unique_value_excludes_missing_and_labels_empty_groups', () => {
  const rows = sampleRows([[1, 'a'], [1, 'a'], [3, 'a'], [4, 'a'], [2, 'b'], [null, 'b'], [null, 'c']]);
  const { body } = drawChart(figureOf('ecdf', { series: [['a', 'A'], ['b', 'B'], ['c', 'C']], rows }));
  // 표식 자리는 모든 계열의 고유값 합집합(1, 2, 3, 4) × 계열 3개이고, 계열에 없는 자리는 숨는다
  assert.equal(count(body, /class="dot" data-at/g), 12);
  assert.equal(count(body, /class="dot" data-at="[^"]*" visibility="hidden"/g), 12 - 3 - 1 - 0);
  assert.ok(textsOf(body, 'chart-sub').some((t) => t.includes('B 결측 1개 제외')));
  assert.ok(legend(body).includes('C · 표본 없음'));
  // 노랑(범주 1번) 곡선도 받침 없이 하나다. 표본이 없는 계열 c는 곡선이 없다.
  const paths = [...body.matchAll(/<path d="(M[^"]*)" fill="none"[^>]*class="(?:draw|wipe)/g)].map((m) => m[1]);
  assert.equal(paths.length, 2, 'the empty group draws no curve');
  assert.equal(new Set(paths).size, 2);
  for (const d of paths) assert.deepEqual([...new Set(d.match(/[A-Za-z]/g))].sort(), ['H', 'M', 'V']);
});

test('ecdf_axis_is_0_to_1', () => {
  const { body } = drawChart(figureOf('ecdf', { series: [], rows: sampleRows([5, 6, 7]) }));
  assert.deepEqual(textsOf(body, 'chart-tick').slice(0, 6), ['0', '0.2', '0.4', '0.6', '0.8', '1']);
});

test('donut_keeps_a_slice_slot_for_a_zero_value_and_draws_nothing_for_it', () => {
  const build = (values) => drawChart(figureOf('donut', { rows: values.map((value, i) => ({ label: `항목 ${i}`, values: { value } })) }));
  const withZero = build([30, 0, 50]);
  const slices = [...withZero.body.matchAll(/<path d="([^"]*)" fill="[^"]*" stroke="[^"]*"[^>]*class="chart-part dot"/g)].map((m) => m[1]);
  assert.equal(slices.length, 3);
  assert.match(slices[1], /^M [\d.]+ [\d.]+$/);
  assert.ok(!slices[1].includes('A'), 'no arc and no radial edge for a zero slice');
  // 0에서 양수로 바뀌어도 그림 구조(태그 순서)가 같다
  const shape = (body) => [...body.matchAll(/<(\/?[a-z]+)/g)].map((m) => m[1]).join(',');
  assert.equal(shape(withZero.body), shape(build([30, 20, 50]).body));
});

test('stable_slots_keep_the_same_structure_for_zero_and_positive_in_every_bindable_type', () => {
  const shape = (body) => [...body.matchAll(/<(\/?[a-z]+)/g)].map((m) => m[1]).join(',');
  const rowsFor = (a, b) => barRows([['r1', a, b], ['r2', 4, 4]]);
  // 값에 묶인 차트는 모든 프레임이 같은 축을 쓰도록 값 범위(extent)가 고정된다
  const extent = { min: 0, max: 20 };
  const builders = {
    bar: (a, b) => figureOf('bar', { series: names(2), extent, rows: rowsFor(a, b) }),
    stacked: (a, b) => figureOf('stacked', { series: names(2), extent, rows: rowsFor(a, b) }),
    percent: (a, b) => figureOf('percent', { series: names(2), extent, rows: rowsFor(a, b) }),
    line: (a, b) => figureOf('line', { series: names(2), extent, rows: pointRows([[1, a, b], [2, 4, 4]]) }),
    step: (a, b) => figureOf('step', { series: names(2), extent, rows: pointRows([[1, a, b], [2, 4, 4]]) }),
    dumbbell: (a, b) => figureOf('dumbbell', { series: ROLES([['a', 'A', 'compare'], ['b', 'B', 'main']]), extent, rows: rowsFor(a, b) }),
    difference: (a) => figureOf('difference', { series: names(1), extent: { min: -1, max: 10 }, rows: barRows([['r1', a], ['r2', 4]]) }),
    heatmap: (a) => figureOf('heatmap', { rows: [{ label: 'r\u0000c', row: 'r', col: 'c', values: { value: a } }, { label: 'r\u0000d', row: 'r', col: 'd', values: { value: 4 } }] }),
  };
  for (const [type, build] of Object.entries(builders)) {
    const [zero, positive] = [build(0, 0), build(8, 1)];
    assert.equal(shape(drawChart({ ...zero, chart: { ...zero.chart, markIds: true } }).body), shape(drawChart({ ...positive, chart: { ...positive.chart, markIds: true } }).body), type);
  }
  // 값 4 → 400 처럼 거리가 크게 달라도 닿는 선 위치만 달라진다(화살표 칸은 늘 있다)
  const [near, far] = [builders.dumbbell(10, 10.01), builders.dumbbell(10, 40)];
  assert.equal(shape(drawChart(near).body), shape(drawChart(far).body));
});

test('mark_ids_are_unique_and_only_emitted_when_asked', () => {
  const figure = figureOf('percent', { series: names(3), rows: barRows([['r1', 1, 2, 3], ['r2', 0, 0, 0]]) });
  assert.ok(!drawChart(figure).body.includes('data-mark'));
  const marked = drawChart({ ...figure, chart: { ...figure.chart, markIds: true } }).body;
  const ids = [...marked.matchAll(/data-mark(?:-text)?="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 12);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('a:0') && ids.includes('c:1') && ids.includes('a:0.k'));
  assert.ok(marked.includes('data-raw="1"'));
});

test('stacked_summary_lines_are_reserved_from_the_extent_so_the_card_height_does_not_jump', () => {
  const build = (v, extent) => drawChart(figureOf('stacked', { series: names(12), layout: { width: 296 }, extent, rows: barRows([['r', ...Array.from({ length: 12 }, () => v)]]) }));
  const extent = { min: 0, max: 12000 };
  assert.equal(build(1, extent).height, build(1000, extent).height);
  assert.equal(build(1, extent).height, build(12000, extent).height);
});

test('heatmap_fill_attribute_and_css_use_the_same_oklab_interpolation_and_keep_the_numbers', async () => {
  const { mixOklab } = await import('../src/chart/oklab.js');
  const { values } = await import('../src/tokens.js');
  const { body } = drawChart(figureOf('heatmap', { rows: [3, 7].map((value, i) => ({ label: `r\u0000${i}`, row: 'r', col: String(i), values: { value } })) }));
  const [low, high] = [values.color.data['heat-low'], values.color.data['heat-high']];
  // 강도는 소수 셋째 자리로 줄이고(--s), 대체 색은 같은 강도의 OKLab 보간이다
  assert.ok(body.includes('style="--s:0.429"'));
  assert.ok(body.includes(`fill="${mixOklab(low, high, 0.429)}"`));
  assert.ok(body.includes('style="--s:1"') && body.includes(`fill="${high}"`));
  assert.deepEqual(textsOf(body, 'chart-cell'), ['3', '7']);
  const css = readFileSync(new URL('../src/styles/chart.css', import.meta.url), 'utf8');
  assert.match(css, /color-mix\(in oklab,/);
  assert.ok(!/color-mix\(in srgb/.test(css));
});

test('no_rim_no_local_color_arrays_and_no_global_selectors_remain_in_chart_sources', () => {
  const dir = new URL('../src/chart/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/rimRect|\.rim\b|class="[^"]*\brim\b/.test(source), `${file} uses the rim`);
    assert.ok(!/#[0-9a-fA-F]{6}\b/.test(source), `${file} has a hex color literal`);
  }
  assert.ok(!readdirSync(dir).includes('rim.js'));
  const css = readFileSync(new URL('../src/styles/chart.css', import.meta.url), 'utf8');
  assert.ok(!/\.rim\b/.test(css));
  assert.ok(!/^[^.@/}\s*][^{]*\{/m.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'every selector is scoped under .fl');
});

test('every_family_passes_the_finite_coordinate_guard_wide_and_compact_with_fits_that_have_a_room', () => {
  const sampleFigures = (layout) => [
    figureOf('bar', { layout, series: names(5), rows: barRows([['서울', 1, 2, 3, 4, null]]) }),
    figureOf('stacked', { layout, series: names(3), rows: barRows([['서울', 1, -2, 3], ['부산', 2, null, 1]]) }),
    figureOf('percent', { layout, series: names(3), rows: barRows([['서울', 1, 2, 3], ['부산', 0, 0, 0], ['대구', 1, null, 1]]) }),
    figureOf('line', { layout, series: names(3), rows: pointRows([[1, 1, 2, 3], [2, 2, null, 4]]) }),
    figureOf('step', { layout, series: names(3), rows: pointRows([[1, 1, 2, 3], [2, 2, null, 4]]) }),
    figureOf('area', { layout, series: names(2), rows: pointRows([[1, 1, 2], [2, 2, 3]]) }),
    figureOf('ecdf', { layout, series: names(2), rows: sampleRows([[1, 'a'], [2, 'a'], [3, 'b'], [null, 'b']]) }),
    figureOf('donut', { layout, rows: [30, 0, 50].map((value, i) => ({ label: `항목 ${i}`, values: { value } })) }),
    figureOf('heatmap', { layout, rows: [{ label: 'r\u0000c', row: 'r', col: 'c', values: { value: 3 } }] }),
  ];
  for (const layout of [undefined, { width: 296 }]) {
    for (const figure of sampleFigures(layout)) {
      const drawn = drawChart(figure);
      assert.doesNotThrow(() => assertFinite(drawn), `${figure.chartType} ${layout ? 'compact' : 'wide'}`);
      assert.ok(drawn.fits.every(({ width, room }) => Number.isFinite(width) && Number.isFinite(room)));
    }
  }
});

test('compact_layout_draws_every_family_inside_the_compact_width', () => {
  const layout = { width: 296 };
  const figures = [
    figureOf('bar', { series: names(5), layout, rows: barRows([['서울', 1, 2, 3, 4, 5]]) }),
    figureOf('stacked', { series: names(5), layout, rows: barRows([['서울', 1, 2, 3, 4, 5]]) }),
    figureOf('percent', { series: names(5), layout, rows: barRows([['서울', 1, 2, 3, 4, 5]]) }),
    figureOf('line', { series: names(5), layout, rows: pointRows([[1, 1, 2, 3, 4, 5], [2, 2, 3, 4, 5, 6]]) }),
    figureOf('step', { series: names(5), layout, rows: pointRows([[1, 1, 2, 3, 4, 5], [2, 2, 3, 4, 5, 6]]) }),
    figureOf('ecdf', { series: names(3), layout, rows: sampleRows(names(3).flatMap(([id], i) => [[i + 1, id], [i + 3, id]])) }),
  ];
  for (const figure of figures) {
    const drawn = drawChart(figure);
    assert.equal(drawn.width, 296);
    const xs = [...drawn.body.matchAll(/<(?:text|rect|circle|line)[^>]* (?:x|cx|x1|x2)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(xs.every((x) => x >= 0 && x <= 296 + 1), `${figure.chartType} stays inside the width`);
  }
});
