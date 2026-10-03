// 흐름(track)과 값(value, set=, tone=): 오류 진단, 값이 도착 순서대로 바뀌는지(시간표), 갈래색 이름 집합.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { findClashes } from '../src/chip-clash.js';
import { valueNames } from '../src/source/grammar.js';
import { tokens } from '../src/tokens.js';

const BASE = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nvalue n "개수" on=b\nvalue copy "복사" on=c ref=n\na -> b\nb -> c\n';

// cost: time O(n), heap O(n), stack O(1), io 0
// vars: n = 원본 글자 수
// basis: estimate
// 원본의 오류 진단 목록 { code, line, message }. 오류가 없으면 빈 목록이다.
async function errorsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    return error.problems;
  }
}

// 근거: 설계 figure-syntax.md 시간 흐름: 한 단계에 박자 줄과 흐름 줄을 섞으면 오류
test('buildFigure_rejects_a_step_that_mixes_beat_lines_and_track_lines_in_either_order', async () => {
  const beatFirst = await errorsOf(`${BASE}step "s" for=5s\n  a -> b\n  track a -> b -> c\n`);
  const trackFirst = await errorsOf(`${BASE}step "s" for=5s\n  track a -> b -> c\n  say "x"\n`);

  assert.deepEqual([beatFirst[0].code, beatFirst[0].line], ['syntax', 11]);
  assert.match(beatFirst[0].message, /beats .* or tracks, not both/);
  assert.match(trackFirst[0].message, /a step with tracks takes no "say" line/);
});

// 근거: 설계 figure-syntax.md 시간 흐름: every가 있는데 for가 없으면 오류
test('buildFigure_requires_a_step_length_for_every', async () => {
  const [error] = await errorsOf(`${BASE}step "s"\n  track a -> b every=2s\n`);

  assert.deepEqual([error.code, error.line], ['syntax', 10]);
  assert.match(error.message, /needs a length.*for=12s/);
});

// 근거: 설계 figure-syntax.md 시간 흐름: 흐름의 구간은 선언된 선을 따라간다. 없으면 오류
test('buildFigure_rejects_a_track_leg_without_a_declared_edge', async () => {
  const [error] = await errorsOf(`${BASE}step "s"\n  track a -> c\n`);

  assert.deepEqual([error.code, error.line], ['syntax', 10]);
  assert.match(error.message, /no edge between "a" and "c"/);
});

// 근거: 설계 figure-syntax.md 값: 참조는 순환할 수 없고 참조 값에는 쓸 수 없으며 @도형은 경로 위 도형이다
test('buildFigure_rejects_a_reference_cycle_a_set_on_a_reference_and_an_at_off_the_path', async () => {
  const cycle = await errorsOf('flow right\nbox a "A"\nvalue x "x" on=a ref=y\nvalue y "y" on=a ref=x\n');
  const onReference = await errorsOf(`${BASE}step "s"\n  a -> b set="copy+1"\n`);
  const offPath = await errorsOf(`${BASE}step "s"\n  a -> b set="n+1@c"\n`);

  assert.match(cycle[0].message, /refers to itself through x -> y -> x/);
  assert.match(onReference[0].message, /"copy" is a reference to "n"/);
  assert.match(offPath[0].message, /@c is not on this path \(a -> b\)/);
});

// 근거: 설계 playback.md 값 변화: 식은 점이 닿는 시각 순서로 적용되고, 참조 값은 같은 시각에 같은 글로 바뀐다
test('buildFigure_changes_values_in_arrival_order_and_a_reference_changes_at_the_same_moment', async () => {
  const source = `${BASE}step "s" for=20s\n  track a -> b -> c at=0s set="n+5@b, n-2@c"\n  track a -> b at=10s set="n=9"\n`;
  const { timeline } = await buildFigure(source);
  const [n, copy] = timeline.values;

  assert.equal(n.initial, '0');
  assert.deepEqual(n.changes.map(([, text]) => text).slice(0, 3), ['5', '3', '9']);
  assert.ok(n.changes.every(([at], i, all) => i === 0 || at >= all[i - 1][0]));
  assert.deepEqual(copy.changes, n.changes);
});

// 근거: 설계 figure-syntax.md 점 색: tone의 이름 집합은 카드 태그와 같고 문법 표의 값 목록 한 곳이 정한다
test('every_tone_name_has_a_flow_color_role', () => {
  for (const name of valueNames('tone')) assert.ok(tokens.color.flow[name], `color.flow.${name}`);
});

// 근거: 설계 figure-check.md 7번: 보이는 글 상자끼리 겹치면 경고한다(통과하면 안 되는 반대 사례)
test('buildFigure_warns_when_two_moving_texts_of_one_beat_overlap', async () => {
  const { warnings } = await buildFigure('flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> c\nb -> c\nstep "s"\n  a -> c "알파 메시지" & b -> c "베타 메시지" time=2s\n');

  assert.deepEqual(warnings.map((w) => w.code), ['check-7']);
  assert.match(warnings[0].message, /"베타 메시지" overlaps moving text "알파 메시지"/);
});

// 근거: 설계 playback.md 이동 글: 흐름에서 글 상자가 겹치면 나중에 출발한 점의 글 상자가 숨고 겹침이 남지 않는다
test('buildFigure_hides_the_text_of_the_later_dot_in_a_flow_so_no_two_texts_overlap', async () => {
  const source = `${BASE}step "s" for=12s\n  track a -> b -> c "먼저" every=3s\n  track a -> b -> c "나중" at=0.05s every=3s\n`;
  const result = await buildFigure(source);
  const hidden = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.chipHide);

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(findClashes(result.scene, result.timeline), []);
  assert.ok(hidden.length > 0 && hidden.every((hop) => hop.data[0] === '나중'));
});
