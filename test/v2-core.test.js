// 코어 후속: 흐름의 그래프 보기별 투영, 순서 보기 참여자의 공통 머리, 이름 있는 색, 카드 머리와 글 위계, 도착 후광, 차트 문법.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hopLegs } from '../src/animate/legs.js';
import { buildFigure } from '../src/build.js';
import { patternDefs } from '../src/styles.js';
import { toSvg } from '../src/svg.js';
import { parseFigure } from '../src/source/parse.js';
import { PULSE, PULSE_MS, envelopeKeys } from '../src/pulse.js';
import { STYLE } from '../src/measure/sizes.js';
import { categoryPaint } from '../src/chart-palette.js';
import { autoTone, FAMILIES, TONES } from '../src/tone.js';
import { readFileSync } from 'node:fs';

const doc = (body) => `daphnis 2\n${body}`;
const errorsOf = async (source) => {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ line, message }) => ({ line, message }));
  }
};
const parseErrors = (source) => {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ line, message }) => ({ line, message }));
  }
};

// ---- 흐름: 그래프 보기마다 점 하나, 논리 사건 하나 ----

const TWO_GRAPHS = (scene) => doc(`box a "A"\nbox b "B"\nbox c "C"\nvalue count "count" on=b from=0\na -> b\nb -> c\nview v1 graph right "첫째" {\n  a b c\n}\nview v2 graph down "둘째" {\n  a b c\n}\n${scene}`);

test('a track in two graph views draws one packet per view and counts the logical event once', async () => {
  const result = await buildFigure(TWO_GRAPHS('scene "s" mode=once for=2s\n  track a -> b every=500ms time=300ms set="count+1"\n'));
  const [seg] = result.timeline.segs;
  assert.equal(result.scene.edges.length, 4, 'the two edges are drawn in each view');
  assert.equal(result.timeline.tracks.length, 2, 'one path per view');
  assert.deepEqual(result.timeline.tracks.map((t) => [t.source, t.view]), [[0, 'v1'], [0, 'v2']]);
  const byTrack = [0, 1].map((k) => seg.hops.filter((h) => h.track === k));
  assert.equal(byTrack[0].length, 4, 'a dot leaves at 0, 500, 1000, 1500ms');
  assert.deepEqual(byTrack[0].map((h) => [h.at, h.ms]), byTrack[1].map((h) => [h.at, h.ms]), 'both views share departure and travel time');
  assert.notDeepEqual(byTrack[0][0].legEdges, byTrack[1][0].legEdges, 'each view follows its own edge');
  assert.deepEqual(hopLegs(byTrack[0][0]).map(({ from, to }) => [from, to]), hopLegs(byTrack[1][0]).map(({ from, to }) => [from, to]), 'both edges are occupied in the same windows');
  assert.equal(seg.edgesAt, undefined, 'no edge is held after a dot passes');
  assert.equal(seg.edgesOn, undefined);
  const [row] = result.timeline.values;
  assert.equal(row.changes.length, 4, 'the counter changes once per arrival, not once per view');
  assert.equal(row.changes.at(-1)[1], '4');
  assert.deepEqual(row.changes.map(([t]) => t), [300, 800, 1300, 1800]);
  assert.deepEqual(seg.pulses.map((p) => p.id), ['b', 'b', 'b', 'b'], 'the arrival effect is one logical event per arrival');
});

test('the arrival effect reaches every drawn instance of the card with one timing', async () => {
  const result = await buildFigure(TWO_GRAPHS('scene "s" mode=once for=2s\n  track a -> b time=300ms\n'));
  const svg = await toSvg(result, { scene: 0 });
  // 움직이는 SVG는 움직임 층 뒤에 마지막 모습 층(`.fl-still`)을 한 벌 더 싣는다. 보기 수는 움직임 층에서 센다.
  const [motion] = svg.split('class="fl-still"');
  assert.equal([...motion.matchAll(/data-id="b"/g)].length, 2, 'the card is drawn in both views');
  const overlays = [...svg.matchAll(/class="fl-pulse"[^>]*>\s*<animate attributeName="opacity"[^>]*keyTimes="([^"]*)" values="([^"]*)"/g)];
  const forB = overlays.filter((m) => m[2].includes('1'));
  assert.ok(forB.length >= 2, 'the border pulse is drawn in both views');
  assert.equal(new Set(forB.map((m) => m[0].split('keyTimes=')[1])).size, 1, 'same keys in both views');
});

test('a multi-leg track keeps the same arrival, loss and cut in every view and uses each view edge direction', async () => {
  const source = doc('box a "A"\nbox b "B"\nbox c "C"\nvalue n "n" on=c from=0\na -> b\nc -> b\nview v1 graph right {\n  a b c\n}\nview v2 graph down {\n  a b c\n}\nscene "s" mode=once for=3s\n  track a -> b -> c "x" time=1s set="n+1@c"\nscene "lost" mode=once for=3s\n  track a -> b -> c time=1s lost=70% set="n+1@c"\n');
  const { timeline, scene } = await buildFigure(source);
  for (const si of [0, 1]) {
    const hops = timeline.segs.filter((s) => s.si === si).flatMap((s) => s.hops);
    const [first, second] = [0, 1].map((v) => hops.filter((h) => h.track === 2 * si + v));
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0].ms, second[0].ms);
    assert.equal(first[0].cut, second[0].cut, 'the loss cuts both packets at the same time');
    // 두 번째 선(c -> b)은 거꾸로 지난다: 지나는 구간 둘 가운데 둘째는 같은 방향 선이 아니다
    for (const hop of [first[0], second[0]]) {
      assert.equal(hop.legEdges.length, 2);
      assert.equal(scene.edges[hop.legEdges[1]].from, 'c');
    }
    // 보기마다 도형 안 이음이 달라도 도형에 닿는 시각은 같다
    assert.equal(second[0].pace.length > 2, true);
  }
  assert.deepEqual(timeline.values[0].changes.map(([, text]) => text), ['1']);
  assert.deepEqual(timeline.values[1].changes, [], 'a packet lost before c never changes the value');
});

test('a track is drawn in graph views only: a sequence view gains no message and a path outside one graph view is an error', async () => {
  const withSequence = doc('box a "A"\nbox b "B"\na -> b\nview g graph {\n  a b\n}\nview s sequence {\n  a b\n}\nscene "s" mode=once for=1s\n  track a -> b time=300ms\n');
  const result = await buildFigure(withSequence);
  assert.equal(result.timeline.tracks.length, 1);
  assert.equal(result.scene.panels.find((p) => p.strategy === 'sequence') !== undefined, true);
  assert.equal(result.scene.edges.filter((e) => e.strategy === 'sequence').length, 0);
  const sequenceOnly = doc('box a "A"\nbox b "B"\na -> b\nview g graph {\n  a\n}\nview h graph {\n  b\n}\nview s sequence {\n  a b\n}\nscene "s" mode=once for=1s\n  track a -> b time=300ms\n');
  assert.ok((await errorsOf(sequenceOnly)).some((e) => /must lie inside one graph view/.test(e.message)));
});

test('a timeout branch is a graph edge: with a sequence view first it still gets a number, never NaN', async () => {
  const body = (views) => doc(`box a "A"\nbox b "B"\nbox c "C"\nvalue ready "ready" on=b from=0\na -> b\na -> c\n${views}scene "s" mode=once\n  a -> b "요청" wait="ready>=1" timeout=2s else=c\n`);
  const graph = 'view arch graph right {\n  a b c\n}\n';
  const sequence = 'view calls sequence {\n  a b c\n}\n';
  for (const views of [sequence + graph, graph + sequence]) {
    const { timeline, scene } = await buildFigure(body(views));
    const hops = timeline.segs.flatMap((s) => s.hops);
    assert.equal(hops.length, 1, 'only the else branch departs');
    assert.ok(Number.isInteger(hops[0].edge), `edge ${hops[0].edge}`);
    assert.equal(scene.edges[hops[0].edge].to, 'c');
    assert.equal(scene.edges[hops[0].edge].strategy, 'graph');
  }
  const sequenceOnly = await errorsOf(body(`${sequence}`));
  assert.ok(sequenceOnly.length > 0);
  assert.ok(sequenceOnly.every((e) => !/NaN/.test(e.message)));
});

// ---- 순서 보기 참여자: 공통 카드 머리 ----

const CARDS = 'api create "POST /orders" {\n  body "OrderRequest"\n}\ntable orders "orders" {\n  id bigint pk\n}\nclass order "Order" {\n  field id "int"\n}\nbox gw "Gateway" icon=server\nvalue hits "hits" on=create from=0\n';

test('api, table and class cards join a sequence view as the common header while the graph view keeps the fields', async () => {
  const source = doc(`${CARDS}gw -> create.body\ncreate.body -> orders.id\nview arch graph right {\n  gw create orders order\n}\nview calls sequence {\n  gw create orders order\n}\nscene "s" mode=once\n  gw -> create "POST" set="hits+1"\n`);
  const { scene, timeline } = await buildFigure(source);
  for (const id of ['create', 'orders', 'order']) {
    const items = scene.items.filter((it) => it.id === id);
    assert.equal(items.length, 2, `${id} is drawn in both views`);
    const [graph, sequence] = items;
    assert.equal(graph.headerOnly, undefined);
    assert.equal(sequence.headerOnly, true, `${id} is the header only in the sequence view`);
    assert.ok(sequence.h < graph.h, 'the header is shorter than the full card');
  }
  assert.equal(timeline.values.length, 1, 'the logical card keeps one value');
  const svg = await toSvg(await buildFigure(source), { isStatic: true });
  assert.equal([...svg.matchAll(/data-id="create"/g)].length, 2);
  assert.ok(!/NaN/.test(svg));
});

test('a card refused as a sequence participant is reported once and is not also reported as hidden', async () => {
  const errors = await errorsOf(doc('box a "A"\ndecision d "ok?"\nview s sequence {\n  a d\n}\nview g graph {\n  a\n}\n'));
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0].message, /a decision card cannot be a sequence participant/);
});

// ---- 이름 있는 색 ----

test('tone and paint families come from the shared palette and gray is the only neutral', () => {
  assert.deepEqual(FAMILIES, ['blue', 'yellow', 'red', 'green', 'orange', 'purple', 'cyan']);
  assert.deepEqual(TONES, [...FAMILIES, 'gray']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(autoTone), [...FAMILIES, 'blue'], 'the automatic order follows the category order with no reserved status colors');
});

test('flows and tags get automatic colors from the category order, one color per source name or tag', async () => {
  const source = doc('box a "A"\nbox b "B"\nbox c "C"\nbox d "D"\na -> d\nb -> d\nc -> d\nscene "s" mode=once for=2s\n  track a, b, c -> d time=300ms\n');
  const { timeline } = await buildFigure(source);
  assert.deepEqual(timeline.segs[0].hops.map((h) => h.tone), ['blue', 'yellow', 'red']);
  const tags = doc('box a "A"\nscene "s"\n  show a "하나" tag="one"\n  show a "둘" tag="two"\n  show a "셋" tag="three"\n');
  const { scene } = await buildFigure(tags);
  assert.deepEqual(scene.tagOrder, ['one', 'two', 'three']);
  const svg = await toSvg(await buildFigure(tags), { isStatic: true });
  const fills = [...svg.matchAll(/<rect [^>]*fill="(var\(--color-data-category-\d+\))" fill-opacity/g)].map((m) => m[1]);
  assert.deepEqual(fills, [0, 1, 2].map((i) => categoryPaint(i).fill), 'tags take the shared category fills in order');
});

// ---- 카드 머리와 글 위계 ----

test('a card header puts the icon beside the title and the person card uses the common user icon', async () => {
  const { scene } = await buildFigure(doc('person user "고객"\nbox svc "Order service" icon=server\nvalue wait "대기" on=svc from=0\nuser -> svc\n'));
  for (const id of ['user', 'svc']) {
    const it = scene.items.find((item) => item.id === id);
    const icon = it.decor.items.find((item) => item.kind === 'icon');
    const title = it.decor.items.find((item) => item.kind === 'title');
    assert.ok(icon && title && icon.x + icon.w <= title.x, `${id}: the icon is left of the title`);
    assert.equal(it.decor.inline, true);
    assert.equal(icon.y + icon.h / 2, title.y + title.h / 2, `${id}: icon and title share the first line center`);
  }
  assert.equal(scene.items.find((i) => i.id === 'user').iconData.name, 'user');
});

test('the person icon is one 24-grid path set and no bare person outline survives', () => {
  const symbols = readFileSync(new URL('../src/icons/person.js', import.meta.url), 'utf8');
  assert.ok(!/personOutline|values\.size\.person/.test(symbols));
  assert.equal((symbols.match(/class="symbol-face"/g) ?? []).length, 2, 'a head and a body');
});

test('title is 15 semibold, fields 13 and metadata 11 in the measure and in the CSS', () => {
  const css = readFileSync(new URL('../src/styles/figure.css', import.meta.url), 'utf8');
  const rule = (selector) => new RegExp(`${selector.replace(/\./g, '\\.')} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
  assert.deepEqual([STYLE.label.size, STYLE.label.face], [15, 'semibold']);
  for (const key of ['row', 'mono', 'cell', 'item', 'value']) assert.equal(STYLE[key].size, 13, key);
  for (const key of ['sub', 'meta', 'tag', 'key', 'mark', 'pill', 'type', 'chip']) assert.equal(STYLE[key].size, 11, key);
  assert.match(rule('.fl .label'), /simple2-label-size[\s\S]*weight-semibold/);
  for (const selector of ['.fl .row', '.fl .value', '.fl .cell', '.fl .item']) assert.match(rule(selector), /simple2-detail-size/, selector);
  for (const selector of ['.fl .sub', '.fl .meta', '.fl .tag', '.fl .edgelabel']) assert.match(rule(selector), /simple2-micro-size/, selector);
  assert.match(rule('.fl .schema-heading'), /color-surface/, 'a static schema header is neutral, not the selection blue');
  assert.ok(!/head-dy|fl-head|\.idle/.test(css), 'the header never moves');
});

// ---- 도착 후광, 고정 알약, 장면 선택 ----

const MOVE = doc('box a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b "요청"\nscene "하나" mode=loop\n  a -> b time=1s set="n+1"\nscene "둘" mode=once\n  a -> b time=2s\nscene "셋"\n  light b\n');

test('a packet arrival blinks the existing border for 80, 80 and 240 display ms and never fills the face', async () => {
  assert.deepEqual([PULSE.rise, PULSE.hold, PULSE.fall, PULSE_MS], [80, 80, 240, 400]);
  assert.deepEqual(envelopeKeys([1000], 3000).filter(([, level]) => level === 1).map(([t]) => t), [1080, 1160], 'rise 80, hold 80, decay 240');
  const result = await buildFigure(MOVE);
  const svg = await toSvg(result, { scene: 0 });
  assert.match(svg, /<[a-z]+ [^>]*class="fl-pulse" opacity="0" aria-hidden="true">\s*<animate attributeName="opacity"/);
  assert.equal(result.timeline.segs[0].pulses.some((p) => p.id === 'b'), true, 'arrival is in the timeline');
  const css = svg.match(/<style>[\s\S]*<\/style>/)[0];
  assert.ok(!/fl-head|translateY/.test(css), 'no idle header movement in the SVG');
  assert.ok(!/\.fl-node\.on[^{]*\{[^}]*animation/.test(css));
  // 점이 닿아도 도형 면 켜짐 keyframes가 없다: 도형의 윤곽 class에 면 색 애니메이션이 붙지 않는다
  assert.ok(!/color-mix\(in srgb, var\(--simple2-hover-fill\)/.test(svg.replace(/<style>[\s\S]*?<\/style>/, '')));
});

test('an explicit light still fills the face with its own role while arrival does not', async () => {
  const { timeline } = await buildFigure(MOVE);
  assert.deepEqual(timeline.segs.filter((s) => s.si === 0).flatMap((s) => s.nodesOn), [], 'a moving packet lights no node');
  assert.deepEqual(timeline.segs.filter((s) => s.si === 2).flatMap((s) => s.nodesOn), ['b']);
});

test('a fixed label pill fades its active border and text, not its opacity', async () => {
  const svg = await toSvg(await buildFigure(MOVE), { scene: 0 });
  const css = svg.match(/<style>[\s\S]*<\/style>/)[0];
  assert.match(css, /@keyframes a\d+ \{[^}]*stroke: var\(--color-state-active\)/);
  assert.match(css, /@keyframes a\d+ \{[^}]*fill: var\(--color-state-active\)/);
  const pill = /<rect [^>]*class="pill (a\d+)"/.exec(svg);
  assert.ok(pill, 'the pill has an activation class');
  const frames = new RegExp(`@keyframes ${pill[1]} \\{([^}]*)\\}[^}]*\\}`).exec(css)?.[0] ?? '';
  assert.ok(!/opacity/.test(frames));
});

test('a standalone SVG plays only the selected scene: loop repeats, once holds, static has no motion, and no scene advances to another', async () => {
  const result = await buildFigure(MOVE);
  const [loop, once, still] = await Promise.all([0, 1, 2].map((scene) => toSvg(result, { scene })));
  assert.match(loop, /data-mode="loop"/);
  assert.ok(loop.includes('repeatCount="indefinite"'));
  assert.ok(once.includes('repeatCount="1" fill="freeze"'));
  assert.ok(!/repeatCount="indefinite"/.test(once));
  assert.ok(!/<animate|repeatCount|animation:/.test(still.replace(/@font-face\{[^}]*\}/g, '')));
  for (const svg of [loop, once, still]) assert.equal([...svg.matchAll(/data-scene="(\d+)"/g)].length, 1);
  assert.equal(new Set([loop, once, still]).size, 3);
});

// ---- 무늬 정의는 SVG마다 한 번 ----

test('pattern definitions are shared once per SVG and keep their content-derived ids', () => {
  const a = '<pattern id="dp-pat-hatch-1" width="8" height="8"><line/></pattern>';
  const b = '<pattern id="dp-pat-dots-2" width="8" height="8"><circle/></pattern>';
  assert.equal(patternDefs([{ defs: a + b }, { defs: b }, { defs: a }, { defs: '' }]), b + a);
  assert.equal(patternDefs([{ defs: a + b }]), patternDefs([{ defs: b + a }]), 'sorted by id so equal figures are equal text');
  assert.equal(patternDefs([]), '');
});

// ---- 차트 문법 ----

const chart = (type, body, header = '') => doc(`chart c "제목" ${type} {\n${header}${body}}\n`);
const series = (n) => Array.from({ length: n }, (_, i) => `  series s${i} "계열 ${i}"\n`).join('');
const rows = (word, n, count) => Array.from({ length: count }, (_, r) => `  ${word} ${word === 'point' ? `x=${r + 1}` : `"행 ${r}"`} ${Array.from({ length: n }, (_, i) => `s${i}=${r + i + 1}`).join(' ')}\n`).join('');

test('bar, stacked, line, area and scatter take any number of series', () => {
  for (const n of [1, 2, 3, 5, 12]) {
    assert.deepEqual(parseErrors(chart('bar', series(n) + rows('row', n, 2), '  x "값(ms)"\n')), [], `bar ${n}`);
    assert.deepEqual(parseErrors(chart('stacked', series(n) + rows('row', n, 2), '  x "값(ms)"\n')), [], `stacked ${n}`);
    assert.deepEqual(parseErrors(chart('line', series(n) + rows('point', n, 3), '  y "값(ms)"\n')), [], `line ${n}`);
    assert.deepEqual(parseErrors(chart('area', series(n) + rows('point', n, 3), '  y "값(ms)"\n')), [], `area ${n}`);
  }
  const scatter = (n) => series(n) + Array.from({ length: n }, (_, i) => `  point "p${i}" x=${i + 1} y=${i + 2} series=s${i}\n`).join('');
  for (const n of [0, 1, 3, 9]) assert.deepEqual(parseErrors(chart('scatter', scatter(n) + (n ? '' : '  point "p" x=1 y=2\n'), '  x "x(ms)"\n  y "y(ms)"\n')), [], `scatter ${n}`);
});

test('series keep their chart-wide order: main first, compare next, the rest in declaration order, with no role invented past two', () => {
  const figure = parseFigure(chart('bar', '  series a "a"\n  series b "b" role=main\n  series c "c"\n  series d "d" role=compare\n  series e "e" role=reference\n  row "r" a=1 b=1 c=1 d=1 e=1\n'));
  assert.deepEqual(figure.figure.nodes[0].plot.chart.series.map((s) => [s.id, s.role]), [['b', 'main'], ['d', 'compare'], ['a', undefined], ['c', undefined], ['e', 'reference']]);
  const two = parseFigure(chart('bar', '  series a "a"\n  series b "b"\n  row "r" a=1 b=1\n'));
  assert.deepEqual(two.figure.nodes[0].plot.chart.series.map((s) => [s.id, s.role]), [['a', 'main'], ['b', 'compare']], 'one or two series keep the old roles');
  const dumbbell = parseFigure(chart('dumbbell', '  series a "a"\n  series b "b"\n  row "r" a=1 b=2\n'));
  assert.deepEqual(dumbbell.figure.nodes[0].plot.chart.series.map((s) => [s.id, s.role]), [['a', 'compare'], ['b', 'main']]);
  const three = parseFigure(chart('line', '  series a "a"\n  series b "b"\n  series c "c"\n  point x=1 a=1 b=1 c=1\n'));
  assert.deepEqual(three.figure.nodes[0].plot.chart.series.map((s) => s.role), [undefined, undefined, undefined]);
});

test('role rules: at most one main and one compare, reference needs an actual series, stacked, percent and dumbbell take no reference', () => {
  const messages = (type, head, row) => parseErrors(chart(type, `${head}${row}`)).map((e) => e.message).join('|');
  assert.match(messages('bar', '  series a "a" role=main\n  series b "b" role=main\n  series c "c"\n', '  row "r" a=1 b=1 c=1\n'), /at most one series with role=main/);
  assert.match(messages('bar', '  series a "a" role=compare\n  series b "b" role=compare\n  series c "c"\n', '  row "r" a=1 b=1 c=1\n'), /at most one series with role=compare/);
  assert.match(messages('bar', '  series a "a" role=main\n  series b "b" role=main\n', '  row "r" a=1 b=1\n'), /two series need one role=main and one role=compare/);
  assert.match(messages('bar', '  series a "a" role=reference\n  series b "b" role=reference\n', '  row "r" a=1 b=1\n'), /every series is role=reference/);
  assert.match(messages('stacked', '  series a "a"\n  series b "b" role=reference\n', '  row "r" a=1 b=1\n'), /role=reference is not allowed/);
  assert.match(messages('percent', '  series a "a"\n  series b "b" role=reference\n', '  row "r" a=1 b=1\n'), /role=reference is not allowed/);
  assert.match(messages('bar', '  series a "a" role=reference\n', '  row "r" a=1\n'), /one series shows it as main/);
  assert.equal(messages('bar', '  series a "a"\n  series b "b" role=reference\n', '  row "r" a=1 b=2\n'), '', 'a plan next to an actual series is fine');
  assert.equal(messages('line', '  series a "a"\n  series b "b" role=reference\n', '  point x=1 a=1 b=2\n'), '');
});

test('percent takes two or more series, zero and missing values, and refuses negatives', () => {
  const ok = chart('percent', '  series a "a"\n  series b "b"\n  series c "c"\n  row "정상" a=30 b=20 c=10\n  row "합 0" a=0 b=0 c=0\n  row "빠짐" a=5 b=- c=7\n', '  x "비율(%)"\n');
  assert.deepEqual(parseErrors(ok), []);
  assert.match(parseErrors(chart('percent', '  series a "a"\n  row "r" a=1\n'))[0].message, /takes 2 or more series\. Found 1/);
  const negative = parseErrors(chart('percent', '  series a "a"\n  series b "b"\n  row "r" a=3 b=-2\n'));
  assert.match(negative[0].message, /cannot be negative/);
  assert.equal(negative[0].line, 5, 'the error keeps the row line');
  assert.deepEqual(parseErrors(chart('percent', '  series a "a"\n  series b "b"\n  row "r" a=0 b=0\n')), [], 'a zero total leaves the ratio undefined; it is not an error');
  assert.deepEqual(parseErrors(chart('percent', '  series a "a"\n  series b "b"\n  row "r" a=- b=-\n')), [], 'a chart with no value still draws its frame and axis');
  assert.match(parseErrors(chart('percent', '  series a "a"\n  series b "b"\n  row "r" a=1 b=2\n', '  scale log\n'))[0].message, /starts at 0/);
  assert.match(parseErrors(chart('percent', '  series a "a"\n  series b "b"\n  rule 120 "limit"\n  row "r" a=1 b=2\n'))[0].message, /0 to 100/);
});

test('stacked takes signed values that stack up and down separately and takes all zero as real data', () => {
  assert.deepEqual(parseErrors(chart('stacked', '  series a "a"\n  series b "b"\n  series c "c"\n  row "r" a=5 b=-3 c=2\n  row "s" a=-1 b=-2 c=-3\n', '  x "값(ms)"\n')), []);
  assert.deepEqual(parseErrors(chart('stacked', '  series a "a"\n  series b "b"\n  row "r" a=0 b=0\n')), [], 'zero is a value');
  assert.match(parseErrors(chart('dumbbell', '  series a "a"\n  series b "b"\n  row "r" a=0 b=2\n', '  scale log\n'))[0].message, /log scale needs values above 0/, 'a log axis still refuses 0');
  assert.match(parseErrors(chart('bar', '  series a "a"\n  row "r" a=-1\n'))[0].message, /cannot be negative/, 'a bar still starts at 0');
});

test('step and line take missing values as gaps and step takes no interval', () => {
  const gap = (type) => chart(type, '  series a "a"\n  series b "b"\n  point x=1 a=1 b=2\n  point x=2 a=- b=3\n  point x=3 a=4 b=-\n', '  y "값(ms)"\n');
  assert.deepEqual(parseErrors(gap('line')), []);
  assert.deepEqual(parseErrors(gap('step')), []);
  assert.deepEqual(parseErrors(chart('step', '  series a "a"\n  point x=1 a=1\n  point x=2 a=2\n', '  y "값(ms)"\n')), []);
  assert.match(parseErrors(chart('step', '  series a "a"\n  point x=1 a=1 a.low=0 a.high=2\n'))[0].message, /"a.low" is not a value of a step chart/);
  assert.deepEqual(parseErrors(chart('step', '  series a "a"\n  point x=1 a=-\n  point x=2 a=-\n')), [], 'a step chart with no value still draws its frame and axis');
  assert.match(parseErrors(chart('area', '  series a "a"\n  point x=1 a=-\n  point x=2 a=1\n'))[0].message, /only for the values of/, 'area has no gaps');
  assert.match(parseErrors(chart('step', '  series a "a"\n  point x=1 a=1\n  point x=1 a=2\n'))[0].message, /appears twice/);
});

test('ecdf takes samples with ties, an optional series and missing samples, and takes a set with no finite sample', () => {
  assert.deepEqual(parseErrors(chart('ecdf', '  sample 1\n  sample 1\n  sample 3\n  sample 4\n  sample -\n', '  x "값(ms)"\n')), []);
  assert.deepEqual(parseErrors(chart('ecdf', '  series a "a"\n  series b "b"\n  sample 1 series=a\n  sample 1 series=a\n  sample 5 series=b\n')), [], 'a series with samples and one with fewer is fine');
  assert.match(parseErrors(chart('ecdf', '  series a "a"\n  sample 1\n'))[0].message, /the row needs series=value/);
  assert.match(parseErrors(chart('ecdf', '  series a "a"\n  sample 1 series=zz\n'))[0].message, /unknown series "zz"/);
  assert.deepEqual(parseErrors(chart('ecdf', '  sample -\n  sample -\n')), [], 'n=0 draws the frame and axis with no curve');
  assert.match(parseErrors(chart('ecdf', '  sample 1 extra\n'))[0].message, /write a sample as: sample number \[series=id\]/);
  assert.match(parseErrors(chart('ecdf', '  sample 1\n', '  scale log\n'))[0].message, /scale log is not allowed/);
  assert.match(parseErrors(chart('histogram', '  bins 0 10 2\n  sample 1 series=a\n'))[0].message, /write a sample as: sample number$/);
});

test('invalid chart input keeps its source line and the old two-series errors stay worded the same', () => {
  const unknown = parseErrors(chart('bar', '  series a "a"\n  row "r" a=1 zz=2\n'));
  assert.equal(unknown[0].line, 4);
  assert.match(unknown[0].message, /"zz" is not a value of a bar chart/);
  const zero = parseErrors(chart('bar', '  row "r" a=1\n'));
  assert.match(zero[0].message, /takes 1 or more series\. Found 0/);
  assert.match(parseErrors(chart('dumbbell', '  series a "a"\n  row "r" a=1\n'))[0].message, /takes 2 series\. Found 1/);
});
