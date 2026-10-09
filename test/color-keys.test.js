// 근거: docs/design/charts.md "색 없이 구분하기". 산점도는 점 이름 앞에 계열 번호 키(범례의 번호)를 붙이고, 원·도넛은 목록 번호를 조각 안 고리에 적는다. 번호 키는 글자라서 모양이 겹치는 계열 쌍(범주 번호 2와 6)도 가른다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { TIERS } from '../src/chart-palette.js';
import { changedBetween, frameSet } from '../src/chart/frames.js';
import { keyRoom } from '../src/chart/labels.js';
import { toHtml } from '../src/html.js';
import { measure } from '../src/measure/fonts.js';
import { centerBaseline } from '../src/text.js';
import { values } from '../src/tokens.js';
import { drawChart, figureOf } from './chart-v2-fixture.js';
import { chartOf, chartSource } from './helpers.js';

// ---- 산점도 계열 번호 키 ----

const SERIES = 7;
const ids = Array.from({ length: SERIES }, (_, i) => `s${i}`);
const bodyOf = async (lines, type = 'scatter') => chartOf(await buildFigure(`daphnis 2\n${chartSource(type, lines)}`, { strict: true })).body;
const textsIn = (body, className) => [...body.matchAll(new RegExp(`class="${className}[^"]*">([^<]*)<`, 'g'))].map((m) => m[1]);
const head = ['x "가(s)"', 'y "나(건)"'];
// 계열 선언 목록. roles는 계열 번호별 role 글
const declared = (count, roles = {}) => ids.slice(0, count).map((id, i) => `series ${id} "계열 ${i}"${roles[i] ? ` role=${roles[i]}` : ''}`);
// 계열마다 점 둘. 좌표는 겹치지 않게 흩는다.
const pointsOf = (count) => ids.slice(0, count).flatMap((id, s) => [0, 1].map((j) => `point "p${s}-${j}" x=${s * 2 + j + 1} y=${((s * 3 + j * 5) % 11) + 1} series=${id}`));

test('scatter_with_seven_series_prefixes_each_point_name_with_its_series_number_and_the_legend_reads_one_to_seven', async () => {
  const body = await bodyOf([...head, ...declared(SERIES), ...pointsOf(SERIES)]);
  const names = textsIn(body, 'chart-name');
  assert.equal(names.length, SERIES * 2);
  names.forEach((text, k) => assert.equal(text, `${Math.floor(k / 2) + 1} p${Math.floor(k / 2)}-${k % 2}`, `point ${k}`));
  assert.deepEqual(textsIn(body, 'chart-legend'), ids.map((_, i) => `${i + 1} 계열 ${i}`));
  // 범주 번호 2(빨강)와 6(청록)은 같은 마름모지만 번호 키가 다르다
  assert.equal(TIERS.shapes[2 % TIERS.shapes.length], TIERS.shapes[6 % TIERS.shapes.length]);
  assert.notEqual(names[2 * 2].split(' ')[0], names[6 * 2].split(' ')[0]);
});

// 근거: 조각 번호 키 글자 요소를 `segmentKey`로 모으기 전과 바이트가 같다(모으기 전 출력에서 뜬 문자열).
test('stacked_and_percent_segment_keys_keep_their_exact_markup', async () => {
  const key = (x, y, n, hidden = false) => `<text x="${x}" y="${y}" text-anchor="middle" fill="var(--color-data-category-on-${n})" stroke="var(--color-data-category-${n})" stroke-width="4.5" paint-order="stroke" class="chart-seg-key late"${hidden ? ' visibility="hidden"' : ''}>${n}</text>`;
  const stacked = await bodyOf(['x "시간(ms)"', 'series a "실행"', 'series b "대기"', 'row "요청" a=30 b=20', 'row "캐시" a=10 b=0', 'row "긴 이름 캐시 행 하나" a=1 b=-'], 'stacked');
  for (const expected of [key(323.3, 97, 1), key(582, 97, 2), key(219.8, 142, 1), key(271.5, 142, 2, true)]) assert.ok(stacked.includes(expected), expected);
  const percent = await bodyOf(['x "비율"', 'series a "실행"', 'series b "대기"', 'series c "기타"', 'row "요청" a=30 b=20 c=1', 'row "캐시" a=0 b=0 c=0', 'row "없음" a=- b=- c=-'], 'percent');
  for (const expected of [key(319.3, 97, 1), key(571.4, 97, 2), key(677.3, 97, 3, true), key(168, 142, 1, true)]) assert.ok(percent.includes(expected), expected);
});

test('scatter_point_identity_stays_the_row_and_series_groups_with_the_unprefixed_label', async () => {
  const body = await bodyOf([...head, ...declared(3), ...pointsOf(3)]);
  for (let k = 0; k < 6; k++) assert.match(body, new RegExp(`<g class="cr-${k}"><g class="cs-${Math.floor(k / 2)}"><(?:circle|rect|path) `), `row ${k} stays in its series group`);
});

// 근거: figure-check.md 2번. 좁은 배치가 비켜 놓지 못하는 이름의 오류 메시지는 번호 키 없는 점 이름으로 알린다.
test('keyed_scatter_check_2_reports_the_unprefixed_point_names', async () => {
  const points = Array.from({ length: 8 }, (_, i) => `point "같은 위치에서 관측한 요청의 평균 처리 지연 시간 ${i}" x=5 y=5 series=${i % 2 ? 's1' : 's0'}`);
  const source = `daphnis 2\n${chartSource('scatter', [...head, ...declared(2), ...points, 'point "끝" x=10 y=10 series=s0'])}scene "밝히기" mode=once\n  light c "끝"\n`;
  const result = await buildFigure(source, { strict: true });
  await assert.rejects(toHtml(result, '산점도'), (error) => {
    const messages = error.problems.map((problem) => problem.message);
    return messages.length >= 1 && messages.every((message) => /point name "같은 위치에서 [^"]*" overlaps point name "같은 위치에서 [^"]*"/.test(message) && !/"\d /.test(message));
  });
});

// 원본 해석이 계열 목록을 역할 순서(main, compare, 나머지는 선언 순서)로 세우므로(chart-rules.js) 나중에 선언한 main은 목록 맨 앞이고 번호 1이다.
// 범례와 점 이름과 누적 막대 키가 모두 이 목록의 번호를 쓴다.
test('scatter_keys_follow_the_legend_order_when_the_main_series_is_declared_later', async () => {
  const body = await bodyOf([...head, ...declared(3, { 2: 'main' }), ...pointsOf(3)]);
  const legend = textsIn(body, 'chart-legend');
  assert.deepEqual(legend, ['1 계열 2', '2 계열 0', '3 계열 1'], '범례는 번호 순서이고 main이 앞이다');
  const names = textsIn(body, 'chart-name');
  assert.equal(names.length, 6);
  for (const [number, series] of [['1', 2], ['2', 0], ['3', 1]]) {
    assert.ok(legend.includes(`${number} 계열 ${series}`));
    assert.deepEqual(names.filter((text) => text.endsWith(`p${series}-0`) || text.endsWith(`p${series}-1`)), [`${number} p${series}-0`, `${number} p${series}-1`], `계열 ${series}의 점 이름은 범례와 같은 번호 ${number}이다`);
  }
});

test('scatter_without_two_series_keeps_plain_point_names_and_legend', async () => {
  const single = await bodyOf([...head, ...declared(1), ...pointsOf(1)]);
  assert.deepEqual(textsIn(single, 'chart-name'), ['p0-0', 'p0-1']);
  assert.deepEqual(textsIn(single, 'chart-legend'), ['계열 0']);
  const none = await bodyOf([...head, 'point "a" x=1 y=1', 'point "b" x=3 y=2']);
  assert.deepEqual(textsIn(none, 'chart-name'), ['a', 'b']);
  assert.deepEqual(textsIn(none, 'chart-legend'), []);
});

// 점 이름 상자(그려진 글을 잰다): 키가 붙은 글자 폭이 들어간다
const nameBoxes = (body) => [...body.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" class="chart-name late( end)?">(.*?)<\/text>/g)].map((m) => {
  const width = measure(m[4], 11);
  const [x, y] = [Number(m[1]), Number(m[2]) - 11 * 0.36];
  return { label: m[4], x0: m[3] ? x - width : x, x1: m[3] ? x : x + width, y0: y - 5.5, y1: y + 5.5 };
});
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('keyed_scatter_places_prefixed_names_apart_at_the_same_and_near_coordinates', async () => {
  const same = [...head, ...declared(3), 'point "alpha" x=5 y=5 series=s0', 'point "beta" x=5 y=5 series=s1', 'point "gamma" x=5.02 y=5.02 series=s2', 'point "far" x=1 y=1 series=s0'];
  const boxes = nameBoxes(await bodyOf(same));
  assert.deepEqual(boxes.map((box) => box.label), ['1 alpha', '2 beta', '3 gamma', '1 far']);
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(!overlaps(a, b), `${a.label}와 ${b.label} 이름이 겹친다`);
});

test('keyed_scatter_keeps_link_arrowheads_clear_and_builds_the_narrow_layout_names', async () => {
  const lines = [...head, ...declared(2), 'point "alpha" x=1 y=9 series=s0', 'point "beta" x=4 y=3 series=s1', 'point "gamma" x=7 y=8 series=s0', 'link "alpha" -> "beta"', 'link "beta" -> "gamma"'];
  const body = await bodyOf(lines);
  assert.equal([...body.matchAll(/class="chart-link pop"/g)].length, 2);
  assert.deepEqual(nameBoxes(body).map((box) => box.label), ['1 alpha', '2 beta', '1 gamma']);
});

// ---- 원, 도넛 조각 안 번호 키 ----

const wholeKey = /<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="middle"[^>]*class="chart-seg-key late"( visibility="hidden")?[^>]*>(\d+)<\/text>/g;
const pieOf = (type, list, { markIds = false } = {}) => {
  const figure = figureOf(type, { rows: list.map((value, i) => ({ label: `항목 ${i}`, values: { value } })) });
  return drawChart({ ...figure, chart: { ...figure.chart, markIds } }).body;
};
// 조각 경로의 호에서 원의 중심과 바깥 반지름을 읽는다. 첫 조각은 12시에서 시작한다(`M cx cy-R A R R`).
function ringOf(body, type) {
  const m = /<path d="M ([\d.-]+) ([\d.-]+) A ([\d.]+) [\d.]+ 0 [01] 1 [^"]*"[^>]*class="chart-part dot" data-at="0"/.exec(body);
  assert.ok(m, 'a first slice that starts at twelve o\'clock');
  const [cx, R] = [Number(m[1]), Number(m[3])];
  return { cx, cy: Number(m[2]) + R, outer: R, inner: type === 'donut' ? R * values.simple2['chart-hole'] : 0 };
}
// 번호 키: { key, x, cy, hidden } 목록. y는 글 기준선이라 가운데로 되돌린다.
const keysOf = (body) => [...body.matchAll(wholeKey)].map((m) => ({ key: m[4], x: Number(m[1]), cy: Number(m[2]) - centerBaseline(0, 11), hidden: Boolean(m[3]) }));
// 상자가 조각 고리에 드는가를 따로 계산한다(구현의 함수를 쓰지 않는다)
function fitsRing(slice, ring, anchor, room) {
  const total = Math.PI * 2;
  return [[-1, -1], [-1, 1], [1, -1], [1, 1]].every(([sx, sy]) => {
    const [dx, dy] = [anchor.x + sx * room.w / 2 - ring.cx, anchor.cy + sy * room.h / 2 - ring.cy];
    const radius = Math.hypot(dx, dy);
    const turn = ((Math.atan2(dy, dx) + Math.PI / 2) / total + 1) % 1;
    return radius >= ring.inner - 0.05 && radius <= ring.outer + 0.05 && turn >= slice.start - 1e-4 && turn <= slice.end + 1e-4;
  });
}

for (const type of ['pie', 'donut']) {
  test(`${type}_slices_carry_their_list_number_inside_the_slice_ring_when_it_fits`, () => {
    const list = [60, 30, 9, 0.4, 0.2, 0];
    const body = pieOf(type, list);
    const keys = keysOf(body);
    assert.deepEqual(keys.map((k) => k.key), list.map((_, i) => String(i + 1)), 'one key per slice, numbered from the list');
    const ring = ringOf(body, type);
    const sum = list.reduce((a, b) => a + b, 0);
    let start = 0;
    list.forEach((value, i) => {
      const slice = { start, end: start + value / sum };
      start = slice.end;
      const anchor = keys[i];
      const hole = values.simple2['chart-hole'];
      assert.ok(Math.abs(Math.hypot(anchor.x - ring.cx, anchor.cy - ring.cy) - ring.outer * (1 + hole) / 2) < 0.05 || value === 0, `slice ${i}: the key sits on the middle ring`);
      assert.equal(!anchor.hidden, value > 0 && fitsRing(slice, ring, anchor, keyRoom(anchor.key)), `slice ${i}: visible exactly when the key box fits the sector`);
    });
    assert.equal(keys[0].hidden, false, 'a large slice shows its key');
    assert.equal(keys[1].hidden, false);
    assert.equal(keys[3].hidden, true, 'a thin slice hides its key');
    assert.equal(keys[5].hidden, true, 'a zero slice hides its key');
  });

  test(`${type}_keys_sit_inside_the_row_group_and_follow_the_slice_angle`, () => {
    const body = pieOf(type, [50, 30, 20]);
    const ring = ringOf(body, type);
    const total = 100;
    let start = 0;
    keysOf(body).forEach((anchor, i) => {
      const middle = (start + [50, 30, 20][i] / 2) / total;
      start += [50, 30, 20][i];
      const turn = ((Math.atan2(anchor.cy - ring.cy, anchor.x - ring.cx) + Math.PI / 2) / (Math.PI * 2) + 1) % 1;
      assert.ok(Math.abs(turn - middle) < 1e-3, `slice ${i}: the key is on the middle angle`);
    });
    for (let i = 0; i < 3; i++) assert.match(body, new RegExp(`<g class="cr-${i}"><path [^>]*class="chart-part dot"[^]*?</path>(?:<path [^>]*/>)?<text [^>]*class="chart-seg-key late"[^>]*>${i + 1}</text></g>`), `slice ${i}: the key is the last element of its row group`);
  });

  test(`${type}_hides_every_key_when_the_total_is_zero_and_keeps_one_key_per_slice`, () => {
    const keys = keysOf(pieOf(type, [0, 0, 0]));
    assert.equal(keys.length, 3);
    assert.ok(keys.every((k) => k.hidden));
  });
}

test('a_single_whole_pie_slice_shows_its_key_without_an_angle_test', () => {
  const [key] = keysOf(pieOf('pie', [10, 0]));
  assert.equal(key.hidden, false, 'the whole circle fits its key at the middle ring');
});

test('value_bound_pie_frames_carry_a_key_mark_for_every_slice_and_toggle_its_visibility', () => {
  const frames = [[30, 0, 50], [30, 20, 50], [0, 0, 0]].map((list) => pieOf('donut', list, { markIds: true }));
  const set = frameSet(frames);
  for (const i of [0, 1, 2]) assert.equal(set.marks.find((m) => m.id === `*:${i}.k`)?.tag, 'text', `*:${i}.k is a frame text mark`);
  assert.equal(set.frames[0]['*:1.k'].attrs.visibility, 'hidden');
  assert.equal(set.frames[1]['*:1.k'].attrs.visibility, undefined);
  assert.notEqual(set.frames[0]['*:1.k'].attrs.x, set.frames[1]['*:1.k'].attrs.x, 'the key moves with the slice');
  for (const i of [0, 1, 2]) assert.equal(set.frames[2][`*:${i}.k`].attrs.visibility, 'hidden');
  assert.ok(!changedBetween(set.raws, 0, 1).some((id) => id.endsWith('.k')), 'a key has no raw value, so it is never pulsed');
});
