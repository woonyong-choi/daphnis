// 근거: 모바일 목표 폭으로 다시 배치하되 도형 크기·사건 의미를 보존하고, 맞지 않는 결과를 숨기지 않는다.
// 원본은 test/fixtures의 손으로 쓴 daphnis 2 파일이다(그래프 보기가 하나인 문서만 목표 폭으로 다시 배치한다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';

const sourceOf = (path) => readFileSync(new URL(`./fixtures/${path}.dap`, import.meta.url), 'utf8');
const sizesOf = (scene) => scene.items.map(({ id, w, h }) => ({ id, w, h })).sort((a, b) => a.id.localeCompare(b.id));
const eventsOf = (timeline) => ({
  steps: timeline.steps,
  total: timeline.total,
  values: timeline.values,
  segs: timeline.segs.map(({ hops, ...seg }) => ({
    ...seg,
    hops: hops.map(({ edges, at, ms, to, data, tone }) => ({ edges, at, ms, to, data, tone })),
  })),
});
const edgesOf = (scene) => scene.edges.map(({ from, to }) => [from, to]);
// 값과 큐를 가진 카드, 카드에 글이 올라가는 장면. 모든 이동이 `time=`을 적어 시각이 선 길이에 기대지 않는다(좁은 배치가 사건 시각과 값을 바꾸면 안 된다).
const TIMED = {
  'values-and-queue': 'daphnis 2\nbox web "웹"\nbox api "API"\nstore db "DB"\nvalue sent "보낸 수" on=web\nvalue saved "저장한 수" on=db\nqueue jobs "대기열" slots=4\nweb -> api\napi -> db\non api sent+1\non db saved+1\nscene "첫 요청" mode=once\n  web -> api "요청" time=600ms\n  api -> db "저장" time=600ms set="jobs+1"\n',
  'dynamic-cards': `daphnis 2\naspect 8\n${['하나', '둘', '셋', '넷', '다섯'].map((name, i) => `box n${i} "카드 ${name}"`).join('\n')}\n${[0, 1, 2, 3].map((i) => `n${i} -> n${i + 1}`).join('\n')}\nscene "카드" mode=once\n${[0, 1, 2, 3].map((i) => `  n${i} -> n${i + 1} "전달 ${i}" time=500ms\n  show n${i + 1} "도착" tag="n${i + 1}"`).join('\n')}\n`,
};
// 폭 320에 들어가는 형제 층이 여럿인 그래프와, 중첩 그룹이 있어 폭이 모자랄 수 있는 그래프
const LAYERS = ['csapp/producer-consumer', 'csapp/call-registers', 'csapp/vm-translation', 'layout/task-lifecycle', 'chip-reach/a7-cache'];
const NESTED = ['csapp/dns-structure', 'csapp/exception-kinds', 'layout/event-loop', 'layout/attention-flow'];
// 클래스 카드가 있는 그래프
const CLASS_MODEL = 'daphnis 2\nclass order "Order" {\n  field id "UUID"\n  method save "(): void"\n}\nclass item "Item" {\n  field sku "text"\n}\ninterface repo "Repository" {\n  method find "(id: UUID): Order"\n}\norder -> item relation=composition from="1" to="0..*" "items"\norder -> repo relation=realization\n';

test('layout_width_reflows_explicitly_timed_cards_without_changing_values_sizes_or_events', async () => {
  for (const [name, source] of Object.entries(TIMED)) {
    const standard = await buildFigure(source);
    const narrow = await buildFigure(source, { layoutWidth: 320 });
    assert.ok(narrow.scene.width < standard.scene.width, name);
    assert.deepEqual(sizesOf(narrow.scene), sizesOf(standard.scene), name);
    assert.deepEqual(eventsOf(narrow.timeline), eventsOf(standard.timeline), name);
    assert.deepEqual(narrow.figure, standard.figure, '배치 목표가 작성한 원본 방향이나 의미를 바꾸지 않는다');
  }
});

test('layout_width_reports_overflow_instead_of_shrinking_nodes_or_claiming_a_fit', async () => {
  const source = sourceOf('layout/chip-beside-shape');
  const fitting = await buildFigure(source, { layoutWidth: 320 });
  assert.ok(fitting.scene.width <= 320);
  assert.equal(fitting.warnings.some(({ code }) => code === 'layout-width'), false);
  const overflow = await buildFigure(source, { layoutWidth: 100 });
  assert.ok(overflow.scene.width > 100);
  assert.match(overflow.warnings.find(({ code }) => code === 'layout-width').message, /exceeding the requested 100px/);
  assert.deepEqual(sizesOf(overflow.scene), sizesOf((await buildFigure(source)).scene));
  await assert.rejects(buildFigure(source, { layoutWidth: 100, strict: true }), /exceeding the requested 100px/);
});

test('layout_width_rejects_invalid_constraints_and_unsupported_documents', async () => {
  for (const layoutWidth of [0, -1, NaN, Infinity, '320']) {
    await assert.rejects(buildFigure('daphnis 2\nbox a "A"\n', { layoutWidth }), /positive finite number/);
  }
  // 그래프 보기가 하나가 아닌 문서(차트만 있는 문서, 순서 보기만 있는 문서)는 목표 폭으로 다시 배치하지 않는다.
  for (const source of ['daphnis 2\nchart c "차트" bar {\n  series a "A"\n  row "R" a=1\n}\n', 'daphnis 2\nbox a "A"\nbox b "B"\nview calls sequence {\n  a b\n}\nscene "s"\n  a -> b\n']) {
    await assert.rejects(buildFigure(source, { layoutWidth: 320 }), /layoutWidth is only for documents with a graph view/, source);
  }
});

// cost: time O(n·elk), heap O(s + e), stack O(d)
// vars: n = 원본 수, elk = 배치 비용, s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
test('narrow_sibling_layers_fit_without_adding_serial_dependencies_or_shrinking_shapes', async () => {
  for (const [name, source] of [...LAYERS.map((path) => [path, sourceOf(path)]), ['class-model', CLASS_MODEL]]) {
    const wide = await buildFigure(source);
    const narrow = await buildFigure(source, { layoutWidth: 320 });
    assert.ok(narrow.scene.width <= 320, `${name}: ${narrow.scene.width}`);
    assert.deepEqual(sizesOf(narrow.scene), sizesOf(wide.scene), name);
    assert.deepEqual(narrow.figure, wide.figure, name);
    assert.deepEqual(edgesOf(narrow.scene), edgesOf(wide.scene), name);
    assert.equal(narrow.warnings.some(({ code }) => code === 'layout-width'), false, name);
  }
});

test('narrow_group_layers_keep_membership_directions_and_connections', async () => {
  const source = sourceOf('chip-reach/context');
  const wide = await buildFigure(source);
  const narrow = await buildFigure(source, { layoutWidth: 320, strict: true });
  assert.ok(narrow.scene.width <= 320);
  assert.deepEqual(narrow.figure, wide.figure);
  assert.deepEqual(sizesOf(narrow.scene), sizesOf(wide.scene));
  assert.deepEqual(edgesOf(narrow.scene), edgesOf(wide.scene));
  assert.equal(narrow.scene.groups.some((group) => group.isTitleBlocked), false);
});

// cost: time O(n·elk), heap O(s + e), stack O(d)
// vars: n = 원본 수, elk = 배치 비용, s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
test('narrow_nested_groups_preserve_titles_and_report_any_remaining_overflow', async () => {
  for (const name of NESTED) {
    const source = sourceOf(name);
    const standard = await buildFigure(source);
    const narrow = await buildFigure(source, { layoutWidth: 320 });
    assert.deepEqual(narrow.figure, standard.figure, name);
    assert.deepEqual(sizesOf(narrow.scene), sizesOf(standard.scene), name);
    assert.deepEqual(edgesOf(narrow.scene), edgesOf(standard.scene), name);
    assert.equal(narrow.scene.groups.some((group) => group.isTitleBlocked), false, name);
    const overflow = narrow.scene.width > 320;
    assert.equal(narrow.warnings.some(({ code }) => code === 'layout-width'), overflow, name);
    if (overflow) await assert.rejects(buildFigure(source, { layoutWidth: 320, strict: true }), /exceeding the requested 320px/, name);
    else await assert.doesNotReject(buildFigure(source, { layoutWidth: 320, strict: true }), name);
  }
});
