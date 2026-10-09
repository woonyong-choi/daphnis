// 차트 v2 순수 계산: 결측, 0, 누적분포, 계단, 퍼센트, 부호 있는 누적, 값 범위, OKLab. 기대값은 손으로 적은 숫자다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definedRuns, ecdfGroups, ecdfPoints, ecdfVertices, hvPath, lengthFractions, linePath, percentRows, spanFractions, stackExtent, stackRows, stepVertices } from '../src/chart/data.js';
import { extentOfFrames } from '../src/chart/extent.js';
import { hexToOklab, mixOklab, oklabToHex } from '../src/chart/oklab.js';

const row = (values) => ({ values });

test('ecdf_counts_unique_values_with_integer_counts_then_divides', () => {
  assert.deepEqual(ecdfPoints([1, 1, 3, 4]), { n: 4, missing: 0, points: [{ value: 1, count: 2, p: 0.5 }, { value: 3, count: 3, p: 0.75 }, { value: 4, count: 4, p: 1 }] });
  // 정렬되지 않은 입력과 음수 0
  assert.deepEqual(ecdfPoints([4, -0, 0, 3]).points.map((p) => [p.count, p.p]), [[2, 0.5], [3, 0.75], [4, 1]]);
});

test('ecdf_never_turns_missing_into_zero', () => {
  const result = ecdfPoints([1, null, 3, undefined, Number.NaN]);
  assert.equal(result.n, 2);
  assert.equal(result.missing, 3);
  assert.deepEqual(result.points.map((p) => [p.value, p.p]), [[1, 0.5], [3, 1]]);
  assert.ok(!result.points.some((p) => p.value === 0));
});

test('ecdf_single_sample_and_empty_group', () => {
  assert.deepEqual(ecdfPoints([7]).points, [{ value: 7, count: 1, p: 1 }]);
  assert.deepEqual(ecdfPoints([null, null]), { n: 0, missing: 2, points: [] });
  assert.deepEqual(ecdfVertices([], { left: 0, right: 10, x: (v) => v, y: (p) => p }), []);
});

test('ecdf_groups_split_samples_by_series_and_one_group_without_series', () => {
  const chart = { series: [{ id: 'a' }, { id: 'b' }], rows: [row({ value: 1, series: 'a' }), row({ value: 2, series: 'b' }), row({ value: null, series: 'b' })] };
  const groups = ecdfGroups(chart);
  assert.deepEqual(groups.map((g) => [g.id, g.n, g.missing]), [['a', 1, 0], ['b', 1, 1]]);
  assert.deepEqual(ecdfGroups({ series: [], rows: [row({ value: 1 }), row({ value: 2 })] }).map((g) => [g.id, g.n]), [[undefined, 2]]);
});

test('ecdf_path_starts_at_zero_left_rises_per_value_and_runs_to_the_right_edge_with_h_and_v_only', () => {
  const { points } = ecdfPoints([1, 1, 3, 4]);
  // x는 값 × 10, y는 높이가 클수록 위(화면 좌표라 100 - 100p)
  const vertices = ecdfVertices(points, { left: 0, right: 50, x: (v) => v * 10, y: (p) => 100 - p * 100 });
  assert.equal(hvPath(vertices), 'M 0 100 H 10 V 50 H 30 V 25 H 40 V 0 H 50');
  assert.deepEqual(vertices.at(-1), { x: 50, y: 0 });
  // 점 k의 꼭대기는 2k + 2번 꼭짓점
  assert.deepEqual(points.map((_, k) => vertices[2 * k + 2].y), [50, 25, 0]);
});

test('definedRuns_breaks_at_missing_and_sorts_by_x', () => {
  const points = [row({ x: 3, a: 3 }), row({ x: 1, a: 1 }), row({ x: 2, a: null }), row({ x: 4, a: 4 }), row({ x: 5, a: 5 })];
  const runs = definedRuns(points, 'a');
  assert.deepEqual(runs.map((run) => run.map((p) => p.values.x)), [[1], [3, 4, 5]]);
  assert.deepEqual(definedRuns([row({ x: 1, a: null })], 'a'), []);
});

test('step_path_uses_only_h_and_v_and_never_extends_the_last_point', () => {
  const run = [{ x: 0, y: 10 }, { x: 10, y: 5 }, { x: 20, y: 8 }];
  const d = hvPath(stepVertices(run));
  assert.equal(d, 'M 0 10 H 10 V 5 H 20 V 8');
  assert.deepEqual(d.match(/[A-Za-z]/g), ['M', 'H', 'V', 'H', 'V']);
  // 마지막 점은 수평선을 늘이지 않는다: 마지막 꼭짓점이 마지막 점이다
  assert.deepEqual(stepVertices(run).at(-1), { x: 20, y: 8 });
  // 점 하나뿐인 묶음은 선분이 없다
  assert.equal(hvPath(stepVertices([{ x: 1, y: 1 }])), '');
});

test('line_path_restarts_with_M_after_a_gap_and_skips_single_point_runs', () => {
  const runs = [[{ x: 0, y: 0 }, { x: 10, y: 5 }], [{ x: 20, y: 5 }], [{ x: 30, y: 1 }, { x: 40, y: 2 }]];
  assert.equal(linePath(runs), 'M 0 0 L 10 5 M 30 1 L 40 2');
});

test('arrival_fractions_skip_gaps_with_zero_length', () => {
  const runs = [[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 100, y: 0 }, { x: 110, y: 0 }]];
  assert.deepEqual(lengthFractions(runs), [[0, 0.5], [0.5, 1]]);
  assert.deepEqual(spanFractions(runs), [[0, 10 / 110], [100 / 110, 1]]);
  assert.deepEqual(lengthFractions([[{ x: 1, y: 1 }]]), [[0]]);
});

test('percent_rows_sum_to_exactly_100_and_keep_the_raw_values', () => {
  const [ok] = percentRows([row({ a: 30, b: 20, c: 21 })], ['a', 'b', 'c']);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.sum, 71);
  assert.equal(ok.parts.at(-1).to, 100);
  assert.deepEqual(ok.parts.map((p) => p.value), [30, 20, 21]);
  assert.ok(Math.abs(ok.parts[0].share - (30 / 71) * 100) < 1e-12);
  assert.equal(ok.parts[1].from, ok.parts[0].to);
});

test('percent_rows_with_trailing_zero_series_still_end_at_100', () => {
  const [ok] = percentRows([row({ a: 1, b: 2, c: 0 })], ['a', 'b', 'c']);
  assert.deepEqual(ok.parts.map((p) => [p.from === ok.parts[0].from ? 'first' : 'later', p.to]), [['first', ok.parts[0].to], ['later', 100], ['later', 100]]);
  assert.equal(ok.parts[2].from, 100);
});

test('percent_rows_zero_sum_and_missing_have_no_share_and_are_never_drawn_as_zero_percent', () => {
  const [zero, missing] = percentRows([row({ a: 0, b: 0 }), row({ a: 5, b: null })], ['a', 'b']);
  assert.equal(zero.state, 'zero');
  assert.equal(zero.sum, 0);
  assert.ok(zero.parts.every((p) => p.share === undefined && p.from === 0 && p.to === 0));
  assert.equal(missing.state, 'missing');
  assert.equal(missing.sum, undefined);
  assert.ok(missing.parts.every((p) => p.share === undefined));
  assert.deepEqual(missing.parts.map((p) => p.value), [5, null]);
});

test('percent_rows_reject_negative_values', () => {
  assert.throws(() => percentRows([row({ a: -1, b: 2 })], ['a', 'b']), RangeError);
});

test('stack_rows_stack_positive_up_and_negative_down_from_zero_in_series_order', () => {
  const [stack] = stackRows([row({ a: 3, b: -4, c: 5, d: -1 })], ['a', 'b', 'c', 'd']);
  assert.deepEqual(stack.parts.map((p) => [p.from, p.to]), [[0, 3], [0, -4], [3, 8], [-4, -5]]);
  assert.equal(stack.positive, 8);
  assert.equal(stack.negative, -5);
  assert.equal(stack.total, 3);
});

test('stack_rows_with_a_missing_value_have_no_bar_and_no_total', () => {
  const [stack] = stackRows([row({ a: 3, b: null })], ['a', 'b']);
  assert.equal(stack.state, 'missing');
  assert.equal(stack.total, undefined);
  assert.ok(stack.parts.every((p) => p.from === 0 && p.to === 0));
});

test('stack_extent_covers_positive_and_negative_sums_and_always_zero', () => {
  const rows = [row({ a: 3, b: -4, c: 5 }), row({ a: -2, b: -3, c: 1 }), row({ a: 100, b: null, c: 1 })];
  assert.deepEqual(stackExtent(rows, ['a', 'b', 'c']), { min: -5, max: 8 });
  assert.deepEqual(stackExtent([row({ a: 2, b: 3 })], ['a', 'b']), { min: 0, max: 5 });
  assert.deepEqual(stackExtent([row({ a: null })], ['a']), { min: 0, max: 0 });
});

test('frame_extents_are_fixed_per_type', () => {
  const frames = [[row({ a: 3, b: -4 })], [row({ a: 10, b: -1 })]];
  assert.deepEqual(extentOfFrames('percent', ['a', 'b'], frames), { min: 0, max: 100 });
  assert.deepEqual(extentOfFrames('ecdf', [], frames), { min: 0, max: 1 });
  assert.deepEqual(extentOfFrames('stacked', ['a', 'b'], frames), { min: -4, max: 10 });
  assert.deepEqual(extentOfFrames('bar', ['a', 'b'], frames), { min: -4, max: 10 });
  assert.deepEqual(extentOfFrames('bar', ['a'], [[row({ a: null, x: 5 })]]), { min: 0, max: 0, empty: true }, '값이 하나도 없으면 축만 정하는 대체 범위다');
  assert.deepEqual(extentOfFrames('bar', ['a'], [[row({ a: null })]], 'log'), { min: 1, max: 10, empty: true });
});

test('oklab_mix_matches_hand_computed_values', () => {
  assert.equal(mixOklab('#1e6bd6', '#f2d024', 0), '#1e6bd6');
  assert.equal(mixOklab('#1e6bd6', '#f2d024', 1), '#f2d024');
  // 검정과 흰색의 가운데는 L 0.5, 선형 0.125이고 sRGB 99(0x63)이다
  assert.equal(mixOklab('#000000', '#ffffff', 0.5), '#636363');
  // 왕복은 8비트 안에서 제자리다
  for (const hex of ['#b2cbf1', '#1e6bd6', '#fa1955', '#269c6e']) assert.equal(oklabToHex(hexToOklab(hex)), hex);
  // 흰색의 OKLab은 L 1, a와 b는 0
  const [L, a, b] = hexToOklab('#ffffff');
  assert.ok(Math.abs(L - 1) < 1e-6 && Math.abs(a) < 1e-4 && Math.abs(b) < 1e-4);
});
