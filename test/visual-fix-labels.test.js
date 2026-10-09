// 시각 수정: 끝 이름. 계열이 많거나 이름이 길어도 겹치지 않고, 안내선이 끝 점과 이름을 잇고, 움직이는 끝 점에서 모든 표식이 함께 움직인다.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { markedElements } from '../src/chart/frames.js';
import { frameSet } from '../src/chart/frames.js';
import { COPY } from '../src/chart/copy.js';
import { drawChart } from '../src/chart/draw.js';
import { placeEndLabels } from '../src/chart/end-labels.js';
import { figureOf, pointRows, sampleRows, seriesOf } from './chart-v2-fixture.js';

const longNames = (count) => Array.from({ length: count }, (_, i) => [`s${i}`, `서비스 운영 지표 ${i}`]);
// 값 y를 그대로 끝 점 높이 순서로 쓰는 선 차트: 계열 i의 두 점은 (1, i)와 (2, i)다.
const spread = (count, series = longNames(count)) => figureOf('line', { series, rows: [1, 2].map((x) => ({ values: { x, ...Object.fromEntries(series.map(([id], i) => [id, i])) } })) });

const rectsOf = (body, className) => [...body.matchAll(new RegExp(`<rect x="([-\\d.]+)" y="([-\\d.]+)" width="([-\\d.]+)" height="([-\\d.]+)" class="${className}"`, 'g'))].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const pairsOverlapping = (rects) => rects.flatMap((a, i) => rects.slice(i + 1).filter((b) => overlaps(a, b)));
const gridRange = (body) => {
  const ys = [...body.matchAll(/<line x1="[-\d.]+" x2="[-\d.]+" y1="([-\d.]+)" y2="[-\d.]+" class="chart-grid"/g)].map((m) => +m[1]);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
};
const leaders = (body) => [...body.matchAll(/<path d="(M [-\d.]+ [-\d.]+(?: H [-\d.]+ L [-\d.]+ [-\d.]+)?)" fill="none"[^>]*class="chart-leader"([^>]*)>/g)].map((m) => ({ d: m[1], hidden: m[2].includes('visibility="hidden"'), nums: m[1].match(/-?\d+(?:\.\d+)?/g).map(Number) }));

test('forty series with long Korean names never overlap and every label sits inside a plot that grew', () => {
  const small = drawChart(spread(2, longNames(2)));
  const wide = drawChart(spread(40));
  const boxes = rectsOf(wide.body, 'chart-text-bg');
  assert.equal(boxes.length, 40);
  assert.deepEqual(pairsOverlapping(boxes), [], '겹치는 이름 상자가 없다');
  const { top, bottom } = gridRange(wide.body);
  for (const box of boxes) assert.ok(box.y >= top - 1 && box.y + box.h <= bottom + 1, `영역 밖: ${JSON.stringify(box)} ${top}..${bottom}`);
  assert.ok(wide.height > small.height + 300, '그림 영역이 이름이 들어가게 자란다');
  assert.ok(wide.body.includes('서비스 운영 지표 39'), '이름을 줄이거나 숨기지 않는다');
});

test('forty series also place at the narrow chart width without overlap', () => {
  const figure = spread(40);
  figure.chart.layout = { width: 272 };
  const { body, width } = drawChart(figure);
  assert.equal(width, 272);
  assert.deepEqual(pairsOverlapping(rectsOf(body, 'chart-text-bg')), []);
});

test('the placement keeps the order of the end points, uses no arbitrary cap and is deterministic', () => {
  const boxes = [0, 1, 2, 3].map((i) => ({ i, lines: ['x'], height: 15, width: 40 }));
  const anchors = new Map([[0, 100], [1, 101], [2, 102], [3, 103]]);
  const a = placeEndLabels(boxes, anchors, { top: 0, bottom: 400 });
  const b = placeEndLabels(boxes, anchors, { top: 0, bottom: 400 });
  assert.deepEqual(a, b);
  const tops = a.map((box) => box.top);
  assert.deepEqual(tops, [...tops].sort((x, y) => x - y), '끝 점 순서와 이름 순서가 같다');
  for (let k = 1; k < tops.length; k++) assert.ok(tops[k] >= tops[k - 1] + 15, '틈이 이름 높이 이상이다');
  const centre = a.reduce((sum, box) => sum + box.cy, 0) / 4;
  assert.ok(Math.abs(centre - 101.5) < 1e-9, '제곱 거리가 가장 작은 자리라 묶음의 가운데가 끝 점들의 가운데다');
});

test('the twelve series fixture gives every displaced label a visible leader and hides the leader of a label at zero distance', () => {
  const figure = spread(12, Array.from({ length: 12 }, (_, i) => [`s${i}`, `계열 ${String.fromCharCode(65 + i)}`]));
  const { body } = drawChart(figure);
  const lines = leaders(body);
  assert.equal(lines.length, 12);
  for (const line of lines) {
    const [sx, sy, , ex, ey] = line.nums.length === 5 ? [line.nums[0], line.nums[1], line.nums[2], line.nums[3], line.nums[4]] : [line.nums[0], line.nums[1], 0, line.nums[0], line.nums[1]];
    const displaced = Math.abs(ey - sy) > 0.5 || sx < ex - 14;
    assert.equal(line.hidden, !displaced, `안내선 ${line.d}`);
  }
  assert.ok(lines.some((line) => !line.hidden), '밀린 이름의 안내선이 보인다');
});

test('the leader stroke is the family border at one thin weight for every series', () => {
  const { body } = drawChart(spread(5));
  const tags = body.match(/<path d="M [^"]*" fill="none" stroke="[^"]+" stroke-width="[\d.]+" class="chart-leader"/g);
  assert.equal(tags.length, 5);
  assert.deepEqual([...new Set(tags.map((tag) => tag.match(/stroke-width="([\d.]+)"/)[1]))], ['1'], '굵기는 모든 계열이 같다');
});

test('three ecdf series that all end at one are ordered by series number and keep distinct leaders', () => {
  const series = [['a', '가'], ['b', '나'], ['c', '다']];
  const figure = figureOf('ecdf', { series, rows: sampleRows([[1, 'a'], [2, 'a'], [1, 'b'], [2, 'b'], [1, 'c'], [2, 'c']]) });
  const { body } = drawChart(figure);
  const tops = rectsOf(body, 'chart-text-bg').map((box) => box.y);
  assert.deepEqual(tops, [...tops].sort((a, b) => a - b), '계열 번호 순서로 쌓인다');
  assert.equal(new Set(leaders(body).map((line) => line.d)).size, 3, '안내선은 이름마다 다르다');
});

test('a series with no value keeps its label with the no-data text and has no visible leader', () => {
  const series = [['a', '가'], ['b', '나']];
  const figure = figureOf('line', { series, rows: [{ values: { x: 1, a: 3, b: null } }, { values: { x: 2, a: 5, b: null } }] });
  const { body } = drawChart(figure);
  const labels = [...body.matchAll(/class="chart-end-label"[^>]*>([^<]*)</g)].map((m) => m[1]).join(' ');
  assert.ok(labels.includes('나') && labels.includes(COPY.noData), `값 없음을 이름 곁에 밝힌다: ${labels}`);
  const [first, second] = leaders(body);
  assert.equal(first.hidden, false);
  assert.equal(second.hidden, true, '끝 점이 없으면 안내선이 숨는다');
  assert.equal((body.match(/class="dot"/g) ?? []).length, 2, '값이 없는 계열은 점을 그리지 않는다(0으로 그리지 않는다)');
});

test('a label with several lines is one text per line with no tspan', () => {
  const figure = spread(3, [['s0', '아주 긴 서비스 운영 지표 이름이 두 줄 이상으로 나뉘어 적힌다 하나'], ['s1', '짧음'], ['s2', '또 다른 긴 이름 지표 하나 둘 셋 넷 다섯']]);
  const { body } = drawChart(figure);
  assert.doesNotMatch(body, /<tspan/);
  assert.ok((body.match(/class="chart-end-label"/g) ?? []).length > 3, '줄마다 글이 하나다');
});

const HEAD = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue q "q" on=db from=0\n';
const MOVING = `${HEAD}chart c "움직이는 끝" line {\n  series s0 "지연 A"\n  series s1 "지연 B"\n  series s2 "지연 C"\n  point x=1 s0=2 s1=5 s2=8\n  point x=2 s0=q s1=6 s2=9\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+10"\n  a -> db "x" time=500ms set="q+5"\n`;

test('a bound last point moves the text, the background and the leader together in every frame and none of them pulses', async () => {
  const result = await buildFigure(MOVING);
  const { frames, marks } = result.scene.chartFrames.c;
  assert.ok(frames.length >= 3, '처음, 첫 도착, 마지막 도착');
  const ids = marks.map((m) => m.id);
  for (const id of ['s0:end.t0', 's0:end.b', 's0:end.l']) assert.ok(ids.includes(id), `${id}가 프레임마다 바뀐다`);
  for (let f = 1; f < frames.length; f++) {
    const [text, back, line] = ['s0:end.t0', 's0:end.b', 's0:end.l'].map((id) => frames[f][id].attrs);
    const [text0, back0, line0] = ['s0:end.t0', 's0:end.b', 's0:end.l'].map((id) => frames[f - 1][id].attrs);
    const moved = [text.y !== text0.y, back.y !== back0.y, line.d !== line0.d];
    assert.deepEqual(moved, [true, true, true], `프레임 ${f}: 글, 바탕, 안내선이 함께 바뀐다`);
  }
  assert.deepEqual(result.timeline.charts.c.rows.flatMap((row) => row.periods.flatMap((p) => p[3])).filter((id) => id.includes(':end')), [], '끝 이름은 강조하지 않는다');
});

test('a hand built frame pair whose text children differ is refused with the mark name', () => {
  const frame = (y) => `<g><text data-mark-text="x:end.t" x="1" y="2"><tspan x="1" y="${y}">가</tspan></text></g>`;
  assert.throws(() => frameSet([frame(10), frame(20)]), /chart mark "x:end\.t" holds child elements that differ in frame 1/);
  assert.doesNotThrow(() => frameSet([frame(10), frame(10)]));
  assert.equal(markedElements(frame(10))[0].children, '<tspan x="1" y="10">가</tspan>');
});

test('a scatter point cannot bind a value, so its name text and tspans can never move between frames', async () => {
  const source = `${HEAD}chart c "산점" scatter {\n  x "가로"\n  y "세로"\n  series p "팀"\n  point "하나" x=q y=3 series=p\n  point "둘" x=8 y=9 series=p\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\n`;
  await assert.rejects(() => buildFigure(source), /horizontal position takes numbers, not values/);
});

test('every series label is present in the glyph set of every frame', async () => {
  const result = await buildFigure(MOVING);
  const item = result.scene.items.find((it) => it.id === 'c');
  for (const name of ['지연 A', '지연 B', '지연 C']) for (const ch of name.replace(/\s/g, '')) assert.ok(item.chart.text.includes(ch), ch);
});

test('series helper keeps its shape', () => {
  assert.equal(seriesOf([['a', 'A']])[0].id, 'a');
});
