// 시각 수정: 값이 모두 0이거나 모두 빠진 차트. 0은 값이고(눈에 보이는 가장 짧은 표식과 값 글자 0. 표식의 폭은 표시 최소이지 값이 아니다), 빠진 값은 표식 없이 틀과 축만 그리며, 비율은 합이 0이면 정해지지 않고 그 뜻을 글로 알린다.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { COPY } from '../src/chart/copy.js';
import { valueRange } from '../src/chart/extent.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { ALL_MISSING, ALL_ZERO } from './visual-fix-edge-fixture.js';

const bodyOf = async (source) => (await buildFigure(source)).scene.plots[0].chart.body;
const textsOf = (body) => [...body.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]);

for (const [type, source] of Object.entries(ALL_ZERO)) {
  test(`${type}_with_every_value_0_compiles_and_draws_a_frame`, async () => {
    const body = await bodyOf(source);
    assert.ok(body.length > 100);
    assert.doesNotMatch(body, /NaN|Infinity|undefined/, '숫자가 깨지지 않는다');
  });
}

for (const [type, source] of Object.entries(ALL_MISSING)) {
  test(`${type}_with_every_value_missing_compiles_with_no_numeric_mark`, async () => {
    const result = await buildFigure(source);
    const body = result.scene.plots[0].chart.body;
    assert.doesNotMatch(body, /NaN|Infinity|undefined/);
    assert.equal((body.match(/class="dot"/g) ?? []).length, 0, `${type}: 값이 없으니 점이 없다`);
  });
}

test('a_bar_with_every_value_0_has_ticks_0_and_1_the_minimum_visible_mark_and_the_label_0', async () => {
  const body = await bodyOf(ALL_ZERO.bar);
  assert.deepEqual([...body.matchAll(/class="chart-tick">([^<]*)</g)].map((m) => m[1]), ['0', '1']);
  assert.equal([...body.matchAll(/class="chart-value[^"]*"[^>]*>([^<]*)</g)].filter((m) => m[1] === '0').length, 4, '값 글자 0이 칸마다 있다');
  // 값 0은 길이 0인 경로가 아니라 눈에 보이는 가장 짧은 막대(space.1)로 그린다. 이 폭은 값이 아니라 표시 최소이고, 값은 글자 0이 말한다.
  const minimum = values.space['1'];
  const widths = (markup) => [...markup.matchAll(/<rect [^>]*\swidth="([\d.]+)" height="12"[^>]*class="grow"/g)].map((m) => Number(m[1]));
  assert.ok(minimum > 0, '표시 최소는 양수라 수학적 0이 아니다');
  assert.deepEqual(widths(body), [minimum, minimum, minimum, minimum], '값이 모두 0이면 모든 막대가 표시 최소다');
  const mixed = widths(await bodyOf(ALL_ZERO.bar.replace('row "웹" a=0 b=0', 'row "웹" a=9 b=0')));
  assert.ok(mixed[0] > minimum * 20, `같은 차트에서 양수 9는 표시 최소보다 훨씬 길다: ${mixed}`);
  assert.deepEqual(mixed.slice(1), [minimum, minimum, minimum], '0인 나머지 칸은 여전히 표시 최소이고 길이로 값을 말하지 않는다');
});

test('a_chart_with_every_value_missing_says_no_data_and_never_writes_a_zero_value', async () => {
  for (const type of ['line', 'step', 'ecdf']) {
    const body = await bodyOf(ALL_MISSING[type]);
    assert.ok(textsOf(body).includes(COPY.noData), `${type}: 값 없음 글이 있다`);
    assert.equal((body.match(/class="dot"/g) ?? []).length, 0, `${type}: 점이 없다`);
  }
  const bar = await bodyOf(ALL_MISSING.bar);
  assert.ok(textsOf(bar).filter((text) => text === '비교 없음').length >= 2, 'bar: 칸마다 안내 글');
  assert.equal([...bar.matchAll(/class="chart-value[^"]*"[^>]*>([^<]*)</g)].length, 0, 'bar: 값 글자가 없다');
  assert.equal((bar.match(/class="grow"/g) ?? []).length, 0, 'bar: 막대가 없다');
});

test('series_labels_and_the_legend_stay_when_every_value_is_missing_and_the_data_table_says_no_value_never_0', async () => {
  const result = await buildFigure(ALL_MISSING.line);
  const html = await toHtml(result, 'static');
  const body = result.scene.plots[0].chart.body;
  for (const label of ['A', 'B']) assert.ok(textsOf(body).includes(label), `범례 ${label}`);
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
  assert.match(table, new RegExp(`<td[^>]*>${COPY.noData}</td>`), '표는 빠진 값을 값 없음으로 말한다');
  assert.doesNotMatch(table, /<td[^>]*>0<\/td>/);
});

test('pie_and_donut_with_total_0_draw_an_empty_ring_and_the_note_and_never_write_0_percent', async () => {
  for (const type of ['pie', 'donut']) {
    const body = await bodyOf(ALL_ZERO[type]);
    const notes = [...body.matchAll(/class="chart-missing"[^>]*>([^<]*)</g)].map((m) => m[1]).join(' ');
    assert.ok(notes.includes('합계 0') && notes.includes('비율 정의 불가'), `${type}: ${notes}`);
    assert.match(body, /class="chart-empty"(?! visibility)/, `${type}: 빈 고리가 보인다`);
    assert.doesNotMatch(body, /\d%/, `${type}: 0%를 쓰지 않는다`);
    assert.doesNotMatch(body, /data-at="NaN"|NaN/);
  }
});

test('a_pie_with_a_positive_total_keeps_the_empty_ring_and_the_note_hidden', async () => {
  const body = await bodyOf(ALL_ZERO.pie.replace('value=0\n  row "API" value=0', 'value=3\n  row "API" value=1'));
  assert.match(body, /class="chart-empty" visibility="hidden"/);
  assert.match(body, /class="chart-missing" visibility="hidden"/);
  assert.match(body, /\d+(\.\d)?%/);
});

const HEAD = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue x "x" on=db from=0\nvalue y "y" on=db from=0\n';
const FLOW = (set) => `a -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="${set}"\n`;
const VIEWS = 'view g graph right "g" {\n  a\n  db\n  c\n}\nview p plot "p" {\n  c\n}\n';

// 값이 0에서 시작하는 묶인 막대는 모든 프레임이 값이 가질 모든 글(0과 3)로 정한 한 축(0~3)을 쓴다. 장면 둘로 나눠 처음 프레임(값 0)과 바뀐 프레임(값 3)을 같은 문서에서 그려 비교한다.
test('a_bound_bar_whose_metric_starts_at_0_keeps_one_axis_and_one_title_and_card_geometry_before_and_after_the_value_changes', async () => {
  const flow = 'a -> db\nscene "전" mode=static\n  light a\nscene "후" mode=once\n  a -> db "w" time=500ms set="x+3"\n';
  const result = await buildFigure(`${HEAD}chart c "지표" bar {\n  series a "값"\n  row "하나" a=x\n  row "둘" a=y\n}\n${VIEWS}${flow}`);
  assert.ok(result.scene.chartFrames.c.frames.length >= 2, '값이 바뀌어 프레임이 둘 이상이다');
  const [before, after] = await Promise.all([0, 1].map((scene) => toSvg(result, { scene, isStatic: true })));
  const texts = (svg, className) => [...svg.matchAll(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)" class="${className}">([^<]*)<`, 'g'))].map((m) => m.slice(1, 4).join('|'));
  const frame = (svg) => ({
    ticks: [...svg.matchAll(/class="chart-tick">([^<]*)</g)].map((m) => m[1]),
    tickPositions: texts(svg, 'chart-tick'),
    title: texts(svg, 'chart-title'),
    labels: texts(svg, 'chart-label'),
    axis: [...svg.matchAll(/<line [^>]*class="chart-axis"\/>/g)].map((m) => m[0]),
    card: [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="720" height="[\d.]+"[^>]*class="fl-stroke[^"]*"/g)].map((m) => m[0].replace(/ class="[^"]*"/, '')),
  });
  assert.deepEqual(frame(before).ticks, ['0', '1', '2', '3', '0', '1', '2', '3'], '축은 값이 가질 가장 큰 글 3까지 처음부터 정해진다(그래프 카드와 차트 판 두 곳)');
  assert.deepEqual(frame(after), frame(before), '값이 바뀌어도 눈금, 눈금 자리, 제목, 행 이름, 축, 카드 크기가 같다');
  assert.ok(frame(before).card.length > 0 && frame(before).title.length > 0, '비교한 요소가 비어 있지 않다');
  const widths = (svg) => [...svg.matchAll(/<rect [^>]*width="([\d.]+)" height="12"[^>]*class="grow"/g)].map((m) => Number(m[1]));
  const shown = (svg) => [...svg.matchAll(/class="chart-value[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(shown(before).slice(0, 2), ['0', '0']);
  assert.deepEqual(shown(after).slice(0, 2), ['3', '0'], '값 글자는 프레임마다 달라 두 프레임이 실제로 다르다');
  assert.ok(widths(after)[0] > values.space['1'] * 20 && widths(before)[0] === values.space['1'], '막대 길이도 같은 축 위에서 달라진다');
});

test('a_bound_percent_with_zero_totals_at_start_keeps_the_axis_0_to_100_and_pulses_the_changed_raw', async () => {
  const result = await buildFigure(`${HEAD}chart c "비율" percent {\n  series a "가"\n  series b "나"\n  row "행" a=x b=y\n}\n${VIEWS}${FLOW('x+3')}`);
  const { frames } = result.scene.chartFrames.c;
  assert.ok(frames.length >= 2);
  const periods = result.timeline.charts.c.rows[0].periods;
  assert.ok(periods.flatMap((p) => p[3]).some((id) => id.startsWith('a:')), '바뀐 원자료가 강조된다');
  const body = result.scene.plots[0].chart.body;
  assert.match(body, />100</, '축은 0에서 100까지다');
});

test('a_negative_value_and_a_log_zero_are_still_refused_at_their_line', async () => {
  await assert.rejects(() => buildFigure(ALL_ZERO.bar.replace('a=0 b=0\n  row "API"', 'a=-1 b=0\n  row "API"')), /values cannot be negative/);
  await assert.rejects(() => buildFigure(ALL_ZERO.dumbbell.replace('{\n', '{\n  scale log\n')), /log scale needs values above 0/);
});

test('value_range_gives_one_fallback_for_an_empty_list_and_the_real_range_otherwise', () => {
  assert.deepEqual(valueRange([]), { min: 0, max: 0, empty: true });
  assert.deepEqual(valueRange([], 'log'), { min: 1, max: 10, empty: true });
  assert.deepEqual(valueRange([3, -1, 7]), { min: -1, max: 7 });
});
