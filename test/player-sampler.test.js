// 사건 표본 추출기(src/player/sample.js)의 순수 계약. 컴파일러, 브라우저, 시계 없이 정본 시간표 모양을 손으로 적은 데이터로 잰다.
// 이 시험의 데이터는 재생기가 읽는 시간표 모양(docs/playback.md)을 그대로 적은 것이지 컴파일러 출력이 아니다. 같은 계약을 실제 daphnis 2 원본의 컴파일러 출력으로 test/player-compiled.test.js가 따로 잰다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { arrivalOffsetMs, curveOf, positionAt } from '../src/easing.js';
import { loadSampler } from './player-script.js';

const { buildScenes, sampleScene, timeAtProgress, progressAt } = loadSampler();
const MOVE = [0.4, 0, 0.2, 1];
const TIMING = { riseMs: 80, holdMs: 80, decayMs: 240, fadeMs: 400 };
const EPSILON = 1e-9;

const seg = (si, t0, t1, extra = {}) => ({ si, t0, t1, hops: [], nodesOn: [], partsOn: [], cards: {}, cardsBefore: {}, cardsAt: {}, charts: {}, ...extra });
const step = (mode, speed = 1, label = 'S') => ({ label, mode, speed });
const TAIL = 400;

// 컴파일러가 정하는 표시 길이(presentation)를 이 시험이 따로 계산한 값. 공식은 같고 코드는 다르다(src/timeline-marks.js를 부르지 않는다):
// D = max((T - t0) / speed, (마지막 펄스 - t0) / speed + 400, (마지막 선 이탈 - t0) / speed + 400). 선 이탈은 이동이 끝나는 시각(at + cut ?? ms)이다.
function presentationFor(steps, segs, pulses = []) {
  return steps.map((s, si) => {
    const mine = segs.filter((g) => g.si === si);
    if (!mine.length || !s || typeof s !== 'object' || !(s.speed > 0)) return 0;
    const [t0, t1] = [mine[0].t0, mine.at(-1).t1];
    const events = [
      ...mine.flatMap((g) => (g.pulses ?? []).map(({ at }) => g.t0 + at)),
      ...pulses.filter((p) => p.si === si).map((p) => p.at),
      ...mine.flatMap((g) => g.hops.map((hop) => Math.min(t1, g.t0 + (hop.at ?? 0) + (hop.cut ?? hop.ms)))),
    ];
    return Math.max((t1 - t0) / s.speed, ...events.map((at) => (at - t0) / s.speed + TAIL));
  });
}
// 값과 차트의 펄스는 출처 장면(si)을 갖는다. 적지 않으면 장면 0이다.
const dataOf = (steps, segs, extra = {}) => {
  const pulses = extra.pulses?.map((pulse) => ({ si: 0, ...pulse }));
  return { steps, segs, metrics: { move: MOVE, pulse: TIMING }, presentation: presentationFor(steps, segs, pulses), ...extra, ...(pulses ? { pulses } : {}) };
};
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < EPSILON, `${message ?? ''} ${actual} != ${expected}`);
const frameAt = (data, elapsed, si = 0) => sampleScene(buildScenes(data)[si], data, elapsed);
const json = (value) => JSON.stringify(value);

// 점 네 개가 한 장면에서 겹치는 흐름: 같은 시각(600)에 이어 받는 두 점, 동시에 도는 다른 선의 점, 역방향 점.
function flowData({ mode = 'once', speed = 1, extraHops = [], pulses = [{ id: 'b', at:600 }, { id: 'c', at:1200 }] } = {}) {
  const hops = [{ edge: 0, at: 0, ms: 600 }, { edge: 0, at: 600, ms: 600 }, { edge: 1, at: 100, ms: 300 }, ...extraHops];
  return dataOf([step(mode, speed)], [seg(0, 0, 2000, { hops, pulses })]);
}

describe('sampler: 선과 고정 알약', () => {
  // 근거: 선은 점이 하나 이상 올라 있는 동안 켜지고, 알약은 선이 비면 400ms 동안 줄어든다
  test('edges_stay_active_while_any_packet_is_live_and_pills_decay_over_400ms_after', () => {
    const data = flowData();
    const at = (elapsed) => frameAt(data, elapsed).edges;
    assert.deepEqual(at(150), { 0: { active: true, pill: 1 }, 1: { active: true, pill: 1 } });
    // 선 1의 점은 100~400에 있다. 450은 비운 지 50ms라 알약이 1 - 50/400이다.
    near(at(450)[1].pill, 0.875);
    assert.equal(at(450)[1].active, false);
    assert.equal(at(450)[0].active, true);
    assert.equal(at(800)[1], undefined);
  });

  // 근거: 선 위에 점이 여럿이면 마지막 점이 나갈 때까지 켜져 있다
  test('simultaneous_packets_on_one_edge_keep_it_active_until_the_last_leaves', () => {
    const data = flowData({ extraHops: [{ edge: 0, at: 300, ms: 600 }] });
    const [scene] = buildScenes(data);
    assert.deepEqual(scene.edgeRuns.get(0), [[0, 1200]]);
    for (const elapsed of [100, 700, 899, 1100]) assert.equal(frameAt(data, elapsed).edges[0].active, true, `${elapsed}`);
  });

  // 근거: 한 점이 나가는 시각에 다른 점이 같은 선에 들어서면 꺼지는 프레임이 없다
  test('an_exit_and_an_entry_at_the_same_timestamp_never_produce_an_off_frame', () => {
    const data = flowData();
    const [scene] = buildScenes(data);
    assert.deepEqual(scene.edgeRuns.get(0), [[0, 1200]]);
    for (let elapsed = 0; elapsed < 1200; elapsed += 0.25) {
      const edge = frameAt(data, elapsed).edges[0];
      assert.deepEqual(edge, { active: true, pill: 1 }, `${elapsed}ms에 선이 꺼졌다`);
    }
    assert.deepEqual(frameAt(data, 1200).edges[0], { active: false, pill: 1 });
    near(frameAt(data, 1400).edges[0].pill, 0.5);
  });

  // 근거: 역방향 점은 같은 물리 선을 쓴다. 선 하나의 사용 구간으로 합쳐지고 떨어진 구간은 따로다
  test('a_reverse_packet_uses_the_same_physical_edge_and_gaps_stay_separate_runs', () => {
    const data = flowData({ extraHops: [{ edge: 0, at: 1300, ms: 400, isBack: true }] });
    const [scene] = buildScenes(data);
    assert.deepEqual(scene.edgeRuns.get(0), [[0, 1200], [1300, 1700]]);
    near(frameAt(data, 1250).edges[0].pill, 1 - 50 / 400);
    assert.equal(frameAt(data, 1250).edges[0].active, false);
    assert.equal(frameAt(data, 1500).edges[0].active, true);
  });

  // 근거: 여러 선을 지나는 점은 도형 안 구간(gaps)에서 어느 선에도 올라 있지 않고, 같은 선을 두 번 지나면 두 구간이다
  test('a_multi_leg_packet_occupies_each_leg_edge_only_outside_the_node_gaps', () => {
    const hop = { track: 0, at: 0, ms: 1000, legEdges: [3, 3, 4], gaps: [[0.3, 0.4], [0.7, 0.8]], edges: [3, 4], isBack: false };
    const data = dataOf([step('once')], [seg(0, 0, 2000, { hops: [hop], pulses: [] })]);
    const [scene] = buildScenes(data);
    const at = (progress) => 1000 * timeAtProgress(MOVE, progress);
    const [first, second] = scene.edgeRuns.get(3);
    near(first[0], 0);
    near(first[1], at(0.3));
    near(second[0], at(0.4));
    near(second[1], at(0.7));
    const [last] = scene.edgeRuns.get(4);
    near(last[0], at(0.8));
    near(last[1], 1000);
    const gap = (at(0.3) + at(0.4)) / 2;
    assert.equal(frameAt(data, gap).edges[3].active, false);
    assert.ok(frameAt(data, gap).edges[3].pill > 0.5, '도형 안을 지나는 동안 알약은 줄어드는 중이다');
    assert.equal(frameAt(data, at(0.5)).edges[3].active, true);
    assert.equal(frameAt(data, at(0.5)).edges[4], undefined);
  });

  // 근거: 사라지는 점은 자르는 시각(cut)까지만 선에 있고, 그 뒤 구간의 선은 켜지지 않으며, 도착 후광이 없다
  test('a_lost_packet_leaves_the_edge_at_its_cut_and_never_reaches_later_legs_or_pulses', () => {
    const lost = { track: 0, at: 0, ms: 1000, cut: 100, legEdges: [5, 6], gaps: [[0.5, 0.5]], edges: [5, 6] };
    const data = dataOf([step('once')], [seg(0, 0, 2000, { hops: [lost, { edge: 7, at: 0, ms: 1000, cut: 200 }], pulses: [] })]);
    const [scene] = buildScenes(data);
    assert.deepEqual(scene.edgeRuns.get(5), [[0, 100]]);
    assert.equal(scene.edgeRuns.get(6), undefined);
    assert.deepEqual(scene.edgeRuns.get(7), [[0, 200]]);
    assert.equal(frameAt(data, 199).edges[7].active, true);
    assert.equal(frameAt(data, 200).edges[7].active, false);
    for (const elapsed of [0, 150, 900, 1500]) assert.deepEqual(Object.keys(frameAt(data, elapsed).pulses), [], '사라진 점은 카드 후광이 없다');
  });
});

describe('sampler: 후광', () => {
  // 근거: 후광은 올라가는 80ms, 유지 80ms, 내려오는 240ms를 표시 시각으로 재고, 장면 speed와 상관없다
  test('pulse_envelope_is_80_80_240_display_ms_for_every_authored_speed', () => {
    for (const speed of [1, 4, 0.5]) {
      const data = dataOf([step('once', speed)], [seg(0, 0, 3000, { pulses: [{ id: 'b', at:400 }] })]);
      const onset = 400 / speed;
      const level = (x) => frameAt(data, onset + x).pulses['node:b'];
      near(level(40), 0.5, `speed ${speed}`);
      near(level(80), 1);
      near(level(159), 1);
      near(level(160), 1);
      near(level(200), 1 - 40 / 240);
      near(level(280), 0.5);
      assert.ok(level(399) > 0 && level(399) < 0.01, `speed ${speed}: ${level(399)}`);
      assert.equal(level(400), undefined);
      assert.equal(frameAt(data, onset - 1).pulses['node:b'], undefined);
    }
  });

  // 근거: 같은 키의 후광이 겹쳐도 더하지 않고 가장 센 하나만 쓴다
  test('overlapping_pulses_on_one_key_compose_by_maximum_not_sum', () => {
    const data = dataOf([step('once')], [seg(0, 0, 2000, { pulses: [{ id: 'b', at:0 }, { id: 'b', at:100 }] })]);
    const level = (x) => frameAt(data, x).pulses['node:b'];
    near(level(60), 0.75, '두 번째 후광 전에는 첫 후광만');
    // 150: 첫 후광은 유지 중(1), 둘째는 올라가는 중(50/80). 더하면 1을 넘는다.
    near(level(150), 1);
    // 200: 첫 후광은 내려오는 중(1 - 40/240), 둘째는 유지 중(1).
    near(level(200), 1);
    // 300: 첫 후광 1 - 140/240, 둘째 1 - 40/240. 큰 쪽이다.
    near(level(300), 1 - 40 / 240);
    // 420: 첫 후광은 끝났고 둘째만 1 - 160/240이다.
    near(level(420), 1 - 160 / 240);
    for (let x = 0; x < 600; x += 7) assert.ok((level(x) ?? 0) <= 1, `${x}`);
  });

  // 근거: 값과 차트 틀의 후광 시각은 시간표(data.pulses)가 정한 것이다. 같은 시각에 쓴 기록은 마지막 글이 보이고, 시간표가 순변화 없음으로 뺀 시각에는 후광이 없다
  test('value_pulses_come_from_the_compiled_pulse_list_and_the_last_same_tick_write_is_shown', () => {
    const periods = [[0, 500, '0'], [500, 500, '1'], [500, 500, '2'], [500, 1000, '0'], [1000, 1000, '7'], [1000, 2000, '9']];
    // 500의 1 → 2 → 0은 처음 글로 돌아와 시간표가 후광을 넣지 않았다. 1000의 9는 실제 변화다.
    const data = dataOf([step('once')], [seg(0, 0, 2000)], { values: [{ si: 0, periods }], pulses: [{ key: 'value:0', at: 1000 }] });
    const frame = (x) => frameAt(data, x);
    assert.equal(frame(520).pulses['value:0'], undefined);
    assert.equal(frame(500).values[0], '0');
    assert.equal(frame(999).values[0], '0');
    assert.equal(frame(1000).values[0], '9', '같은 시각에 마지막으로 쓴 글이 보인다');
    near(frame(1040).pulses['value:0'], 0.5);
    assert.equal(frame(1400).pulses['value:0'], undefined);
    assert.equal(frame(2000).values[0], '9');
  });

  // 근거: 다른 장면의 값 줄은 이 장면에서 보이지 않고 후광도 없다. 후광은 장면 시각 범위 안의 것만 이 장면의 것이다
  test('values_of_other_scenes_are_hidden_and_never_pulse', () => {
    const pulses = [{ key: 'value:0', at: 500, si: 0 }, { key: 'value:1', at: 1500, si: 1 }];
    const data = dataOf([step('once'), step('once')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { pulses, values: [{ si: 0, periods: [[0, 500, 'a'], [500, 1000, 'b']] }, { si: 1, periods: [[1000, 1500, 'c'], [1500, 2000, 'd']] }] });
    const scenes = buildScenes(data);
    const first = sampleScene(scenes[0], data, 540);
    assert.deepEqual([first.values, Object.keys(first.pulses)], [['b', undefined], ['value:0']]);
    const second = sampleScene(scenes[1], data, 540);
    assert.deepEqual([second.values, Object.keys(second.pulses)], [[undefined, 'd'], ['value:1']]);
  });

  // 근거: 차트는 시간표가 정한 표만 후광이 있고, 차트 id마다 독립이며 첫 차트만 움직이는 제한이 없다
  test('chart_marks_pulse_per_chart_id_from_the_compiled_pulse_list', () => {
    const charts = {
      c1: { id: 'c1', rows: [{ si: 0, periods: [[0, 400, 0, []], [400, 400, 1, ['m1']], [400, 800, 0, []], [800, 1200, 2, ['m2']]] }] },
      c2: { id: 'c2', rows: [{ si: 0, periods: [[0, 600, 0, []], [600, 1200, 1, ['a']]] }] },
    };
    const chartFrames = {
      c1: { marks: [{ id: 'm1' }, { id: 'm2' }], frames: [{ m1: { h: 1 }, m2: { h: 2 } }, { m1: { h: 3 }, m2: { h: 2 } }, { m1: { h: 1 }, m2: { h: 5 } }] },
      c2: { marks: [{ id: 'a' }], frames: [{ a: { v: 1 } }, { a: { v: 2 } }] },
    };
    // 400의 m1은 같은 시각에 왔다가 돌아온 틀이라 시간표가 후광을 넣지 않았다.
    const pulses = [{ key: 'chart:c2:a', at: 600 }, { key: 'chart:c1:m2', at: 800 }];
    const data = dataOf([step('once')], [seg(0, 0, 1200)], { charts, chartFrames, pulses });
    const keys = (x) => Object.keys(frameAt(data, x).pulses).sort();
    assert.deepEqual(keys(420), []);
    assert.deepEqual(keys(640), ['chart:c2:a']);
    assert.deepEqual(keys(840), ['chart:c1:m2', 'chart:c2:a'], '두 차트가 같은 장면에서 따로 움직인다');
    assert.deepEqual(keys(1000), ['chart:c1:m2'], '바뀌지 않은 표 m1은 후광이 없다');
    assert.deepEqual(frameAt(data, 900).charts, { c1: 2, c2: 1 });
    assert.deepEqual(frameAt(data, 100).charts, { c1: 0, c2: 0 });
  });

  // 근거: 차트 틀. 이 장면에 시간표 행이 없는 차트는 장면에 들어서는 순간 처음 틀(0번)이다. 앞 장면의 마지막 틀이 남지 않는다
  test('a_chart_without_rows_in_a_scene_shows_frame_zero_on_entry', () => {
    const charts = { c1: { id: 'c1', rows: [{ si: 0, periods: [[0, 500, 0, []], [500, 1000, 1, ['m']]] }] } };
    const chartFrames = { c1: { marks: [{ id: 'm' }], frames: [{ m: { h: 1 } }, { m: { h: 2 } }] } };
    const data = dataOf([step('once'), step('once')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { charts, chartFrames });
    const scenes = buildScenes(data);
    assert.deepEqual(sampleScene(scenes[0], data, 900).charts, { c1: 1 });
    for (const elapsed of [0, 300, 2000]) assert.deepEqual(sampleScene(scenes[1], data, elapsed).charts, { c1: 0 }, `${elapsed}`);
    assert.deepEqual(sampleScene(scenes[0], data, 0).charts, { c1: 0 });
  });
});

describe('sampler: 켜진 구간(합쳐진 시간표 구간)', () => {
  const held = (data, elapsed, si = 0) => frameAt(data, elapsed, si).held;

  // 근거: 켜 둔 도형, 부분, 차트 행은 구간이 그 장면에서 지금까지 `light`로 켠 목록이고, 조용한 선이 보이는 구간만 시간표 marks가 합쳐 둔다. 구간이 바뀌면 목록이 바뀐다
  test('held_state_follows_the_segment_lists_and_the_quiet_edge_ranges', () => {
    const lights = (c1, c2) => ({ c1: { series: [], growing: [], lights: c1 }, c2: { series: [], growing: [], lights: c2 } });
    const segs = [
      seg(0, 0, 400, { nodesOn: ['a'], partsOn: ['t.k'], charts: lights([], ['r']) }),
      seg(0, 400, 700, { nodesOn: ['a', 'g'], partsOn: ['t.k'], charts: lights(['x=1'], []) }),
      seg(0, 700, 1000, { nodesOn: ['g'], partsOn: [], charts: lights([], []) }),
    ];
    const data = dataOf([step('once')], segs, { marks: { 'quiet:1': [[300, 900, 0]] } });
    assert.deepEqual(held(data, 150), { edges: [], lit: ['a'], parts: ['t.k'], lights: { c2: ['r'] } });
    assert.deepEqual(held(data, 350), { edges: [1], lit: ['a'], parts: ['t.k'], lights: { c2: ['r'] } });
    assert.deepEqual(held(data, 450), { edges: [1], lit: ['a', 'g'], parts: ['t.k'], lights: { c1: ['x=1'] } });
    assert.deepEqual(held(data, 899.5), { edges: [1], lit: ['g'], parts: [], lights: {} });
    assert.deepEqual(held(data, 900), { edges: [], lit: ['g'], parts: [], lights: {} });
  });

  // 근거: 길이 0인 박자(`light`만 있는 박자)도 장면의 마지막 모습에 켜 둔다. 시각 구간으로 옮기면 사라지지만 구간 목록은 길이와 상관없다
  test('a_light_in_a_zero_length_last_beat_is_held_in_the_final_frame', () => {
    const data = dataOf([step('once')], [seg(0, 0, 500, { hops: [{ edge: 0, at: 0, ms: 500 }] }), seg(0, 500, 500, { nodesOn: ['a'] })]);
    assert.deepEqual(frameAt(data, 100).held.lit, []);
    const final = frameAt(data, 99_999);
    assert.deepEqual([final.phase, final.held.lit, final.seg], ['final', ['a'], 1]);
  });

  // 근거: 점이 지나간 선은 켜 두지 않는다. 옛 `edge:` 표시는 정본이 아니다
  test('a_passed_edge_is_never_held_and_the_old_edge_marks_are_refused', () => {
    const data = dataOf([step('once')], [seg(0, 0, 1000, { hops: [{ edge: 3, at: 0, ms: 500 }] })]);
    assert.deepEqual(held(data, 700).edges, [], '점이 떠난 선은 켜져 있지 않다');
    assert.throws(() => buildScenes(dataOf([step('once')], [seg(0, 0, 1000)], { marks: { 'edge:2': [[100, 800]] } })), /지나간 선은 켜 두지 않는다/);
  });

  // 근거: 구간은 출처 장면(si)이 가진다. 장면의 마지막 모습은 자기 구간만 읽고, 같은 시각에 시작하는 다른 장면의 구간이나 끝나는 장면의 구간은 보지 않는다
  test('the_final_snapshot_reads_only_the_ranges_its_own_scene_owns', () => {
    const data = dataOf([step('static'), step('static')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { marks: { 'quiet:0': [[500, 1000, 0]], 'quiet:1': [[1000, 2000, 1]] } });
    assert.deepEqual(held(data, 0, 0).edges, [0], '장면 0의 마지막 모습은 자기 구간을 읽는다');
    assert.deepEqual(held(data, 0, 1).edges, [1], '장면 1의 마지막 모습은 자기 구간만이다');
    const live = dataOf([step('once'), step('once')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { marks: { 'quiet:0': [[500, 1000, 0]], 'quiet:1': [[1000, 2000, 1]] } });
    assert.deepEqual(held(live, 0, 1).edges, [1]);
    assert.deepEqual(held(live, 600, 0).edges, [0]);
  });

  // 근거: 다른 장면이 지나간 조용한 선은 이 장면에서 보이지 않는다. 같은 선을 두 장면이 지나도 각자 자기 구간이다
  test('a_quiet_edge_passed_in_another_scene_is_not_visible_in_this_one', () => {
    const data = dataOf([step('once'), step('once')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { marks: { 'quiet:0': [[300, 1000, 0]] } });
    assert.deepEqual(held(data, 600, 0).edges, [0]);
    assert.deepEqual(held(data, 100, 1).edges, [], '장면 1은 선을 지나지 않았다');
    assert.deepEqual(held(data, 99_999, 1).edges, []);
    const both = dataOf([step('static'), step('static')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { marks: { 'quiet:0': [[300, 1000, 0], [1500, 2000, 1]] } });
    assert.deepEqual([held(both, 0, 0).edges, held(both, 0, 1).edges], [[0], [0]]);
  });

  // 근거: 구간이 [시작, 끝, 장면 번호]가 아니면 근사로 받지 않고 오류다
  test('a_range_without_an_owner_scene_is_refused', () => {
    assert.throws(() => buildScenes(dataOf([step('once')], [seg(0, 0, 1000)], { marks: { 'quiet:0': [[100, 800]] } })), /marks의 구간이 정본이 아니다/);
  });

  // 근거: 다른 장면에만 있는 구간은 이 장면 모델에 들어오지 않는다
  test('ranges_of_other_scenes_do_not_enter_the_scene_model', () => {
    const data = dataOf([step('once'), step('once')], [seg(0, 0, 1000), seg(1, 1000, 2000)], { marks: { 'quiet:5': [[1100, 1500, 1]], 'quiet:6': [[200, 300, 0]] } });
    const [first, second] = buildScenes(data);
    assert.deepEqual(first.held.map((entry) => entry.key), [6]);
    assert.deepEqual(second.held.map((entry) => entry.key), [5]);
  });
});

describe('sampler: 표시 길이와 반복 꼬리', () => {
  // 근거: 반복은 마지막 사건의 400ms 효과를 끝까지 보인 뒤 처음으로 돌아간다. 논리 시각은 그대로다
  test('loop_keeps_the_final_pulse_tail_of_400_display_ms_before_resetting', () => {
    const data = dataOf([step('loop', 2)], [seg(0, 0, 2000, { pulses: [{ id: 'b', at:1800 }] })]);
    const [scene] = buildScenes(data);
    near(scene.presentationMs, 1300);
    const late = frameAt(data, 1100);
    near(late.pulses['node:b'], 1 - 40 / 240);
    assert.equal(late.elapsed, 2000, '꼬리 동안 박자 안 논리 시각은 끝에 머문다');
    assert.ok(frameAt(data, 1299).pulses['node:b'] > 0);
    const reset = frameAt(data, 1300);
    assert.deepEqual([reset.pulses, reset.elapsed, reset.phase], [{}, 0, 'play']);
  });

  // 근거: for=가 일찍 끝나도 후광을 자르지 않는다(논리 길이가 아니라 표시 길이를 늘린다)
  test('a_short_for_does_not_truncate_the_last_pulse', () => {
    const data = dataOf([step('loop')], [seg(0, 0, 1000, { pulses: [{ id: 'b', at:900 }] })]);
    const [scene] = buildScenes(data);
    near(scene.presentationMs, 1300);
    near(frameAt(data, 1000).pulses['node:b'], 1);
    near(frameAt(data, 1250).pulses['node:b'], 1 - 190 / 240);
    assert.equal(frameAt(data, 1250).seg, 0);
  });

  // 근거: 마지막으로 비는 선의 알약도 꼬리 안에서 끝까지 줄어든다
  test('the_last_pill_decay_extends_the_presentation_too', () => {
    const data = dataOf([step('loop')], [seg(0, 0, 1000, { hops: [{ edge: 0, at: 500, ms: 500 }] })]);
    const [scene] = buildScenes(data);
    near(scene.presentationMs, 1400);
    near(frameAt(data, 1200).edges[0].pill, 0.5);
  });

  // 근거: 정지와 움직임 줄이기의 마지막 모습에는 점도 후광도 알약도 없다
  test('static_final_has_no_packets_pulses_or_pills_and_shows_the_end_values', () => {
    const data = dataOf([step('static')], [seg(0, 0, 2000, { hops: [{ edge: 0, at: 0, ms: 2000 }], pulses: [{ id: 'b', at:1999 }] })], { values: [{ si: 0, periods: [[0, 1000, 'a'], [1000, 2000, 'b']] }] });
    for (const elapsed of [0, 500, 1e9]) {
      const frame = frameAt(data, elapsed);
      assert.deepEqual([frame.phase, frame.pulses, frame.edges, frame.values, frame.seg, frame.elapsed], ['final', {}, {}, ['b'], 0, 2000]);
    }
  });

  // 근거: 움직임 줄이기로 멈춘 반복 장면은 시각이 얼마든 마지막 모습이다(반복의 나머지 계산으로 처음 모습이 되지 않는다)
  test('a_settled_loop_scene_is_the_final_frame_at_any_elapsed_time', () => {
    const data = dataOf([step('loop')], [seg(0, 0, 1000, { hops: [{ edge: 0, at: 0, ms: 1000 }], pulses: [{ id: 'b', at:900 }] })], { values: [{ si: 0, periods: [[0, 500, 'a'], [500, 1000, 'b']] }] });
    const [scene] = buildScenes(data);
    for (const elapsed of [0, 120, scene.presentationMs, scene.presentationMs * 3 + 17]) {
      const frame = sampleScene(scene, data, elapsed, true);
      assert.deepEqual([frame.phase, frame.pulses, frame.edges, frame.values, frame.elapsed], ['final', {}, {}, ['b'], 1000], `${elapsed}`);
    }
    assert.equal(sampleScene(scene, data, 120).phase, 'play', '멈추지 않았으면 같은 시각이 재생 중이다');
  });

  // 근거: 한 번은 표시 길이가 지나야 마지막 모습이고 그 전에는 재생 중이다. 유지는 후광이 끝난 뒤다
  test('once_holds_the_final_only_after_the_effects_finish', () => {
    const data = dataOf([step('once')], [seg(0, 0, 1000, { pulses: [{ id: 'b', at: 900 }] })]);
    assert.equal(frameAt(data, 1299).phase, 'play');
    assert.ok(frameAt(data, 1299).pulses['node:b'] > 0);
    const held = frameAt(data, 1300);
    assert.deepEqual([held.phase, held.pulses, held.elapsed], ['final', {}, 1000]);
    assert.equal(json(frameAt(data, 99_999)), json(held));
  });

  // 근거: 반복은 표시 길이마다 처음부터 같은 모습이다(다시 들어가기도 같다)
  test('loop_and_reentry_repeat_the_exact_same_frame_every_period', () => {
    const data = flowData({ mode: 'loop', speed: 2 });
    const [scene] = buildScenes(data);
    near(scene.presentationMs, 1000);
    for (const x of [0, 33, 410, 777.5]) assert.equal(json(frameAt(data, x + scene.presentationMs * 3)), json(frameAt(data, x)));
    assert.equal(json(frameAt(data, 0)), json(frameAt(data, scene.presentationMs)));
  });
});

describe('sampler: 시각만의 함수', () => {
  // 근거: 같은 (장면, 시각)은 앞서 어떤 시각을 샘플했든 같은 모습이다(앞으로, 뒤로, 무작위)
  test('sample_is_history_independent_across_forward_backward_and_random_order', () => {
    const periods = [[0, 300, '0'], [300, 300, '1'], [300, 900, '2'], [900, 2000, '5']];
    const data = {
      ...flowData({ mode: 'loop', speed: 1.5, extraHops: [{ edge: 0, at: 1300, ms: 400, isBack: true }] }),
      values: [{ si: 0, periods }],
      charts: { c: { id: 'c', rows: [{ si: 0, periods: [[0, 700, 0, []], [700, 1200, 1, ['a']]] }] } },
      chartFrames: { c: { marks: [{ id: 'a' }], frames: [{ a: { v: 1 } }, { a: { v: 2 } }] } },
      pulses: [{ key: 'value:0', at: 300 }, { key: 'value:0', at: 900 }, { key: 'chart:c:a', at: 700 }],
      marks: { 'quiet:0': [[200, 900, 0]] },
    };
    data.segs[0] = { ...data.segs[0], nodesOn: ['a', 'b'], partsOn: ['t.k'], charts: { c: { series: [], growing: [], lights: ['x=1'] } } };
    const [scene] = buildScenes(data);
    const modelBefore = json([[...scene.edgeRuns], [...scene.pulses], scene.presentationMs]);
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const times = [...Array.from({ length: 120 }, () => random() * scene.presentationMs * 2.5), 0, scene.presentationMs];
    const reference = new Map(times.map((x) => [x, json(sampleScene(buildScenes(data)[0], data, x))]));
    const orders = [times, [...times].sort((a, b) => a - b), [...times].sort((a, b) => b - a), [...times].sort(() => random() - 0.5)];
    for (const order of orders) for (const x of order) assert.equal(json(sampleScene(scene, data, x)), reference.get(x), `${x}ms`);
    assert.equal(json([[...scene.edgeRuns], [...scene.pulses], scene.presentationMs]), modelBefore, '표본 추출이 모델을 바꿨다');
  });

  // 근거: 큰 프레임 간격으로 여러 박자를 한 번에 건너도 한 걸음씩 가는 것과 같은 모습이다
  test('a_large_frame_gap_across_many_segments_equals_stepping_through_them', () => {
    const segs = Array.from({ length: 12 }, (_, i) => seg(0, i * 100, (i + 1) * 100, { cardsBefore: { 0: i }, cards: { 0: i + 1 }, cardsAt: { 0: 50 } }));
    const periods = Array.from({ length: 12 }, (_, i) => [i * 100, (i + 1) * 100, String(i)]);
    const pulses = Array.from({ length: 11 }, (_, i) => ({ key: 'value:0', at: (i + 1) * 100 }));
    const data = dataOf([step('once')], segs, { values: [{ si: 0, periods }], pulses });
    const [scene] = buildScenes(data);
    const jumped = sampleScene(scene, data, 1150);
    let stepped;
    for (let x = 0; x <= 1150; x += 1) stepped = sampleScene(scene, data, x);
    assert.equal(json(jumped), json(stepped));
    assert.deepEqual([jumped.seg, jumped.elapsed, jumped.cards, jumped.values], [11, 50, { 0: 12 }, ['11']]);
    assert.equal(jumped.pulses['value:0'], 1, '1000의 변화는 유지 구간이고 더 센 쪽만 남는다');
    const wrapped = dataOf([step('loop')], segs, { values: [{ si: 0, periods }], pulses });
    const [loop] = buildScenes(wrapped);
    near(loop.presentationMs, 1500);
    assert.equal(json(sampleScene(loop, wrapped, 1150 + 1500 * 7)), json(sampleScene(loop, wrapped, 1150)));
  });

  // 근거: 카드는 점이 닿는 시각(cardsAt)부터 박자 끝 카드로 바뀐다. 도착 전은 박자 처음 카드다
  test('cards_switch_exactly_at_the_card_time', () => {
    const data = dataOf([step('once')], [seg(0, 0, 1000, { cardsBefore: { 0: 0 }, cards: { 0: 1, 2: 1 }, cardsAt: { 0: 300, 2: 100 } })]);
    assert.deepEqual(frameAt(data, 99).cards, { 0: 0 });
    assert.deepEqual(frameAt(data, 299).cards, { 0: 0, 2: 1 });
    assert.deepEqual(frameAt(data, 300).cards, { 0: 1, 2: 1 });
  });

  // 근거: 속도는 이동 논리 시간만 바꾼다. 같은 논리 사건이 speed 배로 빨리 온다
  test('speed_scales_logical_travel_but_not_the_display_envelope', () => {
    const slow = dataOf([step('once', 1)], [seg(0, 0, 2000, { hops: [{ edge: 0, at: 0, ms: 1000 }] })]);
    const fast = dataOf([step('once', 4)], [seg(0, 0, 2000, { hops: [{ edge: 0, at: 0, ms: 1000 }] })]);
    assert.equal(frameAt(slow, 999).edges[0].active, true);
    assert.equal(frameAt(fast, 249).edges[0].active, true);
    assert.equal(frameAt(fast, 250).edges[0].active, false);
    near(frameAt(fast, 250 + 200).edges[0].pill, 0.5);
    near(frameAt(slow, 1000 + 200).edges[0].pill, 0.5);
  });
});

describe('sampler: 컴파일러와 같은 시각', () => {
  // 근거: 점이 도형 경계에 닿는 논리 시각은 컴파일러(src/easing.js arrivalOffsetMs)와 재생기(curve.js)가 같은 값으로 읽는다. 구간별 이동 시간(pace)도 같다
  test('hop_leg_times_match_the_compiler_arrival_offsets_with_and_without_pace', () => {
    const move = curveOf('move');
    const pace = [[0, 0], [0.25, 0.5], [1, 1]];
    for (const [ms, legPace] of [[1000, undefined], [3750, pace]]) {
      for (const fraction of [0.1, 0.3, 0.5, 0.8, 0.95]) {
        near(ms * timeAtProgress(move, fraction, legPace), arrivalOffsetMs(fraction, ms, legPace), `${ms}ms ${fraction}`);
      }
      for (const time of [0.05, 0.4, 0.75, 0.99]) near(progressAt(move, time, legPace), positionAt(time, legPace), `${time}`);
    }
  });
});

describe('sampler: 정본 단계 값', () => {
  const stepsWith = (value) => dataOf([value], [seg(0, 0, 100)]);

  // 근거: 단계는 정확히 { label, mode, speed }다. 글, 빠진 값, 모르는 방식, 잘못된 배율을 기본값으로 받지 않는다
  test('invalid_steps_are_rejected_with_the_step_index_and_reason', () => {
    const cases = [
      ['글 단계', 'First', /steps\[0\].*객체/],
      ['null', null, /객체/],
      ['배열', [], /객체/],
      ['빠진 speed', { label: 'a', mode: 'once' }, /키는 정확히/],
      ['빠진 mode', { label: 'a', speed: 1 }, /키는 정확히/],
      ['모르는 키', { label: 'a', mode: 'once', speed: 1, loop: true }, /키는 정확히/],
      ['숫자 label', { label: 1, mode: 'once', speed: 1 }, /label은 글/],
      ['모르는 mode', { label: 'a', mode: 'bounce', speed: 1 }, /mode는 static, once, loop/],
      ['speed 0', { label: 'a', mode: 'once', speed: 0 }, /speed는 양의 유한수/],
      ['speed 음수', { label: 'a', mode: 'once', speed: -2 }, /speed/],
      ['speed 글', { label: 'a', mode: 'once', speed: '2' }, /speed/],
      ['speed NaN', { label: 'a', mode: 'once', speed: NaN }, /speed/],
      ['speed Infinity', { label: 'a', mode: 'once', speed: Infinity }, /speed/],
    ];
    for (const [name, value, message] of cases) assert.throws(() => buildScenes(stepsWith(value)), message, name);
    assert.doesNotThrow(() => buildScenes(stepsWith({ label: '', mode: 'loop', speed: 0.01 })));
    assert.doesNotThrow(() => buildScenes(stepsWith({ label: 'a', mode: 'static', speed: 50 })));
  });

  // 근거: 정본이 아닌 이동은 근사하지 않고 오류다. 흐름의 점은 구간마다의 선(legEdges)과 이음(gaps)이 맞아야 하고, 박자의 이동은 정수 선 번호가 있어야 한다. marks의 알 수 없는 키도 오류다
  test('a_hop_or_a_marks_key_that_is_not_canonical_is_refused_instead_of_approximated', () => {
    const one = (hop) => dataOf([step('once')], [seg(0, 0, 1000, { hops: [hop] })]);
    assert.doesNotThrow(() => buildScenes(one({ track: 0, legEdges: [3, 4], gaps: [[0.4, 0.6]], ms: 500 })));
    assert.doesNotThrow(() => buildScenes(one({ edge: 2, ms: 500 })));
    const cases = [
      ['legEdges 없이 edges만 있는 흐름의 점', { track: 0, edges: [3, 4], ms: 500 }],
      ['이음 수가 어긋난 점', { track: 0, legEdges: [3, 4], gaps: [], ms: 500 }],
      ['이음이 숫자 둘이 아니다', { track: 0, legEdges: [3, 4], gaps: [[0.4]], ms: 500 }],
      ['선 번호가 없는 이동', { ms: 500 }],
      ['정수가 아닌 선 번호', { edge: 1.5, ms: 500 }],
      ['길이가 0인 이동', { edge: 1, ms: 0 }],
    ];
    for (const [name, hop] of cases) assert.throws(() => buildScenes(one(hop)), /정본이 아니다/, name);
    assert.throws(() => buildScenes(dataOf([step('once')], [seg(0, 0, 1000)], { marks: { 'move:0': [[0, 100]] } })), /marks의 키가 정본이 아니다/);
  });

  // 근거: 후광 시간이 없거나 잘못되면 기본값을 쓰지 않고 오류다. 박자가 없는 장면도 오류다
  test('missing_timing_and_empty_scenes_are_errors', () => {
    const data = stepsWith(step('once'));
    assert.throws(() => buildScenes({ ...data, metrics: { move: MOVE } }), /metrics\.pulse/);
    assert.throws(() => buildScenes({ ...data, metrics: { move: MOVE, pulse: { ...TIMING, decayMs: -1 } } }), /metrics\.pulse/);
    assert.throws(() => buildScenes(dataOf([step('once'), step('once')], [seg(0, 0, 100)])), /steps\[1\].*박자가 없다/);
  });
});
