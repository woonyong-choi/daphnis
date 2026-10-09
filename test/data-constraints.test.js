// 근거: docs/design/figure-kinds.md 데이터 관계의 열 제약과 삭제 정책.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFigure } from '../src/build.js';
import { columnRules } from '../src/table.js';
import { toSvg } from '../src/svg.js';
import { errorsOf } from './helpers.js';

function sourceWith(options) {
  return `daphnis 2\ntable parent "부모" {\n id bigint pk\n}\ntable child "자식" {\n parent_id bigint ${options}\n}`;
}

test('buildFigure_data_constraints_render_all_declared_keys_and_policies', async () => {
  for (const [options, key, type] of [
    ['pk unique fk=parent.id required ondelete=cascade', 'PK FK UNQ', 'bigint NOT NULL ON DELETE CASCADE'],
    ['fk=parent.id nullable ondelete=set-null', 'FK', 'bigint NULL ON DELETE SET NULL'],
    ['fk=parent.id required ondelete=restrict', 'FK', 'bigint NOT NULL ON DELETE RESTRICT'],
    ['fk=parent.id ondelete=no-action', 'FK', 'bigint ON DELETE NO ACTION'],
  ]) {
    const result = await buildFigure(sourceWith(options), { strict: true });
    const svg = await toSvg(result, { isStatic: true });

    assert.ok(svg.includes(`>${key}</tspan>`), key);
    assert.ok(svg.includes(type), '전체 열 설명도 유지한다');
    assert.ok(svg.includes('class="cell type">bigint</text>'));
    const column = result.figure.nodes.find((node) => node.id === 'child').columns[0];
    for (const rule of columnRules(column)) assert.ok(svg.includes(`class="cell rule">${rule}</text>`), rule);
  }
});

test('parseFigure_data_constraints_reject_conflicting_or_incomplete_declarations', () => {
  for (const [options, expected] of [
    ['pk nullable', /primary key cannot be nullable/],
    ['nullable required', /nullable and required cannot be combined/],
    ['ondelete=cascade', /ondelete requires fk/],
    ['fk=parent.id required ondelete=set-null', /set-null requires nullable/],
    ['fk=parent.id ondelete=set-null', /set-null requires nullable/],
    ['fk=parent.id ondelete=invalid', /ondelete is one of/],
    ['required required', /written twice/],
    ['fk=parent.id fk=parent.id', /written twice/],
  ]) {
    assert.match(errorsOf(sourceWith(options)).join('\n'), expected, options);
  }
  assert.deepEqual(errorsOf(sourceWith('fk=parent.id')), []);
});

// 제약 때문에 앞 열의 높이가 늘어도 외래 키 선은 해당 열의 이름 줄에 붙는다.
test('foreign_key_ports_follow_the_name_row_after_multiline_constraints', async () => {
  const source = sourceWith('fk=parent.id required ondelete=cascade').replace(' parent_id bigint', ' note text nullable\n parent_id bigint');
  const { scene } = await buildFigure(source, { strict: true });
  const child = scene.items.find((node) => node.id === 'child');
  const edge = scene.edges.find((line) => line.from === 'child');
  assert.ok(child.tableRows[0].h > child.rowH);
  // 첫 열은 머리 줄 아래에서 시작하고(머리 높이와 열 높이는 다르다), 둘째 열은 첫 열이 늘어난 높이 만큼 아래다.
  assert.equal(child.tableRows[0].y, child.headerH);
  assert.equal(child.tableRows[1].y, child.headerH + child.tableRows[0].h);
  assert.ok(Math.abs(edge.points[0].y - (child.y + child.tableRows[1].y + child.rowH / 2)) < 0.001);
  assert.ok(Math.abs(edge.points[0].y - (child.y + child.rowH * 2.5)) > 1);
});
