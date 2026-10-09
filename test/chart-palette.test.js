// 범주 팔레트 도우미(src/chart-palette.js). 근거: 기록한 순서는 한 번이고 새 색은 뒤에만 더한다, 색 수에는 상한이 없고 색 수를 넘는 범주는 무늬·모양·직접 라벨로 구분한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_REVISION, PALETTE, SNAPSHOTS, TIERS, categoryPaint, readPalette, readRevisions, readSnapshots, readTiers } from '../src/chart-palette.js';
import { contrast } from '../src/contrast.js';
import { tokens, values } from '../src/tokens.js';
import { themeColor } from './helpers.js';

// 처음 기록한 순서. 이 목록의 앞쪽은 바뀌지 않고 새 색은 뒤에만 붙는다.
const RECORDED = ['blue', 'yellow', 'red', 'green', 'orange', 'purple', 'cyan'];
const THEMES = ['light', 'dark'];
const TEXT = 4.5;

// 시험용 팔레트: 계열 이름만 다르고 토큰 참조 모양은 같다.
const custom = (names) => names.map((family, i) => ({ family, fill: `fill-${i}`, border: `border-${i}`, on: `on-${i}`, ink: `ink-${i}`, tint: `tint-${i}`, needsLabel: false }));

test('palette_reads_the_recorded_order_and_every_role_from_the_tokens', () => {
  assert.deepEqual(PALETTE.map((entry) => entry.family).slice(0, RECORDED.length), RECORDED, 'the first entries are the initial chosen order');
  PALETTE.forEach((entry, index) => {
    const number = index + 1;
    assert.equal(entry.fill, tokens.color.data.category[number]);
    assert.equal(entry.border, tokens.color.data['category-outline'][number]);
    assert.equal(entry.on, tokens.color.data['category-on'][number]);
    assert.equal(entry.ink, tokens.color.data['category-ink'][number]);
    assert.equal(entry.tint, tokens.color.data['category-tint'][number]);
    assert.match(entry.fill, /^var\(--color-data-category-\d+\)$/);
  });
  assert.equal(PALETTE.length, 7, 'the default palette is the seven families of revision 1');
  const latest = Math.max(...Object.keys(SNAPSHOTS).map(Number));
  assert.equal(SNAPSHOTS[latest].palette.length, Object.keys(values.color.data.category).length, 'the latest revision covers every recorded family');
});

test('palette_roles_resolve_per_family_with_on_text_at_4_5_in_both_themes', () => {
  for (const theme of THEMES) {
    PALETTE.forEach(({ family }, index) => {
      const number = index + 1;
      const fill = themeColor(theme, `data.category.${number}`);
      assert.equal(fill, themeColor(theme, `category.${family}.anchor`), `${theme} ${family} fill is the anchor`);
      assert.equal(themeColor(theme, `data.category-on.${number}`), themeColor(theme, `category.${family}.on`));
      assert.ok(contrast(themeColor(theme, `data.category-on.${number}`), fill) >= TEXT, `${theme} ${family} on text`);
      assert.equal(themeColor(theme, `data.category-outline.${number}`), themeColor(theme, `category.${family}.${theme}-border`));
    });
  }
});

test('categoryPaint_marks_the_first_round_as_solid_and_asks_a_direct_label_where_the_border_is_weak', () => {
  const paints = PALETTE.map((_, index) => categoryPaint(index));

  assert.ok(paints.every((paint) => paint.tier === 0 && paint.pattern === 'solid' && paint.spacing === 1));
  assert.deepEqual(paints.filter((paint) => paint.needsLabel).map((paint) => paint.family), ['yellow']);
});

// 근거: 색각 이상에서 가까운 쌍(파랑과 보라, 빨강과 초록, 주황과 청록, 파랑과 빨강, 파랑과 초록, 초록과 청록, 빨강과 주황, 초록과 주황)은 점 모양이 달라야 색 없이 갈린다.
test('categoryPaint_shape_follows_the_category_index_so_close_pairs_of_the_first_round_get_different_shapes', () => {
  const paints = PALETTE.map((_, index) => categoryPaint(index));

  paints.forEach((paint, index) => {
    assert.equal(paint.shape, TIERS.shapes[index % TIERS.shapes.length], `category ${index}`);
    assert.equal(paint.pattern, 'solid', `category ${index}: the first round stays a flat fill`);
  });
  const shapeOf = Object.fromEntries(paints.map((paint) => [paint.family, paint.shape]));
  for (const [a, b] of [['blue', 'purple'], ['red', 'green'], ['orange', 'cyan'], ['blue', 'red'], ['blue', 'green'], ['green', 'cyan'], ['red', 'orange'], ['green', 'orange']]) {
    assert.notEqual(shapeOf[a], shapeOf[b], `${a} and ${b}`);
  }
  // 모양은 층이 아니라 번호를 따르고 무늬는 여전히 층을 따른다.
  assert.equal(categoryPaint(7).shape, TIERS.shapes[7 % TIERS.shapes.length]);
  assert.equal(categoryPaint(7).pattern, TIERS.patterns[0]);
});

test('categoryPaint_tier_boundary_follows_the_palette_length_for_any_custom_order', () => {
  for (const names of [['a'], ['a', 'b'], ['a', 'b', 'c'], RECORDED, [...RECORDED, 'extra']]) {
    const palette = custom(names);
    const n = palette.length;

    assert.equal(categoryPaint(n - 1, { palette }).tier, 0, `${n}: last color of the first round`);
    const first = categoryPaint(n, { palette });
    assert.equal(first.tier, 1, `${n}: first color of the second round`);
    assert.equal(first.family, names[0], `${n}: the family cycles back to the first`);
    assert.equal(first.pattern, TIERS.patterns[0]);
    assert.equal(first.shape, TIERS.shapes[n % TIERS.shapes.length]);
    assert.ok(first.needsLabel, `${n}: a repeated family is never told apart by color alone`);
  }
});

test('categoryPaint_keeps_cycling_past_twice_the_palette_with_patterns_and_shapes_from_the_tokens', () => {
  const palette = custom(RECORDED);
  const n = palette.length;
  const second = categoryPaint(2 * n, { palette });
  const third = categoryPaint(3 * n + 2, { palette });

  assert.deepEqual([second.tier, second.family, second.pattern], [2, 'blue', TIERS.patterns[1 % TIERS.patterns.length]]);
  assert.deepEqual([third.tier, third.family], [3, 'red']);
  assert.equal(third.pattern, TIERS.patterns[2 % TIERS.patterns.length]);
  // 무늬 목록을 한 바퀴 돌면 무늬 간격이 넓어져 (무늬, 간격, 모양) 쌍이 이어서 겹치지 않는다.
  const round = categoryPaint((TIERS.patterns.length + 1) * n, { palette });
  assert.equal(round.pattern, TIERS.patterns[0]);
  assert.equal(round.spacing, 1 + TIERS.step);
});

test('categoryPaint_descriptors_never_repeat_for_hundreds_of_categories', () => {
  const seen = new Set();
  for (let index = 0; index < 600; index++) {
    const { family, pattern, spacing, shape } = categoryPaint(index);
    const key = [family, pattern, spacing, shape].join('|');
    assert.ok(!seen.has(key), `category ${index} repeats ${key}`);
    seen.add(key);
  }
});

test('categoryPaint_appending_a_color_changes_no_earlier_category_and_regenerating_does_not_reorder', () => {
  const before = custom(RECORDED);
  const after = custom([...RECORDED, 'extra']);

  for (let index = 0; index < before.length; index++) assert.deepEqual(categoryPaint(index, { palette: after }), categoryPaint(index, { palette: before }), `category ${index}`);
  assert.equal(categoryPaint(before.length, { palette: after }).family, 'extra');
  assert.equal(categoryPaint(before.length, { palette: after }).tier, 0);
  // 같은 입력은 언제나 같은 출력이다(무작위 없음).
  assert.deepEqual(categoryPaint(37), categoryPaint(37));
  assert.deepEqual(readPalette(), [...PALETTE]);
  assert.deepEqual(readTiers(), { ...TIERS });
});

test('readTiers_orders_patterns_and_shapes_by_their_token_numbers', () => {
  const raw = { 'category-family': { 1: 'blue', 2: 'yellow', 3: 'red', 4: 'green' }, 'category-pattern': { 2: 'b', 10: 'j', 1: 'a' }, 'category-shape': { 1: 'x', 2: 'y' }, 'category-revision': { 1: { family: 4, pattern: 3, shape: 2, step: 0.25 } } };

  assert.deepEqual(readTiers({ raw }), { patterns: ['a', 'b', 'j'], shapes: ['x', 'y'], step: 0.25 });
});

test('categoryPaint_rejects_an_index_that_is_not_a_whole_non_negative_number_and_an_empty_palette', () => {
  for (const index of [-1, 1.5, Number.NaN, '2', undefined]) assert.throws(() => categoryPaint(index), RangeError, String(index));
  assert.throws(() => categoryPaint(0, { palette: [] }), /palette is empty/);
});

// 근거: 색을 덧붙여도 기본 칠은 바뀌지 않아야 한다. 1판의 칠은 아래 문자열이 정답이며 categoryPaint로 만들지 않았다.
// 한 줄이 한 층(일곱 계열)이고 한 칸은 family|pattern|spacing|shape다. 층 4부터 무늬 목록이 한 바퀴를 돌아 간격이 넓어진다.
// 모양은 범주 번호를 모양 개수 4로 나눈 나머지라 층이 바뀔 때마다 한 줄 안에서 모양이 이어서 돈다(일곱과 넷은 서로소다).
const REVISION_1 = [
  'blue|solid|1|circle', 'yellow|solid|1|square', 'red|solid|1|diamond', 'green|solid|1|triangle', 'orange|solid|1|circle', 'purple|solid|1|square', 'cyan|solid|1|diamond',
  'blue|hatch|1|triangle', 'yellow|hatch|1|circle', 'red|hatch|1|square', 'green|hatch|1|diamond', 'orange|hatch|1|triangle', 'purple|hatch|1|circle', 'cyan|hatch|1|square',
  'blue|dots|1|diamond', 'yellow|dots|1|triangle', 'red|dots|1|circle', 'green|dots|1|square', 'orange|dots|1|diamond', 'purple|dots|1|triangle', 'cyan|dots|1|circle',
  'blue|cross|1|square', 'yellow|cross|1|diamond', 'red|cross|1|triangle', 'green|cross|1|circle', 'orange|cross|1|square', 'purple|cross|1|diamond', 'cyan|cross|1|triangle',
  'blue|hatch|1.5|circle', 'yellow|hatch|1.5|square', 'red|hatch|1.5|diamond', 'green|hatch|1.5|triangle', 'orange|hatch|1.5|circle', 'purple|hatch|1.5|square', 'cyan|hatch|1.5|diamond',
  'blue|dots|1.5|triangle', 'yellow|dots|1.5|circle', 'red|dots|1.5|square', 'green|dots|1.5|diamond', 'orange|dots|1.5|triangle', 'purple|dots|1.5|circle', 'cyan|dots|1.5|square',
  'blue|cross|1.5|diamond', 'yellow|cross|1.5|triangle', 'red|cross|1.5|circle', 'green|cross|1.5|square', 'orange|cross|1.5|diamond', 'purple|cross|1.5|triangle', 'cyan|cross|1.5|circle',
  'blue|hatch|2|square', 'yellow|hatch|2|diamond', 'red|hatch|2|triangle', 'green|hatch|2|circle', 'orange|hatch|2|square', 'purple|hatch|2|diamond', 'cyan|hatch|2|triangle',
  'blue|dots|2|circle', 'yellow|dots|2|square', 'red|dots|2|diamond', 'green|dots|2|triangle', 'orange|dots|2|circle', 'purple|dots|2|square', 'cyan|dots|2|diamond',
];
const tuple = ({ family, pattern, spacing, shape }) => [family, pattern, spacing, shape].join('|');

// 시험용 확장: 실제 토큰에 계열·무늬·모양을 뒤에 덧붙이고 판 2를 더한다. 앞쪽 항목은 그대로다.
// cost: time O(n), heap O(n), stack O(1)
// vars: n = 토큰 수
// basis: estimate
function extended({ families = [], patterns = [], shapes = [], step = 0.5 }) {
  const raw = structuredClone(values.color.data);
  const ref = structuredClone(tokens.color.data);
  const next = (group) => Object.keys(group).length + 1;
  for (const family of families) {
    const number = next(raw['category-family']);
    raw['category-family'][number] = family;
    raw['category-label'][number] = 'optional';
    for (const group of ['category', 'category-outline', 'category-on', 'category-ink', 'category-tint']) ref[group][number] = `${group}-${family}`;
  }
  for (const pattern of patterns) raw['category-pattern'][next(raw['category-pattern'])] = pattern;
  for (const shape of shapes) raw['category-shape'][next(raw['category-shape'])] = shape;
  raw['category-revision'][2] = { family: Object.keys(raw['category-family']).length, pattern: Object.keys(raw['category-pattern']).length, shape: Object.keys(raw['category-shape']).length, step };
  return { raw, ref, snapshots: readSnapshots({ ref, raw }) };
}

test('revision_1_tokens_are_the_frozen_counts_and_the_default_is_always_revision_1', () => {
  assert.deepEqual(values.color.data['category-revision'][1], { family: 7, pattern: 3, shape: 4, step: 0.5 });
  assert.equal(BASE_REVISION, 1);
  const revisions = readRevisions();
  assert.deepEqual(revisions.map((entry) => entry.revision), revisions.map((_, index) => index + 1), 'revision numbers are contiguous from 1');
  assert.equal(revisions.at(-1).family, Object.keys(values.color.data['category-family']).length);
  assert.deepEqual(PALETTE.map((entry) => entry.family), ['blue', 'yellow', 'red', 'green', 'orange', 'purple', 'cyan']);
  assert.deepEqual([TIERS.patterns, TIERS.shapes, TIERS.step], [['hatch', 'dots', 'cross'], ['circle', 'square', 'diamond', 'triangle'], 0.5]);
  assert.deepEqual(categoryPaint(40), categoryPaint(40, { revision: 1 }), 'no option means revision 1');
  assert.ok(Object.isFrozen(SNAPSHOTS) && Object.isFrozen(SNAPSHOTS[1]) && Object.isFrozen(PALETTE) && Object.isFrozen(PALETTE[0]) && Object.isFrozen(TIERS.patterns));
});

test('the_first_four_families_are_the_exact_official_site_feature_icon_fills_in_both_themes', () => {
  const anchors = ['#1e6bd6', '#f2d024', '#fa1955', '#269c6e'];
  assert.deepEqual(PALETTE.slice(0, 4).map((entry) => entry.family), ['blue', 'yellow', 'red', 'green']);
  for (const theme of THEMES) anchors.forEach((anchor, index) => assert.equal(themeColor(theme, `data.category.${index + 1}`), anchor, `${theme} category ${index + 1}`));
});

test('revision_1_golden_table_is_written_out_and_the_default_matches_every_row', () => {
  assert.equal(REVISION_1.length, 63);
  REVISION_1.forEach((expected, index) => assert.equal(tuple(categoryPaint(index)), expected, `category ${index}`));
});

test('appending_a_family_pattern_or_shape_leaves_the_default_for_categories_0_to_200_byte_identical', () => {
  const fixtures = {
    family: extended({ families: ['pink'] }),
    pattern: extended({ patterns: ['wave', 'grid'] }),
    shape: extended({ shapes: ['star'] }),
    all: extended({ families: ['pink', 'brown'], patterns: ['wave'], shapes: ['star', 'plus'], step: 0.25 }),
  };
  const baseline = Array.from({ length: 201 }, (_, index) => tuple(categoryPaint(index)));
  baseline.slice(0, REVISION_1.length).forEach((row, index) => assert.equal(row, REVISION_1[index]), 'the baseline is the golden table');

  for (const [name, { snapshots }] of Object.entries(fixtures)) {
    const grown = Array.from({ length: 201 }, (_, index) => tuple(categoryPaint(index, { snapshots })));
    assert.deepEqual(grown, baseline, `${name}: default output of 0..200`);
    assert.equal(JSON.stringify(grown), JSON.stringify(baseline), `${name}: byte-identical`);
    assert.deepEqual(categoryPaint(120, { snapshots, revision: 1 }), categoryPaint(120, { snapshots }), `${name}: revision 1 is the default`);
    assert.equal(tuple(categoryPaint(7, { snapshots })), 'blue|hatch|1|triangle', `${name}: the eighth category is still blue with a hatch, not a new color`);
  }
});

test('an_explicit_revision_2_uses_the_appended_family_pattern_shape_and_step', () => {
  const { snapshots } = extended({ families: ['pink'], patterns: ['wave'], shapes: ['star'], step: 0.25 });

  const eighth = categoryPaint(7, { snapshots, revision: 2 });
  assert.deepEqual([eighth.revision, eighth.family, eighth.tier, eighth.pattern, eighth.shape, eighth.fill], [2, 'pink', 0, 'solid', 'diamond', 'category-pink'], 'the eighth category is the new color as a solid, with the shape of its index in five shapes');
  assert.equal(tuple(categoryPaint(8, { snapshots, revision: 2 })), 'blue|hatch|1|triangle', 'the next round starts again with the first family');
  // 층 4는 새 무늬 목록(hatch, dots, cross, wave)의 마지막 칸이다. 모양 목록은 다섯 칸이고 번호 32가 2번 칸을 가리킨다.
  assert.equal(tuple(categoryPaint(8 * 4, { snapshots, revision: 2 })), 'blue|wave|1|diamond');
  assert.equal(categoryPaint(9, { snapshots, revision: 2 }).shape, snapshots[2].tiers.shapes[9 % 5]);
  assert.equal(categoryPaint(4, { snapshots, revision: 2 }).shape, 'star', 'the appended shape is the fifth shape of its revision');
  assert.equal(tuple(categoryPaint(8 * 5, { snapshots, revision: 2 })), 'blue|hatch|1.25|circle');
  assert.notEqual(tuple(categoryPaint(40, { snapshots, revision: 2 })), tuple(categoryPaint(40, { snapshots })), 'revision 2 really differs');
  // 판 1은 확장 뒤에도 같은 길이와 간격이다.
  assert.equal(snapshots[1].palette.length, 7);
  assert.equal(snapshots[1].tiers.step, 0.5);
  assert.equal(snapshots[2].palette.length, 8);
});

test('descriptors_never_repeat_inside_either_revision_of_the_extended_fixture', () => {
  const { snapshots } = extended({ families: ['pink'], patterns: ['wave'], shapes: ['star'] });
  for (const revision of [1, 2]) {
    const seen = new Set();
    for (let index = 0; index < 600; index++) {
      const key = tuple(categoryPaint(index, { snapshots, revision }));
      assert.ok(!seen.has(key), `revision ${revision} category ${index} repeats ${key}`);
      seen.add(key);
    }
  }
});

test('readRevisions_rejects_revision_tokens_that_break_the_append_only_contract', () => {
  const grown = extended({ families: ['pink'], patterns: ['wave'], shapes: ['star'] }).raw;
  const mutate = (change) => {
    const raw = structuredClone(grown);
    change(raw, raw['category-revision']);
    return raw;
  };
  const bad = (raw, message) => assert.throws(() => readRevisions({ raw }), message);

  assert.equal(readRevisions({ raw: grown }).length, 2, 'the unchanged fixture is valid');
  bad(mutate((raw) => { delete raw['category-revision']; }), /needs revision 1/);
  bad(mutate((raw, revisions) => { for (const key of Object.keys(revisions)) delete revisions[key]; }), /needs revision 1/);
  bad(mutate((raw, revisions) => { revisions[3] = revisions[2]; delete revisions[2]; }), /without gaps/);
  bad(mutate((raw, revisions) => { delete revisions[1]; }), /without gaps/);
  bad(mutate((raw, revisions) => { revisions[2].family = 6; }), /family is smaller/);
  bad(mutate((raw, revisions) => { revisions[2].pattern = 2; }), /pattern is smaller/);
  bad(mutate((raw, revisions) => { revisions[2].shape = 3; }), /shape is smaller/);
  bad(mutate((raw, revisions) => { revisions[2].family = 9; }), /family exceeds the recorded list/);
  bad(mutate((raw, revisions) => { revisions[1].family = 0; }), /whole number/);
  bad(mutate((raw, revisions) => { revisions[1].shape = 2.5; }), /whole number/);
  bad(mutate((raw, revisions) => { revisions[1].step = 0; }), /step/);
  bad(mutate((raw, revisions) => { revisions[1].step = undefined; }), /step/);
  // 항목이 판에 속하지 않는다: 최신 판이 목록의 끝까지 닿지 않는다.
  bad(mutate((raw) => { raw['category-pattern'][5] = 'orphan'; }), /latest revision must cover/);
  bad(mutate((raw) => { raw['category-family'][9] = 'orphan'; }), /latest revision must cover/);
  bad(mutate((raw) => { raw['category-shape'][6] = 'orphan'; }), /latest revision must cover/);
  // 앞 네 계열은 blue, yellow, red, green이다.
  bad(mutate((raw) => { [raw['category-family'][1], raw['category-family'][2]] = [raw['category-family'][2], raw['category-family'][1]]; }), /first families/);
  bad(mutate((raw) => { raw['category-family'][4] = 'teal'; }), /first families/);
});

test('categoryPaint_and_readers_reject_an_unknown_revision', () => {
  for (const revision of [0, 99, 1.5, '1', null, Number.NaN, 'constructor']) {
    assert.throws(() => categoryPaint(0, { revision }), /unknown palette revision/, String(revision));
  }
  assert.throws(() => readPalette({ revision: 99 }), /unknown palette revision/);
  assert.throws(() => readTiers({ revision: 0 }), /unknown palette revision/);
});

test('the_pattern_spacing_token_is_8_and_the_pattern_line_width_is_the_common_line_token', () => {
  assert.equal(values.size.chart['pattern-spacing'], 8);
  assert.equal(tokens.size.chart['pattern-spacing'], 'var(--size-chart-pattern-spacing)');
  assert.equal(typeof values.border.tag, 'number', 'the existing line width token that the renderer uses for pattern strokes');
  assert.ok(!('category-pattern-step' in values.color.data), 'the step lives only in the revisions');
});
