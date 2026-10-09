// 근거: docs/design/charts.md "색 없이 구분하기". 면적도 선, 계단, 누적분포처럼 두 계열 이상이면 끝 이름을 달고, 점의 모양은 범주 번호마다 정해져 범례 칸과 그림 안 점이 같다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { TIERS } from '../src/chart-palette.js';
import { chartOf, chartSource } from './helpers.js';

const SERIES = 9;
const names = Array.from({ length: SERIES }, (_, i) => `s${i}`);
const declared = (count) => names.slice(0, count).map((id, i) => `series ${id} "계열 ${i}"`);

const bodyOf = async (type, lines) => chartOf(await buildFigure(`daphnis 2\n${chartSource(type, lines)}`, { strict: true })).body;
const lineLike = (type, count) => bodyOf(type, ['x "시간(s)"', 'y "값(건)"', ...declared(count), `point x=1 ${names.slice(0, count).map((id, i) => `${id}=${i + 1}`).join(' ')}`, `point x=2 ${names.slice(0, count).map((id, i) => `${id}=${count - i}`).join(' ')}`]);
const scatter = (count) => bodyOf('scatter', ['x "가(s)"', 'y "나(건)"', ...declared(count), ...names.slice(0, count).map((id, i) => `point "p${i}" x=${i + 1} y=${count - i} series=${id}`)]);

// 점 모양 요소 이름. 사각형은 rect, 원은 circle, 마름모(꼭짓점 넷)와 삼각형(셋)은 닫힌 path다.
const kindOf = (tag, attrs) => {
  if (tag === 'circle') return 'circle';
  if (tag === 'rect') return 'square';
  return (attrs.match(/ L /g) ?? []).length === 3 ? 'diamond' : 'triangle';
};
// 점 표식을 문서 순서대로 모은다. 색 변수의 범주 번호는 색 수(일곱)마다 되돌아오므로 계열 번호는 순서로 정하고, 색은 그 순서와 맞는지만 본다.
// 범례 칸은 계열마다 하나, 그림 안 점은 점(행)마다 계열 순서로 한 바퀴씩 돈다.
const marksIn = (fragment, isMark, count) => [...fragment.matchAll(/<(circle|rect|path)\b([^>]*)\/>/g)]
  .filter(([, , attrs]) => isMark(attrs) && /fill="var\(--color-data-category-(?:outline-)?\d+\)"/.test(attrs))
  .map(([, tag, attrs], k) => ({ series: k % count, color: Number(attrs.match(/fill="var\(--color-data-category-(?:outline-)?(\d+)\)"/)[1]) - 1, shape: kindOf(tag, attrs) }));
// 그림 안 점은 점 class(`dot`, `pop`)를 가진다. 범례 칸은 계열 묶음(`cs-`)보다 앞에 있고 class가 없다.
const plotMarks = (body, count) => marksIn(body, (attrs) => /class="(?:dot|pop)"/.test(attrs), count);
const legendMarks = (body, count) => marksIn(body.slice(0, body.indexOf('<g class="cs-')), (attrs) => !attrs.includes('class=') && !attrs.includes(' rx='), count);
const expected = (i) => TIERS.shapes[i % TIERS.shapes.length];
// 모든 표식이 자기 계열 번호의 모양과 색(색 수마다 되돌아옴)을 가진다.
const assertMarks = (marks, label) => {
  for (const mark of marks) {
    assert.equal(mark.shape, expected(mark.series), `${label} series ${mark.series} shape`);
    assert.equal(mark.color, mark.series % 7, `${label} series ${mark.series} color`);
  }
};

test('area_with_two_or_more_series_gets_one_end_label_and_one_leader_per_series', async () => {
  for (const count of [2, 3, 7]) {
    const body = await lineLike('area', count);
    assert.equal((body.match(/class="chart-end-label"/g) ?? []).length, count, `${count} series: one end label each`);
    assert.equal((body.match(/class="chart-leader"/g) ?? []).length, count, `${count} series: one leader each`);
    for (let i = 0; i < count; i++) assert.match(body, new RegExp(`<g class="cs-${i}"><path d="M [^"]*" fill="none" stroke="[^"]*" stroke-width="[\\d.]+" class="chart-leader"`), `series ${i}: the leader sits in its series group`);
  }
});

test('area_with_one_series_has_no_end_label_and_keeps_the_wider_plot', async () => {
  const single = await lineLike('area', 1);
  const several = await lineLike('area', 2);
  assert.doesNotMatch(single, /chart-end-label|chart-leader/);
  const rightEdge = (body) => Math.max(...[...body.matchAll(/class="chart-area chart-band wipe"/g)].flatMap((m) => [...body.slice(Math.max(0, m.index - 200), m.index).matchAll(/ L ([\d.]+) /g)].map((x) => Number(x[1]))));
  assert.ok(rightEdge(several) < rightEdge(single), 'the end label room narrows the plot only when the labels exist');
});

test('line_step_and_ecdf_still_label_their_ends_and_other_charts_do_not', async () => {
  for (const type of ['line', 'step']) assert.equal(((await lineLike(type, 3)).match(/class="chart-end-label"/g) ?? []).length, 3, type);
  assert.equal(((await bodyOf('ecdf', ['x "지연(ms)"', ...declared(3).slice(0, 3), ...names.slice(0, 3).flatMap((id, i) => [`sample ${i + 1} series=${id}`, `sample ${i + 3} series=${id}`])])).match(/class="chart-end-label"/g) ?? []).length, 3, 'ecdf');
  assert.doesNotMatch(await scatter(3), /chart-end-label/);
});

test('scatter_legend_and_plot_dots_share_the_shape_of_the_category_index', async () => {
  const body = await scatter(SERIES);
  const legend = legendMarks(body, SERIES);
  const plot = plotMarks(body, SERIES);

  assert.equal(legend.length, SERIES, 'one legend marker per series');
  assert.equal(plot.length, SERIES, 'one plot dot per series');
  assertMarks([...legend, ...plot], 'scatter');
  assert.deepEqual(plot.map((mark) => mark.shape), legend.map((mark) => mark.shape), 'the plot dot of every series has the shape of its legend marker');
  assert.equal(new Set(legend.slice(0, 4).map((mark) => mark.shape)).size, 4, 'the first four series show four shapes');
});

test('line_and_step_legend_markers_and_vertices_share_the_shape_of_the_category_index', async () => {
  for (const type of ['line', 'step']) {
    const body = await lineLike(type, SERIES);
    const legend = legendMarks(body, SERIES);
    const plot = plotMarks(body, SERIES);

    assert.equal(legend.length, SERIES, `${type}: one legend marker per series`);
    assert.equal(plot.length, SERIES * 2, `${type}: a vertex per series and point`);
    assertMarks([...legend, ...plot], type);
    assert.deepEqual(plot.slice(0, SERIES).map((mark) => mark.shape), legend.map((mark) => mark.shape), `${type}: the vertices of every series have the shape of its legend marker`);
  }
});

test('area_vertices_follow_the_category_index_while_its_legend_keeps_fill_swatches', async () => {
  const body = await lineLike('area', SERIES);
  const plot = plotMarks(body, SERIES);

  assert.equal(plot.length, SERIES * 2);
  assertMarks(plot, 'area');
  const head = body.slice(0, body.indexOf('<g class="cs-'));
  assert.equal((head.match(/<rect [^>]*rx="[\d.]+" fill="var\(--color-data-category-\d+\)"/g) ?? []).length, SERIES, 'the legend of an area is a fill swatch per series');
});
