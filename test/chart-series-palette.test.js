// 근거: 계열의 색은 범주 팔레트가 정한다. main은 기록된 첫째 범주, compare는 둘째 범주이고 역할이 없는 계열은 자기 번호의 범주다(src/chart/metrics.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryPaint } from '../src/chart-palette.js';
import { seriesBoundary, seriesColor, seriesFill, seriesOutline, seriesPaint } from '../src/chart/metrics.js';
import { tokens, values } from '../src/tokens.js';

const chartOf = (...roles) => ({ series: roles.map((role) => ({ role })) });

test('seriesPaint_maps_main_and_compare_to_the_first_two_categories_whatever_the_declaration_order', () => {
  const chart = chartOf('compare', 'main');

  assert.equal(seriesPaint(chart, 0).index, 1);
  assert.equal(seriesPaint(chart, 1).index, 0);
  assert.equal(seriesFill(chart, 0), tokens.color.data.category[2]);
  assert.equal(seriesFill(chart, 1), tokens.color.data.category[1]);
  assert.equal(seriesOutline(chart, 0), tokens.color.data['category-outline'][2]);
});

test('seriesPaint_gives_a_series_without_a_role_its_own_category_and_a_single_series_the_first', () => {
  const many = chartOf(undefined, undefined, undefined, undefined);

  assert.deepEqual([0, 1, 2, 3].map((i) => seriesPaint(many, i).index), [0, 1, 2, 3]);
  assert.equal(seriesPaint({ series: [] }, 0).index, 0, 'scatter points have no series and use the first category');
  assert.equal(seriesPaint(chartOf(undefined), 0).index, 0);
  assert.deepEqual(seriesPaint(many, 9), categoryPaint(9), 'past the palette the tier rises instead of the color wrapping silently');
  assert.ok(seriesPaint(many, 9).needsLabel);
});

test('series_color_is_a_stroke_safe_border_for_main_and_the_bright_anchor_for_compare', () => {
  const chart = chartOf('main', 'compare');

  assert.equal(seriesColor(chart, 0), tokens.color.data['category-outline'][1], 'a line in the main color keeps a border that holds 3:1 in both modes');
  assert.equal(seriesColor(chart, 1), tokens.color.data.category[2], 'the compare series is the bright anchor, supported by its yellow boundary');
  assert.equal(seriesFill(chart, 0), tokens.color.data.category[1], 'a bar face is the anchor in both modes');
  assert.match(seriesBoundary(chart, 1), new RegExp(`stroke="${tokens.color.data['category-outline'][2].replace(/[()]/g, '\\$&')}" stroke-width="${values.border.tag}"`));
  assert.equal(seriesBoundary(chart, 0), '');
});
