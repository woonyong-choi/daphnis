// 둘째 판의 문서 하나: 카드, 칸, 연결점, 선, 보기, 장면이 한 모형이고 보기가 여럿이어도 한 시간표다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { FigureError } from '../src/source/problems.js';
import { values } from '../src/tokens.js';
import { PULSE, PULSE_MS } from '../src/pulse.js';

const MIXED = readFileSync(new URL('./fixtures/v2/mixed-order.dap', import.meta.url), 'utf8');

// 만들기가 오류로 끝나면 그 진단 목록 { code, line, message }, 아니면 빈 목록이다.
async function errorsOf(source, options) {
  try {
    await buildFigure(source, options);
    return [];
  } catch (error) {
    if (!(error instanceof FigureError)) throw error;
    return error.problems.map(({ code, line, message }) => ({ code, line, message }));
  }
}

const doc = (body) => `daphnis 2\n${body}`;

test('the mixed document parses to cards of every kind with ports on api and table fields and shared ids', async () => {
  const { figure } = await buildFigure(MIXED);
  assert.deepEqual(figure.nodes.map((n) => `${n.shape}:${n.id}`), ['person:user', 'box:gw', 'box:pay', 'api:create', 'table:orders', 'chart:lag', 'chart:trend', 'trace:t']);
  assert.equal(figure.nodes[0].icon, 'user', 'a person is a standard card with the shared user icon');
  const [request, store] = figure.edges;
  assert.deepEqual([request.from, request.to, request.toColumn], ['user', 'create', 'body']);
  assert.deepEqual([store.from, store.fromColumn, store.to, store.toColumn], ['create', 'body', 'orders', 'id']);
  assert.deepEqual(figure.views.map((v) => `${v.id}:${v.strategy}`), ['arch:graph', 'calls:sequence', 'latency:plot', 'timing:time']);
  assert.deepEqual(figure.views[0].cardIds, ['user', 'gw', 'pay', 'create', 'orders', 'lag'], 'a graph without a block holds every card except plot-owned charts and traces');
  assert.deepEqual(figure.views[1].cardIds, ['user', 'gw', 'pay']);
});

test('a move is shown once per view that holds it and every projection keeps the same time', async () => {
  const { timeline, figure } = await buildFigure(MIXED);
  const hops = timeline.segs.flatMap((seg) => seg.hops);
  // 첫 이동은 그래프에만, 둘째 이동은 그래프만, user -> gw와 gw -> pay, pay -> gw는 그래프와 순서 보기에 모두 보인다.
  // Node 20에는 Map.groupBy가 없어 이동을 줄별로 직접 묶는다.
  const byLine = new Map();
  for (const hop of hops) byLine.set(hop.line, [...(byLine.get(hop.line) ?? []), hop]);
  const lines = figure.steps[0].beats.filter((b) => b.hops.length).map((b) => b.hops[0].line);
  assert.deepEqual([...lines.map((l) => byLine.get(l).length)], [1, 1, 2, 2, 2]);
  for (const l of lines.slice(2)) {
    const [graph, sequence] = byLine.get(l);
    assert.notEqual(graph.edge, sequence.edge);
    assert.deepEqual([graph.at ?? 0, graph.ms, graph.cut], [sequence.at ?? 0, sequence.ms, sequence.cut]);
  }
  const back = byLine.get(lines[4]);
  assert.deepEqual(back.map((h) => h.isBack), [true, false], 'the reply runs back along the declared edge in the graph and forward in the sequence');
});

test('values change once at the owner arrival even though the move is drawn in two views', async () => {
  const { timeline } = await buildFigure(MIXED);
  const p95 = timeline.values.find((row) => row.id === 'p95');
  assert.equal(p95.changes.length, 1);
  const [at] = p95.changes[0];
  // 도착 시각은 박자 끝일 수 있다(머묾이 없다). 그 시각은 이동이 출발한 박자의 (시작, 끝]에 든다.
  const seg = timeline.segs.find((s) => s.t0 < at && at <= s.t1);
  const owner = seg.hops[0];
  assert.equal(at, seg.t0 + (owner.at ?? 0) + owner.ms, 'the graph edge sets the time');
});

test('timeline.steps are exactly { label, mode, speed } and nothing else', async () => {
  const { timeline } = await buildFigure(MIXED);
  assert.deepEqual(timeline.steps, [{ label: '주문 한 건', mode: 'loop', speed: 1.5 }]);
  const two = await buildFigure(doc('box a "A"\nbox b "B"\na -> b\nscene "정지"\n  a -> b\nscene "한 번" mode=once speed=2\n  a -> b\n'));
  assert.deepEqual(two.timeline.steps, [{ label: '정지', mode: 'static', speed: 1 }, { label: '한 번', mode: 'once', speed: 2 }]);
  for (const step of two.timeline.steps) assert.deepEqual(Object.keys(step), ['label', 'mode', 'speed']);
});

test('a static scene may hold moves and gives no warning', async () => {
  const { warnings, timeline } = await buildFigure(doc('box a "A"\nbox b "B"\na -> b\nscene "정지"\n  a -> b\n'), { strict: true });
  assert.deepEqual(warnings, []);
  assert.equal(timeline.steps[0].mode, 'static');
});

test('speed takes any positive finite number and refuses the rest with invalid-speed', async () => {
  const source = (speed) => doc(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=once speed=${speed}\n  a -> b\n`);
  for (const bad of ['0', '-1', 'abc', 'Infinity', 'NaN']) assert.equal((await errorsOf(source(bad))).at(0)?.code, 'invalid-speed', bad);
  for (const good of ['0.01', '50', '1.5']) assert.deepEqual(await errorsOf(source(good)), [], good);
  const [tooFast] = await errorsOf(source('1000000'));
  assert.equal(tooFast.code, 'invalid-speed');
  assert.match(tooFast.message, /shorter than 1ms \(max speed for this scene: \d+\)/);
  assert.match((await errorsOf(doc('box a "A"\nscene "s" mode=forever\n  show a "x"\n'))).at(0).message, /mode is one of static, once, loop/);
});

test('a beat is exactly its motion: no hold after it, no entry minimum, no dependence on explanatory text', async () => {
  const { timeline } = await buildFigure(doc('box a "A"\nbox b "B"\na -> b\nscene "하나"\n  a -> b time=1s\nscene "둘"\n  a -> b time=1s\n'));
  assert.deepEqual(timeline.segs.map((s) => [s.t0, s.t1]), [[0, 1000], [1000, 2000]], 'the first beat is not stretched to the hop speed and no beat is held');
  assert.equal(timeline.total, 2000);
});

test('heterogeneous ports: light and edges reach api fields, table columns, grid items and trace spans; class members are not ports', async () => {
  const source = doc(`api create "POST /orders" {
  body "Req"
}
table orders "orders" {
  id bigint pk
}
grid mem "memory" rows=1 cols=2 {
  item x "x" col=0
  item y "y" col=1
}
class order "Order" {
  field status "text"
}
trace t "t" {
  span s1 "work" lane=create at=0 dur=5
}
create.body -> orders.id
mem.x -> mem.y
scene "s"
  light create.body orders.id mem.y t.s1
`);
  assert.deepEqual(await errorsOf(source), []);
  const bad = (extra) => errorsOf(`${source.replace('scene "s"', `${extra}\nscene "s"`)}`);
  assert.match((await bad('order.status -> create')).at(0).message, /class members are not ports. Connect "order"/);
  assert.match((await bad('create.nope -> orders')).at(0).message, /api "create" has no field "nope"/);
  assert.match((await bad('orders.idd -> create')).at(0).message, /no column "idd"/);
  assert.match((await bad('create.body.x -> orders')).at(0).message, /write a part as card.part/);
});

test('names are one namespace for cards, groups, values and views, and fields stay inside their card', async () => {
  const dup = await errorsOf(doc('box a "A"\nvalue a "v" on=a\n'));
  assert.match(dup.at(0).message, /the name "a" is already used \(line 2\)/);
  assert.match((await errorsOf(doc('box a "A"\nbox b "B"\nview a graph\n'))).at(0).message, /already used/);
  const twoCharts = doc(`chart c1 "one" bar {
  series ms "ms"
  row "p" ms=1
}
chart c2 "two" bar {
  series ms "ms"
  row "p" ms=2
}
`);
  assert.deepEqual((await errorsOf(twoCharts)).filter((e) => e.code !== 'syntax' || !/unit/.test(e.message)), []);
});

test('view rules: membership, coverage, drawable edges and moves with no projection', async () => {
  const has = async (source, pattern) => assert.ok((await errorsOf(source)).some((e) => pattern.test(e.message)), `${pattern} in ${source}`);
  const base = 'box a "A"\nbox b "B"\ntable t "t" {\n  id int pk\n}\n';
  await has(doc(`${base}decision d "d?"\nview s sequence {\n  a d\n}\n`), /a decision card cannot be a sequence participant/);
  await has(doc(`${base}view s sequence {\n  a nope\n}\n`), /unknown card "nope"/);
  await has(doc(`${base}view g graph {\n  a\n  b\n}\n`), /card "t" is not shown in any view/);
  await has(doc(`${base}view g graph {\n  a\n  t\n}\nview h graph {\n  b\n}\nb -> t\n`), /edge b -> t is not drawn/);
  const group = doc('group g "G" {\n  box x "X"\n  box y "Y"\n}\nbox z "Z"\nview v graph {\n  x\n  z\n}\n');
  await has(group, /list group "g" instead of "x"/);
  const trace = 'trace t "t" {\n  span s "s" lane=a at=0 dur=0\n}\nbox a "A"\n';
  await has(doc(trace), /dur is a number above 0/);
  await has(doc('trace t "t" {\n  span s "s" lane=zz at=0 dur=5\n}\nbox a "A"\n'), /unknown card "zz"/);
  const split = doc('box a "A"\nbox b "B"\nview x sequence {\n  a\n}\nview y graph {\n  b\n}\nscene "s"\n  a -> b "m"\n');
  assert.match((await errorsOf(split)).at(0).message, /is not shown: no graph view holds an edge between them and no sequence view holds both/);
});

test('sequence-only statements need their ids in a sequence view', async () => {
  const source = (line) => doc(`box a "A"\nbox b "B"\na -> b\nscene "s"\n  a -> b "m"\n${line}`);
  assert.match((await errorsOf(source('  note a "x"\n'))).at(0).message, /"note a" needs "a" in a sequence view/);
  assert.match((await errorsOf(source('  activate a\n'))).at(0).message, /needs "a" in a sequence view/);
  const withView = doc('box a "A"\nbox b "B"\nview s sequence {\n  a b\n}\nview g graph\na -> b\nscene "s"\n  a -> b "m"\n  note a "x"\n');
  assert.deepEqual(await errorsOf(withView), []);
});

test('the trace panel puts spans at real times: x follows start and width follows duration, lanes by first appearance', async () => {
  const { scene } = await buildFigure(MIXED);
  const [panel] = scene.times;
  assert.deepEqual(panel.lanes.map((l) => l.id), ['gw', 'pay']);
  const [s1, s2] = panel.lanes.flatMap((l) => l.spans);
  assert.equal(s1.at, 0);
  const unit = (s2.x - s1.x) / 20;
  assert.ok(Math.abs(s1.w - unit * 180) < 1, 'width is proportional to duration');
  assert.ok(Math.abs(s2.w - unit * 140) < 1);
  assert.deepEqual(panel.scale.labels, ['0', '50', '100', '150', '200']);
});

test('a chart bound to a value has fixed axes, frames with stable mark ids and a period table in the timeline', async () => {
  const { timeline, scene } = await buildFigure(MIXED);
  const frames = scene.chartFrames.lag;
  assert.equal(frames.frames.length, 2, 'p95 holds 120 and 150');
  assert.ok(frames.marks.length > 0);
  for (const frame of frames.frames) assert.deepEqual(Object.keys(frame), frames.marks.map((m) => m.id));
  const card = scene.items.find((it) => it.id === 'lag');
  const ticks = [...card.chart.body.matchAll(/class="chart-tick">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(ticks, ['0', '50', '100', '150'], 'the axis already covers every frame');
  assert.ok(card.chart.body.includes('data-mark='));
  const row = timeline.charts.lag.rows[0];
  const changed = row.periods.map((p) => p[3].length);
  assert.deepEqual(row.periods.map((p) => p[2]), [0, 1]);
  assert.equal(changed[0], 0);
  assert.ok(changed[1] > 0);
  assert.equal(row.periods[0][1], row.periods[1][0]);
});

test('binding errors: a word value and charts that cannot be bound', async () => {
  const chart = (rows, kind = 'bar') => `value v "v" on=a from=none\nbox a "A"\nchart c "c" ${kind} {\n  series s "s"\n${rows}}\n`;
  const [word] = await errorsOf(doc(chart('  row "r" s=v\n')));
  assert.equal(word.code, 'value-type');
  assert.match(word.message, /chart "c" reads "v", which holds "none"/);
  const [box] = await errorsOf(doc('value v "v" from=1\nchart c "c" box {\n  row "r" min=v q1=1 median=2 q3=3 max=4\n}\n'));
  assert.equal(box.code, 'binding-unsupported');
  assert.equal((await errorsOf(doc('value v "v" from=1\nchart c "c" line {\n  series s "s"\n  point x=v s=1\n}\n'))).at(0).code, 'binding-unsupported');
});

test('a bound value that turns into a word at run time is a value-type error with the binding line', async () => {
  const source = doc('box a "A"\nbox b "B"\nvalue v "v" on=b from=1\nchart c "c" bar {\n  series s "s"\n  row "r" s=v\n}\na -> b\nscene "s" mode=once\n  a -> b set="v=late"\n');
  const [error] = await errorsOf(source);
  assert.equal(error.code, 'value-type');
  assert.equal(error.line, 7);
});

test('value slots follow the real text width across every scene and wrap long text', async () => {
  const header = 'box a "A"\nbox b "B"\nvalue q "메모" on=b from=0\na -> b\n';
  const long = '가'.repeat(40);
  const wide = await buildFigure(doc(`${header}scene "하나"\n  a -> b\nscene "둘"\n  a -> b set="q=${long}"\n`));
  const narrow = await buildFigure(doc(`${header}scene "하나"\n  a -> b\nscene "둘"\n  a -> b set="q=1"\n`));
  const row = (result) => result.scene.items.find((it) => it.id === 'b').card.layouts[0].rows[0];
  assert.ok(row(wide).valueSlot.lines > 1, '40 Korean syllables wrap');
  assert.equal(row(narrow).valueSlot.lines, 1);
  assert.ok(row(wide).valueSlot.w > row(narrow).valueSlot.w, 'a text that only appears in scene 2 reserves width for scene 1');
  const heights = wide.scene.items.find((it) => it.id === 'b').card.layouts.map((l) => l.height);
  assert.equal(new Set(heights).size, 1, 'layout is identical across scenes');
  assert.ok(wide.scene.items.find((it) => it.id === 'b').h > narrow.scene.items.find((it) => it.id === 'b').h);
  assert.deepEqual(await errorsOf(doc(`${header}scene "하나"\n  a -> b set="q=abcdefghijklmnop"\n`)), [], 'no 8 character cap');
});

test('pulses: one per net change, 80/80/240ms, no pulse for a round trip inside one tick', async () => {
  assert.deepEqual([PULSE.rise, PULSE.hold, PULSE.fall, PULSE_MS], [80, 80, 240, 400]);
  const head = 'box a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b\n';
  const net = await buildFigure(doc(`${head}scene "s" mode=once\n  a -> b set="n=1" time=1s\n  a -> b set="n=2" time=1s\n`));
  assert.deepEqual(net.timeline.pulses.map((p) => [p.key, p.at, p.si]), [['value:0', 1000, 0], ['value:0', 2000, 0]], 'beats run back to back, and a pulse belongs to its scene');
  const trip = await buildFigure(doc(`${head}scene "s" mode=once\n  a -> b set="n=1" time=1s & a -> b set="n=0" time=1s\n`));
  assert.deepEqual(trip.timeline.pulses, [], 'the text after the tick equals the text before it');
});

test('the same tick keeps the last write and a read update keeps one change', async () => {
  const head = 'box a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b\n';
  const each = await buildFigure(doc(`${head}scene "s" mode=once\n  a -> b set="n=1" time=1s & a -> b set="n=2" time=1s\n`));
  assert.deepEqual(each.timeline.values[0].changes, [[1000, '1'], [1000, '2']]);
  assert.equal(each.timeline.values[0].periods.at(-1)[2], '2');
});

test('marks merge overlapping ranges per element so one event ending never hides what another still holds', async () => {
  const { timeline } = await buildFigure(doc('box a "A"\nbox b "B"\na -> b\nscene "s" mode=once\n  a -> b time=1s\n  a -> b time=1s\n  light a\n'));
  for (const ranges of Object.values(timeline.marks)) {
    for (const [i, [from, to]] of ranges.entries()) {
      assert.ok(from < to);
      if (i) assert.ok(from > ranges[i - 1][1], 'ranges do not touch or overlap');
    }
  }
  assert.deepEqual(Object.keys(timeline.marks).filter((key) => key.startsWith('edge:')), [], 'a passed edge is not held');
  // `light a`는 길이 0인 마지막 박자지만 장면 끝까지 켜 둔다: 구간이 그 장면에서 지금까지 켠 목록을 가진다.
  assert.deepEqual(timeline.segs.map((seg) => seg.nodesOn), [[], [], ['a']]);
  assert.equal(timeline.segs.at(-1).t1 - timeline.segs.at(-1).t0, 0);
});

test('quiet edges are visible from their first pass to the scene end and are never held active', async () => {
  const source = doc('box a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c "조용히" quiet\nscene "s" mode=once\n  a -> b time=1s\n  b -> c time=1s\n  a -> b time=1s\n');
  const { timeline, scene } = await buildFigure(source);
  const quiet = scene.edges.findIndex((edge) => edge.quiet);
  assert.deepEqual(timeline.marks[`quiet:${quiet}`], [[1000, 3000, 0]], 'visible from the dot entering the edge until the scene ends, owned by scene 0');
  assert.deepEqual(Object.keys(timeline.marks), [`quiet:${quiet}`]);
});
