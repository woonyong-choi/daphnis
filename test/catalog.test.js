import assert from 'node:assert/strict';
import { test } from 'node:test';

import { catalogCoverage } from '../scripts/lib/catalog-coverage.mjs';

test('catalogCoverage_distinguishes_edges_hops_tracks_and_their_options', () => {
  const coverage = catalogCoverage('daphnis 2\nbox a "A"\nbox b "B"\na -> b dashed\nscene "실행" mode=once\n  a -> b time=1s\n  track a -> b at=0s every=1s\n');
  assert.deepEqual(coverage.edge, [4]);
  assert.deepEqual(coverage.dashed, [4]);
  assert.deepEqual(coverage.hop, [6]);
  assert.deepEqual(coverage['time=1s'], [6]);
  assert.deepEqual(coverage.track, [7]);
  assert.deepEqual([coverage.at, coverage.every], [[7], [7]]);
  assert.deepEqual(coverage['mode=once'], [5]);
});

test('catalogCoverage_ignores_option_names_in_quoted_text_and_comments', () => {
  const coverage = catalogCoverage('daphnis 2\nbox a "icon=server count=3" # fill=red\n');
  assert.equal(coverage.icon, undefined);
  assert.equal(coverage.count, undefined);
  assert.equal(coverage.fill, undefined);
  // 같은 낱말이라도 원본이 선택 사항으로 쓰면 센다
  assert.deepEqual(catalogCoverage('daphnis 2\nbox a "icon=server count=3" icon=server # fill=red\n')['icon=server'], [2]);
});

test('catalogCoverage_distinguishes_chart_kind_view_mode_table_columns_and_parallel_moves', () => {
  const chart = catalogCoverage('daphnis 2\nchart c "차트" bar {\n  x "x"\n  series a "A"\n  row "r" a=3\n}\nview v plot {\n  c\n}\n');
  assert.deepEqual([chart['chart:bar'], chart['view:plot'], chart.series, chart.row], [[2], [7], [4], [5]]);
  assert.equal(chart['chart:line'], undefined);
  const table = catalogCoverage('daphnis 2\ntable t "표" {\n  id "int" pk\n}\n');
  assert.deepEqual([table.column, table.pk], [[3], [3]]);
  const parallel = catalogCoverage('daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\na -> c\nscene "s" mode=once\n  a -> b & a -> c\n');
  assert.deepEqual([parallel['&'], parallel.hop, parallel.edge], [[8], [8], [5, 6]]);
});

test('catalogCoverage_rejects_a_source_the_lexer_cannot_read', () => {
  assert.throws(() => catalogCoverage('daphnis 2\nbox a "A"\nvalue m "m" on=a := n+1\n'), /write options as key=value/);
});
