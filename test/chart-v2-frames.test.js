// 값에 묶인 차트의 프레임 짝맞춤: 그리기가 칸마다 표식을 늘 두므로 0에서 양수로 바뀌어도 구조가 같고, 강도는 원자료가 바뀐 표식만 받는다.
// 프레임을 만드는 쪽이 켜는 `chart.markIds`를 직접 켜서 확인한다. src/chart-frames.js가 이 모듈을 쓰도록 바뀐 뒤의 흐름(E2E)은 이 시험의 범위가 아니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedBetween, frameSet, markedElements } from '../src/chart/frames.js';
import { barRows, drawChart, figureOf, names, pointRows } from './chart-v2-fixture.js';

const marked = (figure) => drawChart({ ...figure, chart: { ...figure.chart, markIds: true } }).body;
const donut = (values) => figureOf('donut', { rows: values.map((value, i) => ({ label: `항목 ${i}`, values: { value } })) });

test('donut_frames_pair_when_a_slice_goes_from_zero_to_positive_and_only_that_slice_is_changed', () => {
  const set = frameSet([marked(donut([30, 0, 50])), marked(donut([30, 20, 50]))]);
  const changed = changedBetween(set.raws, 0, 1).sort();
  // 0에서 자란 조각, 그 이름 옆 수치, 가운데 합계. 각도가 밀린 다른 조각은 원자료가 같아 강조하지 않는다.
  assert.deepEqual(changed, ['*:1', '*:1.d', '*:total.t']);
  const slices = set.marks.filter((m) => m.tag === 'path').map((m) => m.id);
  assert.ok(slices.includes('*:0') && slices.includes('*:1') && slices.includes('*:2'), 'the other slices move quietly: they are frame marks but not changed');
  assert.equal(set.frames[0]['*:1'].attrs.d.startsWith('M '), true);
  assert.ok(!set.frames[0]['*:1'].attrs.d.includes('A'));
  assert.ok(set.frames[1]['*:1'].attrs.d.includes('A'));
});

test('frame_state_carries_attributes_and_text_but_not_the_identity_attributes', () => {
  const set = frameSet([marked(donut([30, 0, 50])), marked(donut([30, 20, 50]))]);
  for (const frame of set.frames) {
    for (const state of Object.values(frame)) assert.ok(!Object.keys(state.attrs).some((name) => name.startsWith('data-mark') || name === 'data-raw'));
  }
  assert.equal(typeof set.frames[1]['*:1.d'].text, 'string');
  assert.equal(set.marks.find((m) => m.id === '*:1.d').tag, 'text');
});

test('percent_frames_highlight_only_the_series_whose_raw_value_changed', () => {
  const make = (b) => figureOf('percent', { series: names(3), extent: { min: 0, max: 100 }, rows: barRows([['r', 30, b, 10]]) });
  const set = frameSet([marked(make(20)), marked(make(25))]);
  const changed = changedBetween(set.raws, 0, 1).sort();
  // 값 글자의 효과는 글자 뒤 바탕 면(.b)이 받는다. 합계 글자도 마지막 계열 글 끝에 붙어 같은 규칙이다.
  assert.deepEqual(changed, ['b:0', 'b:0.b', 'c:0.total.b']);
  // 다른 계열 조각은 위치와 퍼센트 글자가 바뀌지만(조용히 옮겨짐) 강조하지 않는다
  assert.ok(set.marks.some((m) => m.id === 'a:0'));
  assert.notEqual(set.frames[0]['a:0'].attrs.width, set.frames[1]['a:0'].attrs.width);
  assert.ok(!changed.includes('a:0') && !changed.includes('a:0.b'));
  assert.notEqual(set.frames[0]['a:0.t'].text, set.frames[1]['a:0.t'].text);
});

test('line_frames_move_the_path_without_highlight_and_highlight_only_the_changed_point', () => {
  const make = (v) => figureOf('line', { series: names(1), extent: { min: 0, max: 10 }, rows: pointRows([[1, 2], [2, v], [3, 4]]) });
  const set = frameSet([marked(make(5)), marked(make(7))]);
  assert.deepEqual(changedBetween(set.raws, 0, 1), ['a:1']);
  assert.ok(set.marks.some((m) => m.id === 'a:path'), 'the path d changes');
  assert.notEqual(set.frames[0]['a:path'].attrs.d, set.frames[1]['a:path'].attrs.d);
});

test('the_same_values_again_change_nothing', () => {
  const make = () => figureOf('stacked', { series: names(2), extent: { min: 0, max: 20 }, rows: barRows([['r', 3, 4]]) });
  const set = frameSet([marked(make()), marked(make())]);
  assert.deepEqual(changedBetween(set.raws, 0, 1), []);
  assert.deepEqual(set.marks, []);
});

test('stacked_frames_keep_a_zero_length_segment_and_a_hidden_key_when_a_series_is_zero', () => {
  const make = (b) => figureOf('stacked', { series: names(2), extent: { min: 0, max: 20 }, rows: barRows([['r', 3, b]]) });
  const set = frameSet([marked(make(0)), marked(make(6))]);
  assert.equal(set.frames[0]['b:0'].attrs.width, '0');
  assert.ok(Number(set.frames[1]['b:0'].attrs.width) > 0);
  assert.equal(set.frames[0]['b:0.k'].attrs.visibility, 'hidden');
  assert.equal(set.frames[1]['b:0.k'].attrs.visibility, undefined);
  // 누적의 합계는 마지막 계열 글 끝(`= 9`)에 붙어 같은 글 표식이다
  assert.deepEqual(changedBetween(set.raws, 0, 1).sort(), ['b:0', 'b:0.b']);
});

test('frames_that_lose_or_gain_a_mark_are_rejected_with_the_mark_name', () => {
  const full = marked(donut([30, 20, 50]));
  const broken = full.replace(/<path [^>]*data-mark="\*:1"[^>]*>.*?<\/path>/, '');
  assert.notEqual(full, broken);
  assert.throws(() => frameSet([full, broken]), /different set of marks than frame 0 \(\*:1<path>\)/);
});

test('a_duplicate_mark_name_is_rejected', () => {
  assert.throws(() => markedElements('<rect data-mark="a:0"/><rect data-mark="a:0"/>'), /appears twice/);
});

test('marked_elements_read_text_and_raw_without_guessing_structure', () => {
  const [text, rect] = markedElements('<text data-mark-text="a:0.t" data-raw="5" x="1">5</text><rect data-mark="a:0" data-raw="-" width="2"/>');
  assert.deepEqual([text.id, text.isText, text.text, text.raw, text.attrs], ['a:0.t', true, '5', '5', { x: '1' }]);
  assert.deepEqual([rect.id, rect.isText, rect.raw, rect.attrs], ['a:0', false, '-', { width: '2' }]);
});
