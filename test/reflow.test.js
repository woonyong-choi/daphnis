// 근거: 화면 폭이 바뀌어도 출발·도착·대기 해제·카드·값·사라짐 시각은 같은 시간표를 사용한다(docs/design/layout.md 재배치).
// 원본은 시험 원본 묶음(test/fixtures)과 이 파일의 인라인 원본이다(예제 파일에 기대지 않는다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure, reflowFigure } from '../src/build.js';
import { arrivalOffsetMs } from '../src/easing.js';

const sourceOf = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
// 글 상자의 위치·충돌 숨김과 거리 비율은 새 배치에서 다시 구한다. 데이터와 사건 시각은 제외하지 않는다.
const POSITION_FIELDS = new Set(['chipPath', 'chipFade', 'pace', 'gaps']);
// 흐름, 값, 대기, 잃음, 상태가 섞인 시험 원본
const cases = [
  './fixtures/flow/lost-status-legs.dap',
  './fixtures/flow/tracks.dap',
  './fixtures/flow/value-keep.dap',
  './fixtures/value-keep/lap.dap',
  './fixtures/chip-reach/track.dap',
  './fixtures/layout/event-loop.dap',
];
const NAMES = ['주문 접수', '결제 확인', '재고 예약', '배송 준비', '출고 처리', '운송 중', '배송 완료', '정산 마감'];
// 선 길이로 이동 시간이 정해지는 가로로 긴 흐름. 가로 비율을 허용(`aspect 8`)해야 한 줄에 놓인다.
const CHAIN = ['daphnis 2', 'title "긴 이벤트 흐름"', 'aspect 8', ...NAMES.map((name, i) => `box n${i} "${name}"`), ...NAMES.slice(1).map((_, i) => `n${i} -> n${i + 1}`), 'scene "흐름" mode=once', ...NAMES.slice(1).map((_, i) => `  n${i} -> n${i + 1}`), ''].join('\n');
const PALETTE = ['daphnis 2', 'title "색 팔레트"', 'aspect 1.8', 'box a "빨강" fill=red', 'box b "초록" fill=green', 'box c "파랑" fill=blue', 'box d "보라" fill=purple', 'a -> b', 'b -> c', 'c -> d', 'scene "s" mode=once', '  a -> b', ''].join('\n');

test('reflow_narrow_width_adapts_an_explicit_aspect_without_changing_source_or_timing', async () => {
  const original = await buildFigure(PALETTE);
  const preserved = structuredClone(original);
  const narrow = await reflowFigure(original, { layoutWidth: 320, strict: true });
  assert.ok(narrow.scene.width <= 320);
  assert.equal(narrow.figure.aspect, 1.8);
  assert.deepEqual(narrow.figure, original.figure);
  assert.deepEqual(eventsOf(narrow.timeline), eventsOf(original.timeline));
  assert.deepEqual(original, preserved);
  const standard = await reflowFigure(original, { layoutWidth: 960 });
  const boxes = (scene) => scene.items.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  assert.deepEqual(boxes(standard.scene), boxes(original.scene));
});

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 시간표 크기
// basis: estimate
function eventsOf({ tracks, ...timeline }) {
  return JSON.parse(JSON.stringify({ ...timeline, tracks: tracks?.map(({ names, line }) => ({ names, line })) }, (key, value) => POSITION_FIELDS.has(key) ? undefined : value));
}

// cost: time O(h·l), heap O(l), stack O(1)
// vars: h = 이동 수, l = 한 이동의 도형 경계 수
// basis: estimate
function assertBoundaryTimes(previous, next) {
  for (const [si, seg] of previous.segs.entries()) for (const [hi, hop] of seg.hops.entries()) {
    if (hop.track === undefined) continue;
    const changed = next.segs[si].hops[hi];
    const before = [0, ...hop.gaps.flat(), 1];
    const after = [0, ...changed.gaps.flat(), 1];
    for (const [i, fraction] of before.entries()) {
      const oldMs = arrivalOffsetMs(fraction, hop.ms, hop.pace);
      const newMs = arrivalOffsetMs(after[i], changed.ms, changed.pace);
      assert.ok(Math.abs(oldMs - newMs) < 0.0001, `segment ${si}, hop ${hi}, boundary ${i}: ${oldMs} / ${newMs}`);
    }
  }
}

test('reflow_preserves_every_event_and_route_boundary_without_mutating_the_original', async () => {
  for (const path of cases) {
    const original = await buildFigure(sourceOf(path), { baseDir: new URL('.', new URL(path, import.meta.url)).pathname });
    const saved = JSON.stringify(original);
    const narrow = await reflowFigure(original, { layoutWidth: 320 });
    assert.deepEqual(eventsOf(narrow.timeline), eventsOf(original.timeline), path);
    assertBoundaryTimes(original.timeline, narrow.timeline);
    assert.equal(JSON.stringify(original), saved, path);
    assert.deepEqual(narrow.scene.items.map(({ id, w, h }) => [id, w, h]), original.scene.items.map(({ id, w, h }) => [id, w, h]));
  }
});

test('reflow_preserves_distance_based_timing_that_a_fresh_narrow_build_changes', async () => {
  const original = await buildFigure(CHAIN);
  const rebuilt = await buildFigure(CHAIN, { layoutWidth: 320 });
  const reflowed = await reflowFigure(original, { layoutWidth: 320 });
  assert.notEqual(rebuilt.timeline.total, original.timeline.total);
  assert.equal(reflowed.timeline.total, original.timeline.total);
  assert.ok(reflowed.scene.width < original.scene.width);
  assert.notDeepEqual(reflowed.scene.edges[0].points, original.scene.edges[0].points);
  assert.equal(reflowed.warnings.some(({ code }) => code === 'layout-width'), false);
  const constrained = await reflowFigure(original, { layoutWidth: 100 });
  assert.ok(constrained.warnings.some(({ code }) => code === 'layout-width'));
  await assert.rejects(reflowFigure(original, { layoutWidth: 100, strict: true }), /exceeding the requested/);
});

// 근거: 설계 layout.md 재배치 `reflowFigure(result, { layoutWidth?, chartWidth?, ... })`. `layoutWidth`는 그래프 보기가 있을 때만 쓰고 양의 유한한 수여야 한다. 폭을 모두 생략하면 사건 시간표만 보존한 채 같은 폭으로 다시 배치한다
test('reflow_rejects_a_bad_layout_width_and_changed_edge_identity_and_a_chart_only_figure_takes_chart_width', async () => {
  const original = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\na -> b\n');
  for (const width of [0, -320, Number.NaN, Number.POSITIVE_INFINITY]) await assert.rejects(reflowFigure(original, { layoutWidth: width }), /positive finite number/, String(width));
  const same = await reflowFigure(original);
  assert.deepEqual(eventsOf(same.timeline), eventsOf(original.timeline), '폭을 모두 생략해도 사건 시각은 그대로다');
  const changed = structuredClone(original);
  changed.scene.edges[0].to = 'a';
  await assert.rejects(reflowFigure(changed, { layoutWidth: 320 }), /edge order or endpoints changed/);
  const chart = await buildFigure('daphnis 2\nchart c "T" bar {\n  x "값(ms)"\n  series a "A"\n  row "R" a=1\n}\n');
  await assert.rejects(reflowFigure(chart, { layoutWidth: 320 }), /layoutWidth is only for documents with a graph view/);
  const narrow = await reflowFigure(chart, { chartWidth: 272 });
  assert.deepEqual(eventsOf(narrow.timeline), eventsOf(chart.timeline), '차트는 폭만 다시 잡고 사건 시각은 그대로다');
});

test('wide_moving_text_keeps_the_packet_path_on_the_shifted_edge', async () => {
  const body = 'box a "A"\nbox b "B"\na -> b\n';
  const move = 'scene "s" mode=once for=5s\n  track a -> b "WWWWWWWWWWWWWWWWWWWWWWWW" time=2s\n';
  const source = `daphnis 2\n${body}${move}`;
  const original = await buildFigure(source);
  const narrow = await reflowFigure(original, { layoutWidth: 200 });
  const vertical = await buildFigure(`daphnis 2\n${body}view main graph down {\n  a b\n}\n${move}`);
  for (const result of [narrow, vertical]) {
    const edge = result.scene.edges[0].points;
    const track = result.timeline.tracks[0];
    assert.deepEqual(track.parts[0], edge);
    assert.deepEqual(track.route[0], edge[0]);
    assert.deepEqual(track.route.at(-1), edge.at(-1));
  }
});
