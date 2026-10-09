// 박자 이동 글 상자의 6할 규칙을 막던 두 예제(architecture "재고 조회", class "연관")와 그 일반 교정(옆 폭).
// 근거: docs/design/layout.md(박자 이동과 옆 폭), figure-check.md 7번(박자 이동 보이는 비율). 막는 것은 층 간격이 아니라 배치가 정해진 뒤 선 옆에 자리를 고르는 글자(그룹 제목, 끝 라벨)가 이웃 박자 이동 글 상자의 옆 폭 안에 놓이는 것이었다.
// 규칙은 완화하지 않았다: 박자 이동은 보이는 시간의 6할을 채우고 글자·알약·카드 안을 덮지 않는다. 예제별 좌표, 짧게 줄인 글, 경고 면제는 없다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure, reflowFigure } from '../src/build.js';
import { COMPACT_WIDTH } from '../src/canvas.js';
import { CHIP_CLEAR, sizeChip } from '../src/chip.js';
import { roomByView, sweepByView } from '../src/chip-room.js';
import { placeTitles } from '../src/layout/titles.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';

const read = (id) => readFileSync(new URL(`../examples/${id}.dap`, import.meta.url), 'utf8');
const build = (id, options = {}) => buildFigure(read(id), { baseDir: 'examples', strict: true, ...options });

test('chip_room_splits_the_layer_gap_keys_from_the_sweep_keys', () => {
  const asked = new Map([
    ['g\u00003', 40],
    ['g\u00003\u0000sweep', { x: 32.6, y: 33 }],
    ['g\u00007', 16],
  ]);
  assert.deepEqual([...roomByView(asked).get('g')], [[3, 40], [7, 16]], '옆 폭 키는 층 간격에 섞이지 않는다');
  assert.deepEqual([...sweepByView(asked).get('g')], [[3, { x: 32.6, y: 33 }]], '옆 폭만 모은다');
  assert.equal(sweepByView(new Map([['g\u00003', 40]])).size, 0, '옆 폭 요구가 없으면 비어 있다');
});

test('group_title_steps_aside_by_the_sweep_of_the_edge_it_is_next_to_and_keeps_the_default_clearance_otherwise', () => {
  const edges = [{ index: 3, points: [{ x: 314, y: -50 }, { x: 314, y: 300 }] }];
  const group = (w = 600) => ({ id: 'g', label: '데이터', x: 300, y: 0, w });
  const clearOf = (sweep, w) => {
    const g = group(w);
    placeTitles([g], edges, sweep);
    return { fromLine: g.x + g.titleDx - 314, dx: g.titleDx };
  };
  const width = sizeChip(['재고 조회']).w;
  const sweep = width / 2 + CHIP_CLEAR;
  assert.ok(clearOf(new Map()).fromLine < sweep, '옆 폭이 없으면 기본 간격만 둔다');
  assert.ok(clearOf(new Map([[3, { x: sweep, y: 0 }]])).fromLine >= sweep - 1e-9, '그 선의 옆 폭 밖에 선다');
  assert.equal(clearOf(new Map([[9, { x: sweep, y: 0 }]])).dx, clearOf(new Map()).dx, '다른 선의 옆 폭은 이 선 옆의 제목을 밀지 않는다');
  const alone = { id: 'g', label: '데이터', x: 300, y: 0, w: 120 };
  placeTitles([alone], [], new Map());
  assert.equal(clearOf(new Map([[3, { x: 400, y: 0 }]]), 120).dx, alone.titleDx, '옆 폭이 그룹에 들지 않으면 기본 거리를 둔다(경고는 숨기지 않는다)');
});

// strict는 7번 경고(박자 이동 글 상자가 보이는 시간의 6할을 못 채움)도 오류로 올린다. 모든 박자 이동의 6할과 글자 겹침 0은 edgecase-final의 예제 시험이 프레임마다 잰다.
test('architecture_and_class_build_in_strict_mode_without_the_moving_label_warning', async () => {
  for (const id of ['architecture', 'class']) {
    const result = await build(id);
    assert.deepEqual(result.warnings.filter((warning) => warning.code === 'check-7'), [], `${id}: 7번 경고가 없다`);
  }
});

test('architecture_group_title_and_class_sibling_multiplicity_make_room_beside_the_moving_label', async () => {
  const { scene } = await build('architecture');
  const data = scene.groups.find((group) => group.id === 'data');
  const lines = scene.edges.filter((edge) => edge.points.slice(1).some((point, i) => point.x === edge.points[i].x && point.x < data.x + data.titleDx && point.x > data.x - 1));
  assert.ok(lines.length > 0);
  const clear = sizeChip(['재고 조회']).w / 2 + CHIP_CLEAR;
  assert.ok(lines.some((edge) => edge.points.some((point) => Math.abs(data.x + data.titleDx - point.x) >= clear)), '제목은 선 옆 폭 밖에 선다');

  const classScene = (await build('class')).scene;
  const edge = classScene.edges.find((e) => e.from === 'order' && e.to === 'line');
  const from = edge.endpointLabels.find((label) => label.end === 'from');
  assert.ok(from.x < edge.points[0].x, '형제 선 옆의 출발 다중성은 자기 선의 반대쪽(왼쪽)으로 옮겨진다');
  const to = edge.endpointLabels.find((label) => label.end === 'to');
  assert.ok(to.x > edge.points.at(-1).x, '막히지 않은 도착 다중성은 그대로 오른쪽이다');
});

test('the_two_examples_are_deterministic_and_keep_the_narrow_layout_free_of_the_warning', async () => {
  for (const id of ['architecture', 'class']) {
    const [first, second] = [await build(id), await build(id)];
    assert.equal(await toSvg(first, { name: id }), await toSvg(second, { name: id }), `${id}: 같은 SVG`);
    assert.equal(await toHtml(first, id), await toHtml(second, id), `${id}: 같은 HTML`);
    // HTML 재생기의 좁은 배치와 같은 호출이다(html/responsive.js). 좁은 폭은 도형 크기를 줄이지 않아 strict면 폭 오류이므로 strict를 쓰지 않고 경고를 본다.
    const narrow = await reflowFigure(first, { layoutWidth: COMPACT_WIDTH, chartWidth: COMPACT_WIDTH });
    assert.deepEqual(narrow.warnings.filter((warning) => warning.code === 'check-7'), [], `${id}: 좁은 배치에도 7번 경고가 없다`);
  }
});

test('all_thirty_examples_compile_in_strict_mode', async () => {
  const ids = readdirSync(new URL('../examples/', import.meta.url)).filter((name) => name.endsWith('.dap')).map((name) => name.replace(/\.dap$/, ''));
  assert.equal(ids.length, 30);
  for (const id of ids) await build(id);
});
