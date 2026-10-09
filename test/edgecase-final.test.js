// 마지막 런타임 경계 사례: 길이 0인 장면의 소유, 장면 소유 표시 구간, 장면 경계의 값, 빠진 값(히스토그램, 워터폴, 상자), 순서 그림의 장면별 생명주기, 박자 이동 글 상자의 가림 규칙, 같은 여백.
// 시험은 실제 daphnis 2 원본을 컴파일한 결과나 그 결과의 순수 표본 추출만 읽는다. Chrome이 필요한 사례는 edgecase-final-chrome.test.js가 잰다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { CHIP_FRAME_MS, CHIP_VISIBLE_MIN, chipStateAt, planChip } from '../src/chip-plan.js';
import { visibleShare } from '../src/chip-motion.js';
import { sizeChip } from '../src/chip.js';
import { flattenRoute } from '../src/route.js';
import { chipObstacles } from '../src/draw/boxes.js';
import { toHtml } from '../src/html.js';
import { measure } from '../src/measure/fonts.js';
import { finalState, sliceTimeline, toSvg } from '../src/svg.js';
import { loadSampler } from './player-script.js';

const TIMING = { riseMs: 80, holdMs: 80, decayMs: 240, fadeMs: 400 };
const MOVE = [0.4, 0, 0.2, 1];
const { buildScenes, sampleScene } = loadSampler();

// 샘플 추출기가 읽는 재생 데이터. 컴파일러 결과에서 재생기가 받는 조각만 뽑는다.
const playerData = (result) => ({ steps: result.timeline.steps, segs: result.timeline.segs, marks: result.timeline.marks, pulses: result.timeline.pulses, values: result.timeline.values, charts: result.timeline.charts, chartFrames: result.scene.chartFrames, presentation: result.timeline.presentation, metrics: { move: MOVE, pulse: TIMING } });
const frameOf = (result, si, elapsed) => {
  const data = playerData(result);
  return sampleScene(buildScenes(data)[si], data, elapsed);
};

// ---- 길이 0인 장면 ----

const ZERO = (mode = 'static') => `daphnis 2
box b "B"
value n "N" on=b from=0
chart c "C" bar {
 series a "A"
 row "R" a=n
}
view g graph right {
 b
}
view p plot {
 c
}
scene "first" mode=static
 light b
scene "zero" mode=${mode} set="n=7"
 light b
`;

test('a_zero_length_scene_owns_its_value_row_chart_period_and_a_zero_presentation', async () => {
  const { timeline } = await buildFigure(ZERO());
  assert.deepEqual(timeline.segs.map((seg) => [seg.si, seg.t0, seg.t1]), [[0, 0, 900], [1, 900, 900]]);
  assert.deepEqual(timeline.values.map((row) => [row.si, row.periods]), [[0, [[0, 900, '0']]], [1, [[900, 900, '7']]]]);
  assert.deepEqual(timeline.charts.c.rows[1].periods, [[900, 900, 1, []]], '장면 자신의 길이 0 구간이다. 시간을 늘려 채우지 않는다');
  assert.deepEqual(timeline.presentation, [900, 0]);
  assert.deepEqual(timeline.pulses.filter((pulse) => pulse.si === 1), [], '길이 0 장면에는 400ms 꼬리가 없다');
  assert.equal(timeline.total, 900, '전체 길이는 논리 시각의 끝이다');
});

test('the_sampler_reads_the_zero_length_scene_value_and_chart_frame_at_any_time_not_frame_0', async () => {
  const result = await buildFigure(ZERO());
  const frames = result.scene.chartFrames.c.frames;
  for (const elapsed of [0, 250, 99_999]) {
    const frame = frameOf(result, 1, elapsed);
    assert.equal(frame.values[1], '7', `${elapsed}ms`);
    assert.equal(frame.charts.c, 1, `${elapsed}ms`);
    assert.deepEqual(frame.held.lit, ['b'], '길이 0 장면의 켠 도형도 보인다');
  }
  assert.notDeepEqual(frames[1], frames[0], '장면 1의 틀은 처음 값의 틀과 다르다');
  assert.equal(frameOf(result, 0, 0).charts.c, 0);
});

test('static_svg_of_the_zero_length_scene_shows_its_value_with_the_node_lit_and_no_smil', async () => {
  for (const mode of ['static', 'once', 'loop']) {
    const result = await buildFigure(ZERO(mode));
    const svg = await toSvg(result, { scene: 1 });
    assert.doesNotMatch(svg, /<animate|<set |<animateMotion/, `${mode}: 길이 0 장면은 움직임이 없다`);
    assert.match(svg, /class="value" opacity="1"[^>]*data-t="7"/, `${mode}: 값 카드의 글`);
    assert.match(svg, /class="chart-value[^"]*"[^>]*>7</, `${mode}: 차트 값 글자`);
    assert.deepEqual(finalState(sliceTimeline(result.timeline, 1, result.scene)).segs[0].nodesOn, ['b'], `${mode}: 켠 도형`);
    assert.deepEqual(result.timeline.charts.c.rows[1].periods, [[900, 900, 1, []]], `${mode}: 한 번 · 반복도 같다`);
    assert.deepEqual(result.timeline.presentation, [900, 0], mode);
  }
});

test('the_html_player_data_of_the_zero_length_scene_carries_its_chart_period_and_value', async () => {
  const result = await buildFigure(ZERO());
  const html = await toHtml(result, 'scene');
  assert.match(html, /"periods":\[\[900,900,1,\[\]\]\]/, '재생기 데이터에 길이 0 차트 구간이 있다');
  assert.match(html, /"periods":\[\[900,900,"7"\]\]/, '값 줄의 길이 0 구간이 있다');
});

// ---- 장면이 시작할 때 보이는 값이 바뀐 표식의 기준 ----

const MOVING = (second) => `daphnis 2
box a "A"
box b "B"
value n "N" on=b from=0
chart c "C" bar {
 series s "S"
 row "R" s=n
}
a -> b
view g graph right {
 a
 b
}
view p plot {
 c
}
scene "first" mode=once
 a -> b "go" time=500ms set="n+1"
scene "second" mode=once${second}
 a -> b "go" time=500ms set="n+3"
`;

test('a_scene_header_set_or_keep_does_not_start_with_a_chart_pulse_because_the_value_row_starts_at_that_value', async () => {
  for (const header of [' set="n=7"', ' keep="n"']) {
    const result = await buildFigure(MOVING(header));
    const [first, second] = result.timeline.charts.c.rows;
    const t0 = second.t0;
    assert.deepEqual(second.periods[0][3], [], `${header}: 장면이 시작할 때 보이는 값이 기준이라 처음 구간에 바뀐 표식이 없다`);
    assert.deepEqual(result.timeline.pulses.filter((pulse) => pulse.si === 1 && pulse.at === t0), [], `${header}: t0에 펄스가 없다`);
    assert.ok(second.periods.at(-1)[3].length > 0, `${header}: 실제 도착은 바뀐 표식만 강조한다`);
    assert.ok(second.periods.at(-1)[3].every((id) => id.startsWith('s:')), header);
    assert.equal(first.periods[0][3].length, 0);
    assert.ok(result.timeline.presentation[1] <= (second.t1 - t0) + 400 + 1e-9, `${header}: 만든 꼬리가 없다`);
  }
});

test('a_scene_without_set_or_keep_still_pulses_only_for_the_changed_raw_values_after_the_first_event', async () => {
  const result = await buildFigure(MOVING(''));
  const rows = result.timeline.charts.c.rows;
  for (const row of rows) {
    assert.deepEqual(row.periods[0][3], []);
    assert.equal(row.periods.length, 2);
    assert.ok(row.periods[1][3].length > 0);
  }
});

// ---- 조용한 선은 자기 장면 것만 ----

const QUIET = `daphnis 2
box a "A"
box b "B"
box c "C"
a -> b "한" quiet
b -> c "둘" quiet
scene "one" mode=once
 a -> b time=500ms
scene "two" mode=once
 b -> c time=500ms
`;

test('quiet_edge_ranges_belong_to_their_scene_and_the_other_scene_final_state_never_shows_them', async () => {
  const result = await buildFigure(QUIET);
  const { timeline, scene } = result;
  const quiet = scene.edges.flatMap((edge, j) => (edge.quiet ? [j] : []));
  assert.equal(quiet.length, 2);
  for (const [key, ranges] of Object.entries(timeline.marks)) {
    assert.ok(ranges.every((range) => range.length === 3 && Number.isInteger(range[2])), `${key}: [시작, 끝, 장면]`);
  }
  const marksOf = (si) => Object.keys(finalState(sliceTimeline(timeline, si, scene)).marks).sort();
  assert.deepEqual(marksOf(0), [`quiet:${quiet[0]}`]);
  assert.deepEqual(marksOf(1), [`quiet:${quiet[1]}`]);
  const data = playerData(result);
  assert.deepEqual(sampleScene(buildScenes(data)[0], data, 99_999).held.edges, [quiet[0]]);
  assert.deepEqual(sampleScene(buildScenes(data)[1], data, 99_999).held.edges, [quiet[1]]);
});

// ---- 값이 없는 문서의 전체 길이 ----

test('a_document_with_no_motion_has_total_0_and_no_invented_logical_time', async () => {
  const result = await buildFigure('daphnis 2\nbox a "A"\nscene "s" mode=static\n light a\n');
  assert.equal(result.timeline.total, 0);
  assert.deepEqual(result.timeline.presentation, [0]);
});

// ---- 장면 경계의 값: 도착은 정확히 장면 끝에서, 다음 장면은 같은 전역 시각에 처음 값으로 ----

test('an_arrival_counts_exactly_at_the_scene_end_and_the_next_scene_starts_from_the_initial_value_at_the_same_global_time', async () => {
  const result = await buildFigure(`daphnis 2
box a "A"
box b "B"
value n "N" on=b from=0
chart c "C" bar {
 series s "S"
 row "R" s=n
}
a -> b
view g graph right {
 a
 b
}
view p plot {
 c
}
scene "one" mode=once
 a -> b "go" time=500ms set="n+1"
scene "two" mode=once
 light a
`);
  const { timeline } = result;
  const [one, two] = timeline.values;
  assert.deepEqual([one.changes, two.initial, two.periods], [[[500, '1']], '0', [[900, 900, '0']]]);
  const at = (si, elapsed) => frameOf(result, si, elapsed);
  assert.equal(at(0, 499.9).values[0], '0');
  assert.equal(at(0, 500).values[0], '1', '도착 시각 그 자체부터 1이다');
  assert.equal(at(0, 99_999).values[0], '1', '장면 1의 끝과 꼬리는 1을 보인다');
  assert.equal(at(0, 99_999).charts.c, 1);
  assert.equal(at(1, 0).values[1], '0', '다음 장면의 처음은 0이다');
  assert.equal(at(1, 99_999).values[1], '0');
  assert.equal(at(1, 0).charts.c, 0);
  // 표본은 이전 프레임에 기대지 않는다: 어떤 순서로 재도 같은 시각은 같은 모습이다.
  const forward = [0, 3, 500, 700, 99_999].map((elapsed) => JSON.stringify(at(0, elapsed)));
  const backward = [99_999, 700, 500, 3, 0].map((elapsed) => JSON.stringify(at(0, elapsed))).reverse();
  assert.deepEqual(backward, forward);
  // 정지 그림(선택한 장면의 마지막 모습)도 같다
  const finalOne = await toSvg(result, { scene: 0, isStatic: true });
  const finalTwo = await toSvg(result, { scene: 1, isStatic: true });
  assert.match(finalOne, /class="value" opacity="1"[^>]*data-t="1"/);
  assert.match(finalTwo, /class="value" opacity="1"[^>]*data-t="0"/);
});

test('a_net_zero_change_inside_one_scene_never_cancels_another_scene_that_changes_at_the_same_global_time', async () => {
  const result = await buildFigure(`daphnis 2
box a "A"
box b "B"
value n "N" on=b from=0
a -> b
scene "one" mode=once
 a -> b "up" time=500ms set="n+1" & a -> b "down" time=500ms set="n-1"
scene "two" mode=once set="n=4"
 light b
`);
  const { timeline } = result;
  const keys = (si) => timeline.pulses.filter((pulse) => pulse.si === si && pulse.key.startsWith('value:'));
  assert.deepEqual(keys(0), [], '같은 틱의 순증감 0은 바뀐 값이 아니다');
  assert.deepEqual(keys(1), [], '다음 장면의 처음 값 4는 펄스가 아니다');
  assert.equal(timeline.values[1].initial, '4');
});

// ---- 빠진 값: 히스토그램, 워터폴, 상자 ----

const chartDoc = (type, lines) => `daphnis 2\nchart c "T" ${type} {\n${lines.map((line) => ` ${line}`).join('\n')}\n}\nview p plot "p" {\n c\n}\n`;
const bodyOf = async (source) => (await buildFigure(source)).scene.plots[0].chart.body;
// 원본 모형의 차트(행에서 정해지는 구간, 장부)
const modelOf = (result) => result.figure.nodes.find((node) => node.shape === 'chart').plot.chart;
const textsOf = (body) => [...body.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]);
const ticksOf = (body) => [...body.matchAll(/class="chart-tick[^"]*">([^<]*)</g)].map((m) => m[1]);

test('a_histogram_with_every_sample_missing_has_no_bin_and_no_bar_and_never_counts_zero_observations', async () => {
  for (const lines of [['bins 0 4 4', 'sample -', 'sample -'], ['bins auto', 'sample -', 'sample -']]) {
    const result = await buildFigure(chartDoc('histogram', lines));
    const body = result.scene.plots[0].chart.body;
    assert.equal((body.match(/chart-histogram-bin/g) ?? []).length, 0, lines[0]);
    assert.ok(textsOf(body).includes('값 없음'), '값 없음 글');
    assert.ok(textsOf(body).includes('결측 2개 제외'));
    assert.deepEqual(modelOf(result).bins, []);
    assert.doesNotMatch(body, /NaN|Infinity|undefined/);
    const html = await toHtml(result, 'static');
    const table = html.match(/<table>[\s\S]*?<\/table>/g).at(-1);
    assert.doesNotMatch(table, /<td>0<\/td>/, '표도 0건 구간을 만들지 않는다');
    assert.match(table, /값 없음/);
  }
  assert.deepEqual(ticksOf(await bodyOf(chartDoc('histogram', ['bins auto', 'sample -']))).slice(0, 2), ['0', '1'], '구간이 없으면 대체 범위 0~1이다');
});

test('histogram_probability_divides_by_the_observed_samples_and_zero_samples_are_a_real_observation', async () => {
  const result = await buildFigure(chartDoc('histogram', ['bins 0 4 4 measure=probability', 'sample 1', 'sample -', 'sample 3']));
  const { bins, observed, missingCount } = modelOf(result);
  assert.deepEqual([observed, missingCount], [2, 1]);
  assert.deepEqual(bins.map((bin) => bin.count), [0, 1, 0, 1]);
  const heights = [...result.scene.plots[0].chart.body.matchAll(/data-count="(\d+)" data-value="([\d.]+)"/g)].map((m) => Number(m[2]));
  assert.equal(heights.reduce((sum, value) => sum + value, 0), 1, '비율의 합이 관측 수 2로 나눠 1이다');
  const zeros = modelOf(await buildFigure(chartDoc('histogram', ['bins auto', 'sample 0', 'sample 0', 'sample 0']))).bins;
  assert.deepEqual(zeros.map((bin) => bin.count), [3], '실제 0은 세 건이다(결측과 다르다)');
});

test('a_waterfall_with_a_missing_delta_has_an_unknown_running_total_from_there_on', async () => {
  const one = await buildFigure(chartDoc('waterfall', ['row "a" value=10', 'row "b" value=-', 'row "c" value=5', 'total "T"']));
  const { ledger } = modelOf(one);
  assert.deepEqual(ledger, [
    { from: 0, to: 10, change: 10, total: false },
    { from: 10, to: null, change: null, total: false },
    { from: null, to: null, change: 5, total: false },
    { from: 0, to: null, total: true },
  ]);
  const body = one.scene.plots[0].chart.body;
  assert.equal((body.match(/class="chart-waterfall-bar"/g) ?? []).length, 1, '막대는 알려진 첫 행뿐이다');
  assert.equal((body.match(/chart-waterfall-connector/g) ?? []).length, 0, '알 수 없는 행에 닿는 연결선이 없다');
  assert.ok(textsOf(body).includes('+5'), '누계를 모르는 증감은 증감 자신만 적는다');
  assert.ok(!textsOf(body).includes('= 15') && !textsOf(body).some((text) => /15/.test(text)), '15를 만들지 않는다');
  assert.deepEqual(textsOf(body).filter((text) => text === '값 없음').length, 2, '빠진 증감과 알 수 없는 합계');
  assert.deepEqual(ticksOf(body), ['0', '2', '4', '6', '8', '10'], '축은 알려진 끝점 0~10이다');
  const html = await toHtml(one, 'static');
  const table = html.match(/<table>[\s\S]*?<\/table>/)[0];
  const cumulative = [...table.matchAll(/<tr><th scope="row">[^<]*<\/th><td>[^<]*<\/td><td>[^<]*<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => m[1]);
  assert.deepEqual(cumulative, ['10', '-', '-', '-'], '표의 누계는 첫 결측부터 -다');

  const none = await buildFigure(chartDoc('waterfall', ['row "a" value=-', 'row "b" value=-', 'total "T"']));
  const noneBody = none.scene.plots[0].chart.body;
  assert.equal((noneBody.match(/chart-waterfall-bar|chart-waterfall-connector/g) ?? []).length, 0);
  assert.deepEqual(ticksOf(noneBody).slice(0, 2), ['0', '1']);
  assert.deepEqual(textsOf(noneBody).filter((text) => text === '값 없음').length, 3);

  const zero = await buildFigure(chartDoc('waterfall', ['row "a" value=0', 'total "T"']));
  assert.deepEqual(modelOf(zero).ledger, [{ from: 0, to: 0, change: 0, total: false }, { from: 0, to: 0, total: true }], '0은 실제 값이다');
  assert.ok(textsOf(zero.scene.plots[0].chart.body).includes('= 0'));
});

test('a_box_row_with_missing_quartiles_draws_no_glyph_and_keeps_the_numbers_it_has', async () => {
  const result = await buildFigure(chartDoc('box', ['row "full" min=1 q1=2 median=3 q3=4 max=5', 'row "part" min=- q1=2 median=3 q3=4 max=-', 'row "none" min=- q1=- median=- q3=- max=-']));
  const body = result.scene.plots[0].chart.body;
  assert.equal((body.match(/class="chart-box"/g) ?? []).length, 1, '다섯 값이 모두 있는 행만 모양이 있다');
  assert.ok(textsOf(body).includes('− · 2 · 3 · 4 · −'), '있는 숫자는 자리에 남고 빠진 자리는 −다');
  assert.ok(textsOf(body).includes('− · − · − · − · −'));
  assert.doesNotMatch(body, /NaN|undefined/);
  assert.ok(ticksOf(body).length >= 2 && ticksOf(body).every((tick) => Number.isFinite(Number(tick))), '축 눈금이 숫자다');
  await assert.rejects(() => buildFigure(chartDoc('box', ['row "bad" min=5 q1=2 median=3 q3=- max=-'])), /box values need min ≤ q1/, '있는 값끼리는 순서를 지킨다');
  const html = await toHtml(result, 'static');
  assert.match(html.match(/<table>[\s\S]*?<\/table>/)[0], /<th scope="row">part<\/th><td>값 없음<\/td><td>2<\/td><td>3<\/td><td>4<\/td><td>값 없음<\/td>/);
});

// ---- 순서 그림: 장면마다 따로 생명주기 ----

const SEQ_HEAD = 'daphnis 2\nbox client "Client"\nbox worker "Worker"\nclient -> worker\nview g graph {\n  client worker\n}\nview s sequence {\n  client worker\n}\n';
const sequenceSource = (body) => SEQ_HEAD + body;

test('two_alternative_scenes_can_each_create_and_destroy_the_same_participant_and_a_third_uses_it_from_the_start', async () => {
  const result = await buildFigure(sequenceSource(`scene "A" mode=once
  client -> worker "make" create
  activate worker
  worker -> client "ok" dashed
  client -> worker "end" destroy
scene "B" mode=once
  client -> worker "make" create
  activate worker
  client -> worker "end" destroy
scene "C" mode=once
  client -> worker "plain"
  worker -> client "back"
`), { strict: true });
  const sequence = result.scene.panels.findIndex((panel) => panel.strategy === 'sequence');
  const lines = result.scene.lifelines.filter((line) => line.panel === sequence && line.id === 'worker');
  assert.deepEqual(lines.map((line) => line.si), [0, 1, 2], '소멸이 있는 참여자는 장면마다 생명선이 있다');
  const ends = lines.map((line) => line.y2);
  assert.ok(ends[0] < ends[2] && ends[1] < ends[2], 'A와 B의 생명선만 소멸에서 끊긴다');
  assert.equal(ends[2], Math.max(...ends), '소멸이 없는 장면은 가장 긴 장면의 끝까지다');
  const heads = result.scene.items.filter((item) => item.panel === sequence && item.id === 'worker');
  const client = result.scene.items.find((item) => item.panel === sequence && item.id === 'client');
  assert.equal(heads[0].y, client.y, '장면 C는 처음부터 있는 참여자라 머리가 처음 자리다(다른 장면의 생성이 내리지 않는다)');
  assert.deepEqual(result.scene.destructions.filter((mark) => mark.panel === sequence).map((mark) => mark.si), [0, 1]);
  assert.deepEqual(result.scene.activations.filter((bar) => bar.panel === sequence).map((bar) => [bar.si, bar.depth]), [[0, 0], [1, 0]], '열린 활성이 다음 장면으로 새지 않는다');
  for (const bar of result.scene.activations) assert.ok(bar.h > 0, '막대가 닫힌다');
  const svgC = await toSvg(result, { scene: 2, isStatic: true });
  assert.equal((svgC.match(/class="lifeline"/g) ?? []).length + (svgC.match(/class="lifeline fl-off"/g) ?? []).length, 4, '선은 모두 같은 자리에 있고 장면 밖은 fl-off다');
  assert.equal((svgC.match(/class="lifeline"/g) ?? []).length, 2, '보이는 선은 client와 worker의 장면 C 선이다');
});

test('a_participant_created_in_every_scene_where_it_appears_at_the_same_row_still_moves_its_head', async () => {
  const result = await buildFigure(sequenceSource('scene "A" mode=once\n  client -> worker "make" create\nscene "B" mode=once\n  client -> worker "make" create\n'), { strict: true });
  const sequence = result.scene.panels.findIndex((panel) => panel.strategy === 'sequence');
  const head = result.scene.items.find((item) => item.panel === sequence && item.id === 'worker');
  const client = result.scene.items.find((item) => item.panel === sequence && item.id === 'client');
  assert.ok(head.y > client.y, '두 장면이 같은 행에서 만들면 머리가 생성 행으로 내려간다');
});

test('lifecycle_errors_inside_one_scene_stay_errors_but_never_cross_scenes', async () => {
  const bad = [
    ['scene "A"\n  client -> worker "x"\n  client -> worker "make" create\n', /before creation/],
    ['scene "A"\n  client -> worker "make" create\n  client -> worker "again" create\n', /more than once/],
    ['scene "A"\n  client -> worker "end" destroy\n  client -> worker "late"\n', /after destruction/],
    ['scene "A"\n  client -> worker "work"\n  activate worker\n', /close activation/],
    ['scene "A"\n  client -> worker "end" destroy\n  activate worker\n', /not alive/],
    ['scene "A"\n  client -> worker "make" create\nscene "B"\n  client -> worker "x"\n  client -> worker "make" create\n', /before creation/],
  ];
  for (const [body, message] of bad) await assert.rejects(() => buildFigure(sequenceSource(body)), message, body);
  await buildFigure(sequenceSource('scene "A"\n  client -> worker "end" destroy\nscene "B"\n  client -> worker "again"\n  client -> worker "end" destroy\n'));
  await buildFigure(sequenceSource('scene "A"\n  client -> worker "work"\n  activate worker\n  deactivate worker\nscene "B"\n  client -> worker "work"\n  activate worker\n  deactivate worker\n'));
});

// ---- 박자 이동의 글 상자: 글자는 가리지 않고 윤곽은 자리가 모자랄 때만 ----

const LINE_SCENE = { width: 600, height: 300, edges: [{ points: [{ x: 20, y: 150 }, { x: 580, y: 150 }] }] };
const LINE_HOP = { edge: 0, ms: 2400, isBack: false, data: ['메시지'] };
const overlaps = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0.5;

// 계획을 60fps로 훑어 보이는 프레임 수와, 막는 사각형을 보이는 채로 겹친 프레임 수를 센다.
function walk(plan, blockers) {
  const move = { route: flattenRoute(LINE_SCENE.edges[0].points), hop: LINE_HOP, chip: sizeChip(LINE_HOP.data) };
  let overlapped = 0;
  for (let t = 0; t <= LINE_HOP.ms; t += CHIP_FRAME_MS) {
    const { box, opacity } = chipStateAt(move, plan.path, t);
    if (opacity >= CHIP_VISIBLE_MIN && blockers.some((blocker) => overlaps(box, blocker))) overlapped += 1;
  }
  return { overlapped, share: visibleShare(move, plan.path) };
}

test('a_box_beat_chip_may_cover_a_shape_outline_but_never_text_a_pill_or_the_inside_of_a_card', () => {
  const wall = { x: 30, y: 0, w: 570, h: 300, name: '벽' };
  const frame = planChip(LINE_SCENE, LINE_HOP, [{ ...wall, isFrame: true }]);
  assert.ok(walk(frame, []).share >= 0.6, `도형 윤곽만 가로막으면 6할 이상 보인다: ${walk(frame, []).share}`);
  for (const [kind, blocker] of [['text', wall], ['pill', { ...wall, isPill: true }]]) {
    const plan = planChip(LINE_SCENE, LINE_HOP, [blocker]);
    const result = walk(plan, [blocker]);
    assert.ok(result.share < 0.6, `${kind}: 숨는다(${result.share})`);
    assert.equal(result.overlapped, 0, `${kind}: 보이는 프레임에서 겹치지 않는다`);
  }
  const inner = planChip(LINE_SCENE, LINE_HOP, [{ ...wall, isFrame: true }, { ...wall, isInner: true, name: '카드' }]);
  assert.ok(walk(inner, [{ ...wall, name: '카드' }]).share < 0.6, '윤곽을 덮을 수 있어도 안쪽(카드)은 덮지 않는다');
  assert.equal(walk(inner, [{ ...wall, name: '카드' }]).overlapped, 0);
});

test('in_every_example_a_visible_beat_chip_covers_no_text_icon_card_or_pill_and_every_short_chip_is_reported', async () => {
  const names = readdirSync(new URL('../examples/', import.meta.url)).filter((file) => file.endsWith('.dap'));
  let hops = 0;
  const hidden = [];
  for (const name of names) {
    const source = readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
    const result = await buildFigure(source, { baseDir: 'examples' });
    const glyphs = chipObstacles(result.scene, result.timeline).filter((box) => !box.isFrame);
    for (const seg of result.timeline.segs) {
      for (const hop of seg.hops.filter((candidate) => candidate.data && candidate.track === undefined)) {
        hops += 1;
        const move = { route: flattenRoute(result.scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) };
        for (let t = 0; t <= (hop.cut ?? hop.ms); t += CHIP_FRAME_MS) {
          const { box, opacity } = chipStateAt(move, hop.chipPath, t);
          const hit = glyphs.find((glyph) => overlaps(box, glyph));
          assert.ok(opacity < CHIP_VISIBLE_MIN || !hit, `${name}: ${Math.round(t)}ms에 "${hop.data.join(' ')}"가 ${hit?.name}을 가린다`);
        }
        if (visibleShare(move, hop.chipPath) < 0.6) hidden.push(`${name}\u0000${hop.data.join(' ')}`);
      }
    }
    const reported = result.warnings.filter((warning) => warning.code === 'check-7' && warning.message.includes('is hidden for'));
    for (const entry of hidden.filter((item) => item.startsWith(`${name}\u0000`))) {
      const text = entry.split('\u0000')[1];
      assert.ok(reported.some((warning) => warning.message.includes(`"${text}"`)), `${name}: 6할을 못 채우는 "${text}"는 7번 경고로 알린다`);
    }
  }
  assert.ok(hops > 20, `잰 박자 이동 ${hops}개`);
});

// ---- 같은 좌우 여백: 허용 폭의 실제 닿는 거리를 예약한다 ----

const MARGIN = 28;
const TOLERANCE = 1;
// 이 두 차트에 나오는 글 종류: [class, 글자 크기, 글꼴]
const TEXT_STYLES = [['chart-title', 15, 'semibold'], ['chart-legend', 11, 'regular'], ['chart-label', 13, 'medium'], ['chart-value', 11, 'num'], ['chart-tick', 11, 'num'], ['chart-unit', 11, 'regular']];

// 글 하나가 닿는 가로 구간. 끝 맞춤(end)은 x가 오른쪽 끝, 눈금은 가운데 맞춤이다.
function textSpan(x, className, text) {
  const tokens = className.split(' ');
  const [, size, face] = TEXT_STYLES.find(([name]) => tokens.includes(name));
  const width = measure(text.replace(/<[^>]+>/g, ''), size, tokens.includes('ours') && face === 'num' ? 'numSemibold' : face);
  if (tokens.includes('end') || (tokens.includes('chart-unit') && !tokens.includes('start'))) return [x - width, x];
  if (tokens.includes('chart-tick')) return [x - width / 2, x + width / 2];
  return [x, x + width];
}

// 눈에 보이는 잉크가 닿는 가로 구간. 글 뒤 바탕(chart-text-bg)은 잉크가 아니라 센다 않는다.
function inkSpans(body) {
  const spans = [];
  for (const m of body.matchAll(/<text x="([\d.-]+)"[^>]*class="([^"]+)">(.*?)<\/text>/g)) spans.push(textSpan(Number(m[1]), m[2], m[3]));
  for (const m of body.matchAll(/<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"(?![^>]*chart-text-bg)[^>]*\/>/g)) spans.push([Number(m[1]), Number(m[1]) + Number(m[2])]);
  for (const m of body.matchAll(/<circle cx="([\d.-]+)" cy="[\d.-]+" r="([\d.]+)"/g)) spans.push([Number(m[1]) - Number(m[2]), Number(m[1]) + Number(m[2])]);
  for (const m of body.matchAll(/<line x1="([\d.-]+)" x2="([\d.-]+)"/g)) spans.push([Number(m[1]), Number(m[2])].sort((a, b) => a - b));
  return spans;
}

test('difference_and_histogram_leave_the_same_margin_on_both_sides_by_reserving_only_what_they_draw', async () => {
  for (const [type, lines] of [['difference', ['x "차이(%p)"', 'series d "차이"', 'row "r" d=2 d.low=1 d.high=3']], ['histogram', ['x "지연(ms)"', 'bins 0 4 2', 'sample 1', 'sample 3']]]) {
    const { body, width } = (await buildFigure(chartDoc(type, lines))).scene.plots[0].chart;
    const spans = inkSpans(body);
    const [left, right] = [Math.min(...spans.map(([start]) => start)), Math.max(...spans.map(([, end]) => end))];
    assert.ok(Math.abs(left - MARGIN) <= TOLERANCE, `${type}: 왼쪽 ${left}`);
    assert.ok(Math.abs(width - right - MARGIN) <= TOLERANCE, `${type}: 오른쪽 여백 ${width - right}`);
  }
});

// ---- 값에 묶인 표식의 설명: 처음 값으로 굳는 <title>이 없고, 프레임이 바꾸지 못하는 설명이 달라지면 그리기의 결함이다 ----

const DONUT_HEAD = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue q "q" on=db from=12\nvalue r "r" on=db from=0\n';
const DONUT_VIEWS = 'view g graph right "g" {\n a\n db\n c\n}\nview p plot "p" {\n c\n}\n';
const DONUT = (word = 'donut') => `${DONUT_HEAD}chart c "도넛" ${word} {\n  row "A" value=q\n  row "B" value=7\n  row "C" value=20\n  row "D" value=r\n}\n${DONUT_VIEWS}a -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+1"\n  a -> db "x" time=500ms set="r+3"\n`;

test('a_bound_donut_slice_has_no_title_child_in_html_or_svg_but_an_unbound_donut_keeps_its_tooltip', async () => {
  const result = await buildFigure(DONUT());
  const html = await toHtml(result, 'scene');
  const svg = await toSvg(result, { scene: 0 });
  assert.equal((html.match(/<path[^>]*chart-part[^>]*><title>/g) ?? []).length, 0, 'HTML: 묶인 조각에 title이 없다');
  assert.equal((svg.match(/<path[^>]*chart-part[^>]*><title>/g) ?? []).length, 0, 'SVG: 묶인 조각에 title이 없다');
  assert.match(html, /<path[^>]*chart-part[^>]*aria-label="1\. A: 12 · 30\.8%"/, 'HTML의 aria-label은 처음 값을 싣고 재생기가 현재 값으로 바꾼다');
  const unbound = await buildFigure('daphnis 2\nchart c "고정" donut {\n  row "A" value=3\n  row "B" value=1\n}\nview p plot "p" {\n c\n}\n');
  assert.equal((unbound.scene.plots[0].chart.body.match(/<path[^>]*chart-part[^>]*><title>/g) ?? []).length, 2, '고정 도넛은 설명이 맞아 title이 남는다');
});

test('the_animated_svg_never_animates_aria_label_and_drops_the_stale_label_while_the_static_final_layer_keeps_the_final_one', async () => {
  const result = await buildFigure(DONUT());
  const svg = await toSvg(result, { scene: 0 });
  assert.doesNotMatch(svg, /attributeName="aria-label"/, 'aria-label은 SMIL로 바꿀 수 없다');
  const [motion, still] = svg.split('class="fl-still"');
  assert.doesNotMatch(motion, /<path[^>]*chart-part[^>]*aria-label/, '움직임 층의 조각은 굳은 설명을 갖지 않는다');
  assert.match(still, /<path[^>]*chart-part[^>]*aria-label="1\. A: 13 · 30\.2%"/, '마지막 모습 층은 마지막 값의 설명이다');
  assert.match(still, /aria-label="4\. D: 3 · 7\.0%"/);
});

test('every_effect_clone_of_a_bound_chart_is_hidden_from_the_accessibility_tree', async () => {
  const result = await buildFigure(DONUT());
  const svg = await toSvg(result, { scene: 0 });
  const html = await toHtml(result, 'scene');
  for (const [name, markup] of [['svg', svg], ['html', html]]) {
    const clones = markup.match(/<[^>]*data-pulse-of="[^"]*"[^>]*>/g) ?? [];
    assert.ok(clones.length > 0, `${name}: 겹침이 있다`);
    for (const clone of clones) assert.match(clone, /aria-hidden="true"/, `${name}: ${clone.slice(0, 80)}`);
  }
});

test('the_frame_pairing_refuses_a_title_or_label_outside_a_mark_that_differs_between_frames', async () => {
  const { frameSet } = await import('../src/chart/frames.js');
  const bar = (title, label) => `<g role="img" aria-label="${label}"><title>${title}</title><rect data-mark="a" data-raw="1" x="0"/></g>`;
  assert.doesNotThrow(() => frameSet([bar('같음', 'x'), bar('같음', 'x')]));
  assert.throws(() => frameSet([bar('처음', 'x'), bar('나중', 'x')]), /description outside a mark/);
  assert.throws(() => frameSet([bar('같음', 'x'), bar('같음', 'y')]), /description outside a mark/);
  const mark = (title, label) => `<path data-mark="a" data-raw="1" aria-label="${label}"><title>${title}</title></path>`;
  assert.throws(() => frameSet([mark('처음', 'l'), mark('나중', 'l')]), /description outside a mark/, '표식 안의 title이 프레임마다 달라도 굳는 설명이다');
  assert.doesNotThrow(() => frameSet(['<path data-mark="a" data-raw="1" aria-label="처음"/>', '<path data-mark="a" data-raw="2" aria-label="나중"/>']), '표식 자신의 aria-label은 재생기가 바꾼다');
});

// ---- 보이지 않는 변형은 접근성 트리에도 없다: 불투명도와 함께 보임을 같은 시각에 바꾼다 ----

test('hidden_variants_start_hidden_and_their_visibility_animation_has_the_keytimes_of_their_opacity_animation', async () => {
  const result = await buildFigure(`${DONUT_HEAD}chart c "막대" bar {\n  series s "S"\n  row "R" s=q\n}\n${DONUT_VIEWS}a -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+1"\n`);
  const svg = (await toSvg(result, { scene: 0 })).split('class="fl-still"')[0];
  const variants = [...svg.matchAll(/<(?:text|g)\b[^>]*\sdata-v="[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(variants.length > 0, '값 글자 변형이 있다');
  for (const tag of variants) assert.match(tag, /visibility="hidden"/, tag);
  const pairs = [...svg.matchAll(/<animate attributeName="visibility"[^>]*keyTimes="([^"]*)"[^>]*\/><animate attributeName="opacity"[^>]*keyTimes="([^"]*)"/g)];
  assert.ok(pairs.length > 0);
  for (const [, visibility, opacity] of pairs) assert.equal(visibility, opacity, '보임과 불투명도의 keyTimes가 같다');
  assert.ok((svg.match(/<g opacity="0" visibility="hidden"><animate attributeName="visibility"/g) ?? []).length > 0, '차트 글 변형도 같다');
});
