// 배치가 실패해도 내부 오류로 끝나지 않는다. 다시 시도해 그리거나, 줄 번호가 있는 오류 진단으로 알린다(docs/design/layout.md 배치 실패).
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import ELK from 'elkjs/lib/elk.bundled.js';
import { buildFigure } from '../src/build.js';
import { FigureError } from '../src/source/problems.js';

const SOURCE = ['flow right', 'group g "그룹" direction=down {', '  box a "A"', '  box b "B"', '}', 'a -> b "앞"', 'b -> a "되돌림"', ''].join('\n');

test('buildFigure_layout_that_always_throws_becomes_an_error_diagnostic_with_a_line_number', async () => {
  const layout = ELK.prototype.layout;
  const stub = mock.method(ELK.prototype, 'layout', async () => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  });
  try {
    await assert.rejects(buildFigure(SOURCE), (error) => {
      assert.ok(error instanceof FigureError);
      assert.equal(error.problems[0].severity, 'error');
      assert.equal(error.problems[0].code, 'layout');
      assert.equal(error.problems[0].line, 1);
      assert.match(error.problems[0].message, /Cannot read properties/);
      return true;
    });
    assert.equal(stub.mock.callCount(), 2, '안전 배치로 한 번 더 시도한다');
  } finally {
    stub.mock.restore();
    assert.equal(ELK.prototype.layout, layout);
  }
});

test('buildFigure_layout_that_fails_once_is_retried_with_the_safe_layout_and_draws', async () => {
  const layout = ELK.prototype.layout;
  let calls = 0;
  const stub = mock.method(ELK.prototype, 'layout', function failFirst(graph) {
    calls += 1;
    if (calls === 1) throw new Error('first attempt failed');
    return layout.call(this, graph);
  });
  try {
    const { scene } = await buildFigure(SOURCE);
    assert.equal(scene.edges.length, 2);
  } finally {
    stub.mock.restore();
  }
});

test('buildFigure_edge_without_a_route_is_reported_at_the_edge_line', async () => {
  const layout = ELK.prototype.layout;
  const stub = mock.method(ELK.prototype, 'layout', async function dropRoutes(graph) {
    const laid = await layout.call(this, graph);
    for (const child of laid.children ?? []) for (const e of child.edges ?? []) delete e.sections;
    for (const e of laid.edges ?? []) delete e.sections;
    return laid;
  });
  try {
    await assert.rejects(buildFigure(SOURCE), (error) => {
      assert.equal(error.problems[0].code, 'layout');
      assert.equal(error.problems[0].line, 6);
      assert.match(error.problems[0].message, /no route for edge a -> b/);
      return true;
    });
  } finally {
    stub.mock.restore();
  }
});
