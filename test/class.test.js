// 근거: docs/design/figure-kinds.md 클래스 그림. 클래스와 인터페이스는 카드이고 연결은 한 가지 선 문법이다.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { errorsOf } from './helpers.js';

const TYPES = `daphnis 2
class order "Order<T>" abstract {
  field id "UUID" visibility=private
  field count "int" visibility=package static
  method save "(item: T): void" visibility=public abstract
  method check "(): bool" visibility=protected
}
interface repo "Repository<T>" {
  method find "(id: UUID): T"
}
view main graph down
`;

test('buildFigure_class_members_render_compartments_visibility_and_modifiers', async () => {
  const svg = await toSvg(await buildFigure(TYPES + 'order -> repo relation=realization\n', { strict: true }), { isStatic: true });

  // 긴 멤버는 칸 너비에서 줄이 바뀐다. 줄 바꿈 자리에 기대지 않고 멤버 글을 이어 읽는다.
  const rows = [...svg.matchAll(/<text class="classifier-text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' ');
  for (const text of ['Order&lt;T&gt;', '«interface»', '{abstract}', '- id: UUID', '~ count: int', '+ save(item: T): void {abstract}', '# check(): bool']) assert.ok(svg.includes(text) || rows.includes(text), text);
  assert.match(svg, /text-decoration="underline"/);
  assert.match(svg, /class="classifier-divider col-line"/);
});

test('buildFigure_class_relations_render_the_declared_marker_and_line_pattern', async () => {
  for (const [relation, targetKind, marker, dashed] of [
    ['association', 'class', undefined, false],
    ['dependency', 'class', 'marker-end="url(#fl-arrow-0)"', true],
    ['inheritance', 'class', 'marker-end="url(#fl-triangle-0)"', false],
    ['realization', 'interface', 'marker-end="url(#fl-triangle-0)"', true],
    ['aggregation', 'class', 'marker-start="url(#fl-diamond-open-0)"', false],
    ['composition', 'class', 'marker-start="url(#fl-diamond-filled-0)"', false],
  ]) {
    const source = `daphnis 2\nclass a "A" {\n}\n${targetKind} b "B" {\n}\na -> b relation=${relation}\n`;
    const svg = await toSvg(await buildFigure(source, { strict: true }), { isStatic: true });
    const path = svg.match(/<path id="p-0"[^>]+>/)?.[0];

    assert.ok(path, relation);
    if (marker) assert.ok(path.includes(marker), `${relation}: ${path}`);
    else assert.doesNotMatch(path, /marker-(?:start|end)/);
    assert.equal(path.includes('stroke-dasharray'), dashed, relation);
  }
});

test('parseFigure_class_invalid_members_and_relations_report_errors', () => {
  for (const [source, expected] of [
    ['daphnis 2\nclass a "A" {', /close class/],
    ['daphnis 2\nclass a "A" {\nfield x "int"\nfield x "int"\n}', /already in/],
    ['daphnis 2\nclass a "A" {\nmethod x "void"\n}', /parameter list/],
    ['daphnis 2\nclass a "A" {\nfield x "int" abstract\n}', /not fields/],
    [TYPES + 'order -> repo relation=inheritance', /two classes or two interfaces/],
    [TYPES + 'repo -> order relation=realization', /from a class to an interface/],
    [TYPES + 'repo -> order relation=composition', /whole.*must be a class/],
    ['daphnis 2\nclass a "A" {\n}\nclass b "B" {\n}\na -> b relation=inheritance\nb -> a relation=inheritance', /cannot contain a cycle/],
    ['daphnis 2\nclass a "A" {\n}\na -> a relation=inheritance', /cannot contain a cycle/],
    // 선 문법이 하나라 그룹도 끝이 될 수 있지만, 클래스 관계(relation=, from=, to=)는 두 끝이 모두 클래스나 인터페이스여야 한다.
    ['daphnis 2\ngroup g "G" {\nclass a "A" {\n}\n}\nclass b "B" {\n}\ng -> b relation=inheritance', /relation=, from=, and to= join two classes or interfaces/],
    ['daphnis 2\ngroup g "G" {\nclass a "A" {\n}\n}\nclass b "B" {\n}\nb -> g relation=composition', /relation=, from=, and to= join two classes or interfaces/],
  ]) assert.match(errorsOf(source).join('\n'), expected, source);
});

test('buildFigure_class_self_association_keeps_the_relation_outside_the_classifier', async () => {
  const source = 'daphnis 2\nclass node "Node" {\nfield children "List<Node>"\n}\nnode -> node relation=composition "children"\n';
  const result = await buildFigure(source, { strict: true });
  const svg = await toSvg(result, { isStatic: true });

  assert.match(svg, /marker-start="url\(#fl-diamond-filled-0\)"/);
  assert.deepEqual(result.warnings, []);
});

test('buildFigure_class_multiplicity_labels_keep_the_source_and_target_ends', async () => {
  const source = 'daphnis 2\nclass order "Order" {\n}\nclass item "Item" {\n}\nview main graph down\norder -> item relation=composition from="1" to="0..*" "items"\n';
  const result = await buildFigure(source, { strict: true });
  const svg = await toSvg(result, { isStatic: true });

  assert.match(svg, /data-end="from"[^>]*>1<\/text>/);
  assert.match(svg, /data-end="to"[^>]*>0\.\.\*<\/text>/);
  for (const [options, expected] of [
    ['relation=composition from="2"', /at most one whole/],
    ['relation=association to="2..1"', /invalid multiplicity/],
    ['relation=association to="-1"', /invalid multiplicity/],
    ['relation=association to="*..2"', /invalid multiplicity/],
    ['relation=dependency to="1"', /multiplicity belongs/],
  ]) assert.match(errorsOf(source.replace('relation=composition from="1" to="0..*" "items"', options)).join('\n'), expected);
});
