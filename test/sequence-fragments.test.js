// 근거: 순서 보기 제어 구획은 그림의 메시지와 실제 재생 경로를 함께 정의한다(docs/design/figure-kinds.md 구획, docs/design/figure-syntax.md 순서 보기 전용 문장).
// 선은 그래프 보기에 선언하고 구획과 메시지는 장면 안에 쓴다. 이동은 보기마다 한 번씩 보이므로, 순서 보기에 그려진 선과 그 선을 지나는 이동만 센다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure, FigureError } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const HEAD = 'daphnis 2\nbox a "클라이언트"\nbox b "서버"\nbox c "저장소"\na -> b\na -> c\nb -> c\nview g graph {\n  a b c\n}\nview s sequence {\n  a b c\n}\nscene "실행" mode=once\n';
const SEQUENCE_PANEL = 1;

// 순서 보기에 그려진 선 목록
const sequenceEdges = (result) => result.scene.edges.filter((edge) => edge.panel === SEQUENCE_PANEL);
// 박자 하나의 이동 가운데 순서 보기 선을 지나는 것. edge는 순서 보기 선 목록 안의 번호로 바꾼다.
const hopsOf = (result, seg) => {
  const drawn = sequenceEdges(result);
  return seg.hops.filter((hop) => result.scene.edges[hop.edge]?.panel === SEQUENCE_PANEL).map((hop) => ({ ...hop, edge: drawn.indexOf(result.scene.edges[hop.edge]) }));
};
const moves = (result) => result.timeline.segs.flatMap((seg) => hopsOf(result, seg));

test('sequence_loop_reuses_the_body_edges_for_each_real_iteration', async () => {
  const result = await buildFigure(HEAD + 'fragment loop "재시도" times=3 {\n a -> b "요청" time=400ms\n b -> a "응답" time=500ms\n}\n');
  assert.equal(sequenceEdges(result).length, 2);
  assert.deepEqual(moves(result).map((hop) => hop.edge), [0, 1, 0, 1, 0, 1]);
  assert.equal(result.scene.fragments[0].kind, 'loop');
  assert.match(await toSvg(result, { isStatic: true }), /재시도/);
});

test('sequence_alt_draws_both_operands_but_only_plays_the_selected_one', async () => {
  const source = HEAD + 'fragment alt "재고" choose="있음" {\nbranch "있음" {\na -> b "주문"\n}\nbranch "없음" {\na -> c "대기"\n}\n}\n';
  const result = await buildFigure(source);
  assert.equal(sequenceEdges(result).length, 2);
  assert.deepEqual(moves(result).map((hop) => hop.edge), [0]);
  await assert.rejects(buildFigure(source.replace('a -> c', 'a -> missing')), /unknown/);
  await assert.rejects(buildFigure(source.replace('choose="있음"', 'choose="오류"')), /choose/);
});

test('sequence_parallel_operands_start_together_and_advance_independently', async () => {
  const source = HEAD + 'fragment par "동시 요청" {\nbranch "빠른 요청" {\na -> b "빠름" time=400ms\nb -> a "완료" time=400ms\n}\nbranch "느린 요청" {\na -> c "느림" time=2s\nc -> a "완료" time=400ms\n}\n}\na -> b "합류 뒤" time=400ms\n';
  const result = await buildFigure(source);
  const [parallelSeg, joinedSeg] = result.timeline.segs;
  const parallel = hopsOf(result, parallelSeg);
  assert.equal(parallel[0].at ?? 0, 0);
  assert.equal(parallel[2].at ?? 0, 0);
  assert.ok(parallel[1].at < parallel[3].at);
  assert.equal(parallel[3].at - parallel[1].at, 1600);
  assert.ok(joinedSeg.t0 >= parallelSeg.t0 + Math.max(...parallel.map((hop) => (hop.at ?? 0) + hop.ms)));
});

// 근거: 중첩 반복은 메시지 순서를 유지하고 대기는 다음 출발을 지연시킨다.
test('sequence_nested_fragments_repeat_the_chosen_path_and_keep_waits', async () => {
  const source = HEAD + 'fragment loop "외부" times=2 {\nfragment alt "선택" choose="성공" {\nbranch "성공" {\nfragment loop "내부" times=2 {\na -> b "시도" time=400ms\nwait 1s\n}\n}\nbranch "실패" {\na -> c "다른 길"\n}\n}\n}\n';
  const result = await buildFigure(source);
  const hops = moves(result);
  assert.deepEqual(hops.map((hop) => hop.edge), [0, 0, 0, 0]);
  assert.ok(hops[1].at >= hops[0].at + 1400);
  assert.equal(hops[1].at - hops[0].at, hops[3].at - hops[2].at);
  for (const frame of result.scene.fragments) {
    assert.ok(frame.x >= 0 && frame.x + frame.w <= result.scene.width);
    assert.ok(frame.y >= 0 && frame.y + frame.h <= result.scene.height);
    assert.ok(frame.header.w <= frame.w);
  }
});

// 근거: 구획 뒤 문장은 사라지지 않고 구획 재생이 끝난 뒤에 반영된다. 설명 글(say)이 없어져 구획 뒤 `show`와 이동으로 같은 순서를 본다.
test('sequence_fragment_keeps_the_following_statements_after_its_playback', async () => {
  const source = HEAD + 'fragment loop "처리" times=2 {\na -> b "요청" time=400ms\n}\nshow b "두 번 처리 완료"\na -> c "저장" time=400ms\n';
  const result = await buildFigure(source);
  const [control, stored] = result.timeline.segs;

  assert.equal(moves(result).length, 3, '반복 두 번과 뒤의 이동 하나');
  assert.deepEqual(hopsOf(result, control).map((hop) => hop.edge), [0, 0]);
  assert.ok(stored.t0 >= control.t1, '구획 뒤 박자는 구획이 끝난 뒤 시작한다');
  assert.deepEqual(hopsOf(result, stored).map((hop) => hop.edge), [1]);
});

// 근거: 반복 전개 전에 기존 events 예산을 적용하고 장면마다 예산을 초기화하지 않는다.
test('sequence_fragment_budget_is_checked_before_expansion_and_accumulates_across_scenes', async () => {
  const loop = 'fragment loop "반복" times=3 {\na -> b "요청"\n}\n';
  await assert.rejects(buildFigure(HEAD + loop, { budget: { events: 5 } }), /budget events=5/);
  assert.equal(moves(await buildFigure(HEAD + loop, { budget: { events: 6 } })).length, 3);
  await assert.rejects(buildFigure(HEAD + loop + 'scene "다음" mode=once\n' + loop, { budget: { events: 11 } }), /budget events=11/);
  await assert.rejects(buildFigure(HEAD + loop.replace('times=3', 'times=9007199254740991')), /budget/);
});

// 근거: 지원하지 않는 구획 안 상태 변화나 불완전한 구획을 조용히 무시하지 않는다.
test('sequence_fragments_reject_invalid_structure_and_unsupported_inner_state_changes', async () => {
  const invalid = [
    'fragment loop "빈 반복" times=1 {\n}\n',
    'fragment loop "반복" times=0 {\na -> b "요청"\n}\n',
    'fragment loop "반복" times=1 {\na -> b "생성" create\n}\n',
    'fragment loop "반복" times=1 {\na -> b "요청"\nshow b "결과"\n}\n',
    'fragment par "분기 없는 병렬" {\na -> b "요청"\n}\n',
    'fragment alt "누락" choose="하나" {\nbranch "하나" {\na -> b "요청"\n}\n}\n',
    'branch "소속 없음" {\na -> b "요청"\n}\n',
    'fragment loop "미완성" times=1 {\na -> b "요청"\n',
  ];
  for (const body of invalid) await assert.rejects(buildFigure(HEAD + body), FigureError, body);
});

// 근거: 장면과 이웃 구획이 바뀌어도 원본 메시지 선의 번호를 다시 쓰거나 섞지 않는다.
test('sequence_sibling_fragments_and_later_scenes_keep_their_original_edges', async () => {
  const source = HEAD + 'fragment loop "첫째" times=2 {\na -> b "처리"\n}\nfragment par "둘째" {\nbranch "저장" {\nb -> c "저장"\n}\nbranch "응답" {\nc -> a "응답"\n}\n}\nscene "다음" mode=once\nfragment alt "선택" choose="둘" {\nbranch "하나" {\na -> b "하나"\n}\nbranch "둘" {\na -> c "둘"\n}\n}\n';
  const result = await buildFigure(source);
  const hopEdges = (si) => result.timeline.segs.filter((seg) => seg.si === si).flatMap((seg) => hopsOf(result, seg).map((hop) => hop.edge));
  assert.deepEqual(hopEdges(0), [0, 0, 1, 2]);
  assert.deepEqual(hopEdges(1), [4]);
  const frames = result.scene.fragments;
  const firstScene = frames.filter((frame) => frame.si === 0);
  const secondScene = frames.filter((frame) => frame.si === 1);
  // 메시지 행은 장면마다 따로 첫 행부터 쌓인다(layout.md). 같은 장면의 이웃 구획은 겹치지 않고 아래로 이어지고, 다음 장면의 구획은 다시 첫 행에서 시작한다.
  assert.equal(firstScene.length, 2);
  assert.equal(secondScene.length, 1);
  assert.ok(firstScene[0].y + firstScene[0].h <= firstScene[1].y);
  assert.equal(secondScene[0].y, firstScene[0].y);
});

// 근거: 긴 제목은 경계 안에서 줄바꿈하고 깊이 초과 입력은 호출 스택을 소진하기 전에 거부한다.
test('sequence_fragment_headers_wrap_and_excessive_nesting_reports_a_source_error', async () => {
  const label = '한글과 English가 함께 있는 긴 조건 설명 '.repeat(8);
  const result = await buildFigure(HEAD + `fragment loop "${label}" times=1 {\na -> b "요청"\n}\n`);
  const frame = result.scene.fragments[0];
  assert.ok(frame.header.lines.length > 1);
  assert.ok(frame.header.w <= frame.w);
  assert.ok(frame.header.y >= frame.y && frame.header.y + frame.header.h <= frame.y + frame.h, `구획 제목(y ${frame.header.y}, 높이 ${frame.header.h})은 구획 틀(y ${frame.y}, 높이 ${frame.h}) 안에 있다`);
  assert.ok(frame.header.y + frame.header.h < sequenceEdges(result)[0].points[0].y);
  const tooDeep = 'fragment loop "중첩" times=1 {\n'.repeat(65) + 'a -> b "요청"\n' + '}\n'.repeat(65);
  await assert.rejects(buildFigure(HEAD + tooDeep), /cannot nest deeper than 64/);
});

test('sequence_opt_draws_its_body_but_skips_all_messages_and_waits_when_off', async () => {
  const body = 'fragment opt "추가 인증" run=off {\na -> b "인증" time=400ms\nwait 2s\nb -> a "결과" time=500ms\n}\n';
  const tail = 'a -> c "계속" time=300ms\n';
  const skipped = await buildFigure(HEAD + body + tail);
  const plain = await buildFigure(HEAD + tail);
  assert.equal(sequenceEdges(skipped).length, 3);
  assert.deepEqual(moves(skipped).map((hop) => hop.edge), [2]);
  assert.equal(skipped.timeline.total, plain.timeline.total);
  assert.match(await toSvg(skipped, { isStatic: true }), /opt.*추가 인증.*생략/);
  const enabled = await buildFigure(HEAD + body.replace('run=off', 'run=on') + tail);
  assert.deepEqual(moves(enabled).map((hop) => hop.edge), [0, 1, 2]);
  assert.ok(enabled.timeline.total > skipped.timeline.total);
  assert.match(await toSvg(enabled, { isStatic: true }), /opt.*추가 인증.*재생/);
});

test('sequence_opt_validates_skipped_bodies_and_requires_an_explicit_run_choice', async () => {
  for (const option of ['', 'run=maybe', 'run="on"', 'run=on run=off', 'times=1']) {
    await assert.rejects(buildFigure(HEAD + `fragment opt "조건" ${option} {\na -> b "요청"\n}\n`), FigureError);
  }
  await assert.rejects(buildFigure(HEAD + 'fragment opt "조건" run=off {\na -> missing "요청"\n}\n'), /unknown/);
  await assert.rejects(buildFigure(HEAD + 'fragment opt "조건" run=off {\nbranch "잘못된 분기" {\na -> b "요청"\n}\n}\n'), /branch/);
});

test('sequence_opt_nested_in_a_loop_skips_without_iteration_cost_and_keeps_the_statements_after_it', async () => {
  const body = 'fragment loop "반복" times=9007199254740991 {\nfragment opt "조건" run=off {\na -> b "실행 안 함"\n}\n}\nshow c "계속 진행"\na -> c "다음" time=300ms\n';
  const result = await buildFigure(HEAD + body, { budget: { events: 3 } });
  assert.deepEqual(moves(result).map((hop) => hop.edge), [1]);
  await assert.rejects(buildFigure(HEAD + body.replace('run=off', 'run=on'), { budget: { events: 3 } }), /budget/);
});
