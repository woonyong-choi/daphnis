// 시각 수정: 검증 복원. 자기 참조 외래 키(같은 테이블의 서로 다른 두 열)와, 줄이 없는 명시적 정지 장면.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, readState } from './chrome.js';
import { playerHtml } from './player-compiled.js';

const doc = (body) => `daphnis 2\n${body}`;
const TABLES = 'table products "products" {\n  id uuid pk\n  parent_id uuid\n  name text\n}\ntable orders "orders" {\n  id uuid pk\n  product_id uuid fk=products.id\n}\n';
const VIEW = 'view schema graph right "스키마" {\n  products\n  orders\n}\n';
const errorsOf = async (source) => {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems;
  }
};

describe('self-referencing foreign key', () => {
  const inside = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

  // 근거: 같은 테이블의 서로 다른 두 열을 잇는 선은 허용한다. fk= 속성과 선 문장이 같은 모양을 만든다
  test('products.parent_id -> products.id compiles from both the fk attribute and an explicit edge', async () => {
    const viaAttribute = await buildFigure(doc(TABLES.replace('parent_id uuid\n', 'parent_id uuid fk=products.id\n') + VIEW));
    const viaEdge = await buildFigure(doc(`${TABLES}products.parent_id -> products.id "상위 상품"\n${VIEW}`));
    for (const result of [viaAttribute, viaEdge]) {
      const self = result.scene.edges.find((edge) => edge.from === 'products' && edge.to === 'products');
      assert.deepEqual([self.fromColumn, self.toColumn], ['parent_id', 'id']);
    }
  });

  // 근거: 선이 두 열의 연결점 높이에서 시작하고 끝나며, 중간 점은 카드 안에 들어가지 않고, 라벨 상자는 카드 밖이다
  test('the route leaves at the parent_id row and returns at the id row, outside the card, with the label outside', async () => {
    const { scene } = await buildFigure(doc(`${TABLES}products.parent_id -> products.id "상위 상품"\n${VIEW}`));
    const card = scene.items.find((it) => it.id === 'products');
    const self = scene.edges.find((edge) => edge.from === 'products' && edge.to === 'products');
    const [start, end] = [self.points[0], self.points.at(-1)];
    const rect = { x: card.x, y: card.y, w: card.w, h: card.h };
    assert.notEqual(start.y, end.y, '두 열은 서로 다른 높이다');
    for (const point of [start, end]) assert.ok(point.y > rect.y && point.y < rect.y + rect.h, '두 끝은 카드의 열 높이다');
    assert.ok(Math.abs(start.x - (rect.x + rect.w)) < 3, `parent_id 쪽은 카드 오른쪽 면에서 나간다: ${start.x}`);
    assert.ok(Math.abs(end.x - rect.x) < 3, `id 쪽은 카드 왼쪽 면으로 들어온다: ${end.x}`);
    assert.deepEqual(self.points.filter((point) => inside(point, rect)), [], '중간 점이 카드 안에 없다');
    const other = scene.edges.find((edge) => edge.to === 'products' && edge.from === 'orders');
    assert.ok(Math.abs(other.points.at(-1).y - end.y) < 1, '다른 테이블의 선도 같은 id 연결점으로 들어온다');
    const label = self.labelAt;
    assert.ok(label && !inside(label, rect), `라벨 자리가 카드 밖이다: ${JSON.stringify(label)}`);
    assert.ok(label.y > rect.y + rect.h || label.x > rect.x + rect.w || label.x < rect.x, '라벨이 카드 영역과 겹치지 않는다');
    for (const output of [await toSvg(await buildFigure(doc(`${TABLES}products.parent_id -> products.id "상위 상품"\n${VIEW}`))), await toHtml(await buildFigure(doc(`${TABLES}products.parent_id -> products.id "상위 상품"\n${VIEW}`)), 'x')]) assert.ok(output.includes('상위 상품'));
  });

  // 근거: 같은 열끼리, 카드 전체를 잇는 선, 한쪽만 열인 선은 뜻이 정해지지 않아 거절한다. API 카드도 같다
  test('the same column, a card-level self edge and a one-sided column are still refused', async () => {
    for (const edge of ['products.id -> products.id', 'products -> products', 'products.id -> products', 'products -> products.id']) {
      const problems = await errorsOf(doc(`${TABLES}${edge}\n${VIEW}`));
      assert.ok(problems.some((p) => /cannot go from .* to itself/.test(p.message)), `${edge}: ${JSON.stringify(problems.map((p) => p.message))}`);
    }
    assert.ok((await errorsOf(doc('api list "GET /items" {\n  id string\n  parent string\n}\nlist.parent -> list.parent\nview g graph right {\n  list\n}\n'))).length > 0);
    assert.deepEqual(await errorsOf(doc('api list "GET /items" {\n  id string\n  parent string\n}\nlist.parent -> list.id "상위"\nview g graph right {\n  list\n}\n')), []);
  });

  // 근거: 상태와 클래스의 자기 선, 격자의 두 칸 선은 그대로다
  test('state, class and grid self edges keep working', async () => {
    assert.deepEqual(await errorsOf(doc('state s "상태"\ns -> s "다시"\nview g graph right {\n  s\n}\n')), []);
    assert.match((await errorsOf(doc('box a "A"\na -> a\nview g graph right {\n  a\n}\n')))[0].message, /cannot go from "a" to itself/);
  });
});

describe('explicit empty static scene', () => {
  const base = 'box a "A"\nbox b "B"\nvalue n "n" on=b from=3\na -> b\n';

  // 근거: 줄 없는 정지 장면은 처음 구성의 정지 모습이다. 가짜 light나 wait가 필요 없고 숨은 진입 시간도 없다
  test('a static scene with no lines is the initial snapshot with zero length', async () => {
    const result = await buildFigure(doc(`${base}scene "구조" mode=static\n`));
    assert.deepEqual(result.timeline.segs.map((s) => [s.si, s.t0, s.t1]), [[0, 0, 0]]);
    assert.deepEqual(result.timeline.presentation, [0]);
    assert.equal(result.timeline.values[0].initial, '3');
    assert.deepEqual(result.timeline.values[0].changes, []);
    const next = await buildFigure(doc(`${base}scene "구조" mode=static\nscene "흐름" mode=once\n  a -> b time=600ms set="n+1"\n`));
    assert.deepEqual(next.timeline.segs.map((s) => [s.si, s.t0, s.t1]), [[0, 0, 0], [1, 0, 600]], '다음 장면은 0에서 시작한다. 숨은 진입 시간이 없다');
    assert.deepEqual(next.timeline.presentation, [0, 1000]);
    assert.match(await toSvg(next, { scene: 0 }), /data-mode="static"/);
    assert.doesNotMatch(await toSvg(next, { scene: 0 }), /<animate/);
  });

  // 근거: 줄 없는 once와 loop는 재생할 것이 없어 오류이고, 고치는 방법을 알린다. 줄이 있는 길이 0 장면은 정상이다
  test('an empty once or loop scene is an error with a hint, and a non-empty zero-length one is valid', async () => {
    for (const mode of ['once', 'loop']) {
      const [problem] = await errorsOf(doc(`${base}scene "x" mode=${mode}\n`));
      assert.match(problem.message, /has no lines\. .*write mode=static for a still composition/);
      assert.equal(problem.line, 6);
    }
    const lit = await buildFigure(doc(`${base}scene "x" mode=once\n  light a\n`));
    assert.deepEqual(lit.timeline.presentation, [0]);
  });

  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  // 근거: 플레이어. 줄 없는 정지 장면은 첫 값이 보이고 프레임을 요청하지 않으며 탭으로 다음 장면에 들어가면 재생한다
  test('the player renders an empty static scene with no frame request and the next scene still plays', async () => {
    const { html } = await playerHtml(doc(`${base}scene "구조" mode=static\nscene "흐름" mode=once\n  a -> b time=600ms set="n+1"\n`));
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(60_000);
    await page.evaluate(() => {
      window.rafCalls = 0;
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        window.rafCalls++;
        return request(callback);
      };
    });
    await page.setContent(html);
    const first = await readState(page);
    assert.deepEqual([first.ended, first.isPlaying, first.values], [true, false, ['3']]);
    const calls = await page.evaluate(() => window.rafCalls);
    await page.clock.runFor(2000);
    assert.equal(await page.evaluate(() => window.rafCalls), calls, '정지 장면은 프레임을 요청하지 않는다');
    await page.getByRole('tab', { name: '흐름', exact: true }).click();
    await page.clock.runFor(2000);
    const done = await readState(page);
    assert.deepEqual([done.ended, done.values], [true, ['4']]);
    await page.close();
  });
});
