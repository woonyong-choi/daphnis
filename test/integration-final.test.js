// 통합 마무리: 실제 daphnis 2 원본을 컴파일러(buildFigure)와 두 출력(움직이는 SVG, 재생기 HTML)에 통과시켜 잰다. 정규 입력을 직접 만든 시험이 아니다.
// 값에 묶인 차트의 프레임(0에서 양수가 되는 도넛, 부호 있는 누적, 퍼센트, 계단, 결측이 있는 선과 기대값, 누적분포, 8계열 이상의 무늬), 공유 무늬 정의와 문서 id,
// 입력 데이터 표, 색 이름 표, 도형 상태 알약의 모든 그림, 순서 보기의 인터페이스 표시, 정본이 아닌 이동의 거부, 시간표 marks를 본다. 브라우저에서 도는 것은 integration-final-player.test.js가 잰다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hopLegs } from '../src/animate/legs.js';
import { buildFigure } from '../src/build.js';
import { extentOf } from '../src/chart-frames.js';
import { categoryPaint } from '../src/chart-palette.js';
import { statusBoxes } from '../src/draw/status.js';
import { toHtml } from '../src/html.js';
import { FLOW_METRICS } from '../src/html/metrics.js';
import { patternDefs } from '../src/styles.js';
import { toSvg } from '../src/svg.js';
import { TONES, TONE_FILLS, TONE_INKS, TONE_OUTLINES } from '../src/tone.js';

// 값 q, r를 카드 db에 놓고 두 번 도착으로 바꾼다. 차트는 두 값을 읽는다.
const HEAD = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue q "q" on=db from=0\nvalue r "r" on=db from=5\n';
const FLOW = (set1 = 'q+10', set2 = 'r+3') => `a -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="${set1}"\n  a -> db "x" time=500ms set="${set2}"\n`;
const views = (ids, plots = []) => `view g graph right "g" {\n${ids.map((id) => `  ${id}`).join('\n')}\n}\n${plots.map((id) => `view p-${id} plot "p ${id}" {\n  ${id}\n}\n`).join('')}`;
const series = (n, label = '계열') => Array.from({ length: n }, (_, i) => `  series s${i} "${label} ${i}"`).join('\n');
const SOURCES = {
  donut: HEAD + `chart c "도넛" donut {\n  row "A" value=q\n  row "B" value=10\n  row "C" value=r\n}\n${views(['a', 'db', 'c'], ['c'])}` + FLOW('q+20'),
  signed: HEAD + `chart c "부호 누적" stacked {\n${series(3)}\n  row "R1" s0=q s1=-4 s2=3\n  row "R2" s0=2 s1=r s2=-6\n}\n${views(['a', 'db', 'c'])}` + FLOW('q+12', 'r-9'),
  percent: HEAD + `chart c "퍼센트" percent {\n${series(3)}\n  row "R1" s0=q s1=20 s2=10\n  row "R2" s0=0 s1=r s2=0\n  row "R3" s0=- s1=3 s2=4\n}\n${views(['a', 'db', 'c'])}` + FLOW('q+30', 'r+40'),
  step: HEAD + `chart c "계단" step {\n${series(2)}\n  point x=1 s0=q s1=3\n  point x=2 s0=- s1=r\n  point x=3 s0=5 s1=2\n}\n${views(['a', 'db', 'c'])}` + FLOW('q+8', 'r+3'),
  line: HEAD + `chart c "선" line {\n  series s0 "측정" role=main\n  series s1 "기대" role=reference\n  point x=1 s0=q s1=4\n  point x=2 s0=- s1=4\n  point x=3 s0=r s1=4\n}\n${views(['a', 'db', 'c'])}` + FLOW('q+8', 'r+3'),
  ecdf: HEAD + `chart c "누적분포" ecdf {\n  series g0 "가"\n  series g1 "나"\n  sample 1 series=g0\n  sample 1 series=g0\n  sample 3 series=g0\n  sample - series=g0\n  sample 5 series=g1\n  sample 2 series=g1\n}\n${views(['a', 'db', 'c'])}` + FLOW(),
  bar12: HEAD + `chart c "열두 계열" bar {\n${series(12)}\n  row "R" ${Array.from({ length: 12 }, (_, i) => `s${i}=${i === 0 ? 'q' : i + 1}`).join(' ')}\n}\n${views(['a', 'db', 'c'], ['c'])}` + FLOW('q+4'),
  twoCharts: HEAD + `chart c1 "차트 하나" bar {\n  series s "지연"\n  row "now" s=q\n  row "max" s=9\n}\nchart c2 "차트 둘" stacked {\n  series g0 "가"\n  series g1 "나"\n  row "now" g0=r g1=2\n}\n${views(['a', 'db', 'c1', 'c2'], ['c1', 'c2'])}` + FLOW('q+4', 'r+4'),
  // 계열 22개의 선. 14번 계열은 마름모, 21번 계열은 삼각형 꼭짓점(층 2와 3)이고 둘 다 값에 묶여 바뀐다.
  shapes: HEAD + `chart c "모양" line {\n${series(22)}\n  point x=1 ${Array.from({ length: 22 }, (_, i) => `s${i}=${i === 14 ? 'q' : i === 19 ? 'r' : i + 1}`).join(' ')}\n  point x=2 ${Array.from({ length: 22 }, (_, i) => `s${i}=${i + 2}`).join(' ')}\n}\n${views(['a', 'db', 'c'])}` + FLOW('q+9', 'r+9'),
};

const built = new Map();
const compile = async (name) => {
  if (!built.has(name)) built.set(name, await buildFigure(SOURCES[name]));
  return built.get(name);
};
const changedLists = (result, id) => result.timeline.charts[id].rows[0].periods.map(([, , , changed]) => changed);
const idsOf = (html) => [...html.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

// ---- 값에 묶인 차트의 프레임: 실제 원본에서 구조가 같고 원자료가 바뀐 표식만 강조 ----

test('a donut slice that grows from zero keeps the frame structure and only its own marks are changed', async () => {
  const result = await compile('donut');
  const { frames, marks } = result.scene.chartFrames.c;
  assert.equal(frames.length, 3);
  for (const frame of frames) assert.deepEqual(Object.keys(frame), marks.map((m) => m.id), '모든 프레임이 같은 표식을 같은 순서로 가진다');
  assert.deepEqual(changedLists(result, 'c'), [[], ['*:0', '*:0.d', '*:total.t'], ['*:2', '*:2.d', '*:total.t']], '각도가 밀린 다른 조각은 조용히 옮겨지고 강조하지 않는다');
  assert.ok(!frames[0]['*:0'].attrs.d.includes('A'), '0인 조각은 한 점짜리 빈 경로');
  assert.ok(frames[1]['*:0'].attrs.d.includes('A'));
  assert.ok(frames[2]['*:0'].attrs.d.includes('A'));
});

test('a signed stacked chart fixes one axis over the positive and the negative totals of every frame', async () => {
  const result = await compile('signed');
  const card = result.figure.nodes.find((n) => n.id === 'c');
  // q는 0 또는 12, r는 5 또는 -4. 양수 합은 q=12에서 12+3=15, 음수 합은 r=-4에서 -6+-4=-10.
  assert.deepEqual(extentOf(card, result.figure, result.valueTexts), { min: -10, max: 15 });
  const { frames } = result.scene.chartFrames.c;
  assert.equal(frames.length, 3);
  assert.deepEqual(changedLists(result, 'c'), [[], ['s0:0', 's0:0.b'], ['s1:1', 's1:1.b']]);
});

test('a percent chart fixes 0 to 100 and a row with a missing value or a zero sum stays in place', async () => {
  const result = await compile('percent');
  const card = result.figure.nodes.find((n) => n.id === 'c');
  assert.deepEqual(extentOf(card, result.figure, result.valueTexts), { min: 0, max: 100 });
  const { frames } = result.scene.chartFrames.c;
  assert.equal(frames.length, 3);
  const [first, , third] = changedLists(result, 'c').slice(0, 3);
  assert.deepEqual(first, []);
  assert.ok(third.includes('s1:1') && !third.includes('s0:0'), '값이 바뀐 계열 조각만 강조하고 몫이 밀린 다른 조각은 강조하지 않는다');
});

test('step and line with a missing value and a reference series keep the same marks and change only the bound points', async () => {
  for (const name of ['step', 'line']) {
    const result = await compile(name);
    const { frames, marks } = result.scene.chartFrames.c;
    assert.equal(frames.length, 3, name);
    for (const frame of frames) assert.deepEqual(Object.keys(frame), marks.map((m) => m.id), name);
  }
  assert.deepEqual(changedLists(await compile('step'), 'c'), [[], ['s0:0'], ['s1:1']]);
  assert.deepEqual(changedLists(await compile('line'), 'c'), [[], ['s0:0'], ['s0:2']], '기대값 계열은 값이 그대로라 강조가 없다');
  const line = await compile('line');
  const body = line.scene.items.find((it) => it.id === 'c').chart.body;
  assert.match(body, /chart-dashed/, '기대값 선은 점선이다');
});

test('an ecdf chart compiles with ties and missing samples and fixes its axis from 0 to 1', async () => {
  const result = await compile('ecdf');
  assert.deepEqual(Object.keys(result.scene.chartFrames), [], '표본은 값에 묶이지 않으니 프레임이 없다');
  const body = result.scene.items.find((it) => it.id === 'c').chart.body;
  assert.match(body, /결측|빠진|제외/, '빠진 표본을 알리는 줄이 있다');
});

test('twelve series draw a pattern from the eighth series on and the HTML carries each pattern definition once', async () => {
  const result = await compile('bar12');
  const html = await toHtml(result, 'x');
  const ids = idsOf(html);
  const patterns = ids.filter((id) => id.startsWith('dp-pat-'));
  assert.ok(patterns.length >= 1, '무늬 정의가 있다');
  assert.equal(new Set(ids).size, ids.length, `문서 id가 겹친다: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  const used = [...html.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(used.some((id) => id.startsWith('dp-pat-')));
  for (const id of used) assert.ok(ids.includes(id), `url(#${id})이 가리키는 정의가 문서에 있다`);
  assert.equal(html.split('<defs>').length - 1, html.split('<defs>').length - 1);
  assert.equal([...html.matchAll(/<svg class="dp-defs"/g)].length, 1, '정의는 보이지 않는 SVG 하나에만 있다');
});

test('the same pattern id in two charts and panels is defined once and different content under one id is refused', async () => {
  const result = await compile('bar12');
  const drawn = result.scene.items.find((it) => it.id === 'c').chart;
  assert.ok(drawn.defs.length > 0);
  assert.equal(patternDefs([drawn, drawn]), patternDefs([drawn]), '같은 정의를 여러 번 받아도 한 번이다');
  const forged = { defs: drawn.defs.replace('</pattern>', '<g/></pattern>') };
  assert.notEqual(forged.defs, drawn.defs);
  assert.throws(() => patternDefs([drawn, forged]), /two different definitions/);
});

test('an html with two charts in graph and plot panels has unique ids and every url reference resolves', async () => {
  const result = await compile('twoCharts');
  const html = await toHtml(result, 'x');
  const ids = idsOf(html);
  assert.equal(new Set(ids).size, ids.length, `겹치는 id: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  for (const [, id] of html.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(id), id);
});

test('the svg carries the pattern definitions of every chart once', async () => {
  const svg = await toSvg(await compile('bar12'), { scene: 0 });
  const ids = [...svg.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 1);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of svg.matchAll(/url\(#(dp-pat-[^)]+)\)/g)) assert.ok(ids.includes(id), id);
});

// ---- 갱신 효과: 계열 안의 색, SVG와 HTML이 같은 겹침 ----

const overlaysOf = (markup) => [...markup.matchAll(/<(rect|circle|path|line|text)\b[^>]*\sdata-pulse-of="([^"]+)"[^>]*>/g)].map((m) => ({ tag: m[1], id: m[2], open: m[0], style: /style="([^"]*)"/.exec(m[0])?.[1] }));

test('a changed mark pulses with its own family effect step in the svg and the html, never the state blue', async () => {
  const result = await compile('twoCharts');
  const svg = await toSvg(result, { scene: 0 });
  const html = await toHtml(result, 'x');
  const fromSvg = overlaysOf(svg);
  const fromHtml = overlaysOf(html.replace(/<template[\s\S]*?<\/template>/g, ''));
  assert.ok(fromSvg.length > 0 && fromHtml.length > 0);
  // 표식은 자기 범주 계열의 effect 단계 하나만 쓴다. 면(옅게), 고리, 선, 글 후광이 모두 같은 번호의 같은 색이고 tint나 outline이나 상태 색은 없다.
  for (const overlay of [...fromSvg, ...fromHtml]) {
    assert.ok(!/state-active|category-tint|category-outline/.test(overlay.open + overlay.style), '상태 파랑이나 옛 단계를 쓰지 않는다');
    const numbers = [...new Set([...overlay.style.matchAll(/category-effect-(\d+)/g)].map((m) => m[1]))];
    assert.equal(numbers.length, 1, overlay.style);
    // 고리의 굵기는 표식 자신의 굵기이고 커지지 않는다. 면은 옅다(opacity.halo).
    if (overlay.tag !== 'text' && !/stroke:none/.test(overlay.style) && !/fill:none/.test(overlay.style)) {
      assert.match(overlay.style, /fill-opacity:0\.2;stroke:var\(--color-data-category-effect-\d+\);stroke-width:1\.5/, overlay.style);
    }
  }
  const ids = (list) => [...new Set(list.map((o) => `${o.tag}:${o.id}`))].sort();
  const styleOf = (list, key) => list.find((o) => `${o.tag}:${o.id}` === key).style;
  for (const key of ids(fromHtml)) {
    if (ids(fromSvg).includes(key)) assert.equal(styleOf(fromHtml, key), styleOf(fromSvg, key), `${key}: 두 출력이 같은 칠`);
  }
  assert.ok(!/\[data-pulse\]|--pulse/.test(html), '옛 파랑 후광 규칙이 없다');
});

test('a yellow family mark pulses with the yellow effect step and diamond and triangle marks get a path overlay', async () => {
  const yellow = categoryPaint(1);
  const result = await buildFigure(HEAD + `chart c "노랑" bar {\n  series s0 "하나"\n  series s1 "둘"\n  row "R" s0=2 s1=q\n}\n${views(['a', 'db', 'c'])}` + FLOW('q+7'));
  const html = await toHtml(result, 'x');
  const yellowOverlay = overlaysOf(html).find((o) => o.id === 's1:0' && o.tag === 'rect');
  assert.ok(yellowOverlay.style.includes(`fill:${yellow.effect}`) && yellowOverlay.style.includes(`stroke:${yellow.effect}`) && !yellowOverlay.style.includes(yellow.tint), yellowOverlay.style);
  const shapes = await compile('shapes');
  const svg = await toSvg(shapes, { scene: 0 });
  const bodies = [svg, await toHtml(shapes, 'x')];
  for (const markup of bodies) {
    const found = overlaysOf(markup).filter((o) => o.tag === 'path');
    const diamond = found.find((o) => o.id === 's14:0');
    const triangle = found.find((o) => o.id === 's19:0');
    assert.ok(diamond && triangle, '마름모와 삼각형 표식도 같은 겹침을 받는다');
    assert.ok(diamond.style.includes(categoryPaint(14).effect) && triangle.style.includes(categoryPaint(19).effect));
    assert.ok(diamond.open.includes(' d="M '), '겹침은 표식의 경로를 따른다');
  }
});

// ---- 입력 데이터 표 ----

const tablesOf = async (name) => {
  const html = await toHtml(await compile(name), 'x');
  return [...html.matchAll(/<details class="fl-data">[\s\S]*?<\/details>/g)].map((m) => m[0]);
};

test('data tables carry the chart title in the summary and the region name so two charts can be told apart', async () => {
  const [one, two] = await tablesOf('twoCharts');
  assert.match(one, /<summary>차트 하나 입력 데이터<\/summary>/);
  assert.match(two, /<summary>차트 둘 입력 데이터<\/summary>/);
  assert.match(one, /aria-label="차트 하나 입력 데이터 표"/);
  assert.match(two, /aria-label="차트 둘 입력 데이터 표"/);
  assert.notEqual(one.match(/<summary>.*?<\/summary>/)[0], two.match(/<summary>.*?<\/summary>/)[0]);
});

test('the step table has the x column and the ecdf and percent tables read their own columns', async () => {
  const [step] = await tablesOf('step');
  assert.match(step, /<th scope="col">x<\/th><th scope="col">계열 0<\/th><th scope="col">계열 1<\/th>/);
  assert.match(step, /<th scope="row">2<\/th><td>값 없음<\/td>/, '결측은 값 없음');
  assert.match(step, /q \(시작 0\)/, '값에 묶인 칸은 값 이름과 시작 값');
  const [ecdf] = await tablesOf('ecdf');
  assert.match(ecdf, /<th scope="col">관측 순서<\/th><th scope="col">관측값<\/th><th scope="col">계열<\/th>/);
  assert.doesNotMatch(ecdf, /해당 없음/, '표본 행이 항목 열로 떨어지지 않는다');
  assert.match(ecdf, /<td>2 \/ 3<\/td><td data-value="0\.666[0-9]*">66\.7%<\/td>/, '[1,1,3]에서 값 1 이하는 3개 중 2개');
  assert.match(ecdf, /<th scope="row">나<\/th><td>5<\/td><td>2 \/ 2<\/td>/);
  assert.match(ecdf, /빠진 값은 세지 않았습니다: 가 1개, 나 0개/);
  const [percent] = await tablesOf('percent');
  // 이 퍼센트 원본은 값(q, r)에 묶은 칸이 있어 표가 시작 값이다. 계산 열과 표 이름과 안내 글이 그렇게 말한다.
  assert.match(percent, /<th scope="col">행 합계\(계산, 시작 값\)<\/th>/);
  assert.match(percent, /<caption>[^<]*입력값 · 묶인 값은 시작 값<\/caption>/);
  assert.match(percent, /재생 중 바뀌는 값은 차트와 값 카드에 나타납니다\./);
  assert.match(percent, /값 없음 \(비율 정의 불가\)/, '결측이 있는 행은 비율이 정의되지 않는다');
});

test('a table of a chart with no bound cell is the current input and makes no start-value claim', async () => {
  const result = await buildFigure('daphnis 2\nchart c "고정" percent {\n  series a "가"\n  series b "나"\n  row "행" a=3 b=1\n}\nview v plot "p" {\n  c\n}\n');
  const html = await toHtml(result, 'x');
  assert.doesNotMatch(html, /시작 값|바뀌는 값은 차트와 값 카드/);
  assert.match(html, /<th scope="col">행 합계\(계산\)<\/th>/);
});

// ---- 색 이름 표 ----

test('the player metrics read the canonical tone tables and every palette family has a fill, an ink and an outline name', () => {
  assert.deepEqual(FLOW_METRICS.tones, TONE_FILLS);
  assert.deepEqual(FLOW_METRICS.toneInks, TONE_INKS);
  assert.deepEqual(FLOW_METRICS.toneOutlines, TONE_OUTLINES);
  assert.deepEqual(Object.keys(TONE_FILLS), TONES);
  for (const family of TONES.filter((tone) => tone !== 'gray')) assert.ok(TONE_OUTLINES[family], family);
  assert.ok(!('brand' in TONE_FILLS) && !('amber' in TONE_FILLS));
});

// ---- 도형 상태 알약: 논리 카드의 모든 그림에 ----

const TWO_GRAPHS = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nview v1 graph right "하나" {\n  a\n  b\n}\nview v2 graph down "둘" {\n  a\n  b\n}\nscene "정상" mode=static status="b=ok"\n  a -> b time=300ms\n';

test('a status pill is drawn on every drawn instance of the logical card with one logical state', async () => {
  const result = await buildFigure(TWO_GRAPHS);
  assert.equal(result.scene.items.filter((it) => it.id === 'b').length, 2);
  const boxes = statusBoxes(result.scene, result.timeline);
  assert.equal(boxes.length, 2, '두 그래프 보기의 b마다 알약');
  assert.notDeepEqual([boxes[0].x, boxes[0].y], [boxes[1].x, boxes[1].y]);
  const svg = await toSvg(result, { scene: 0 });
  const html = await toHtml(result, 'x');
  const pillsOf = (markup) => [...markup.matchAll(/class="fl-status" data-st="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(pillsOf(svg).length, 2);
  assert.equal(new Set(pillsOf(svg)).size, 2, '움직이는 SVG는 도형마다 다른 이름');
  assert.deepEqual(pillsOf(html.replace(/<template[\s\S]*?<\/template>/g, '')), ['b-ok', 'b-ok'], '재생기는 논리 이름 하나를 두 그림이 함께 켠다');
});

// ---- 순서 보기: 인터페이스 표시 ----

test('an interface drawn as a sequence participant keeps its stereotype above the common header', async () => {
  const source = ['daphnis 2', 'class order "Order" {', '  field id "UUID" visibility=private', '}', 'interface repo "Repository" {', '  method find "(id: UUID): T"', '}', 'order -> repo relation=realization', 'view g graph right "구조" {', '  order', '  repo', '}', 'view s sequence "순서" {', '  order', '  repo', '}', 'scene "s" mode=once', '  order -> repo "find" time=300ms', ''].join('\n');
  const result = await buildFigure(source);
  const headers = result.scene.items.filter((it) => it.headerOnly);
  assert.deepEqual(headers.map((it) => [it.id, it.stereotype]), [['order', undefined], ['repo', '«interface»']]);
  const repo = headers.find((it) => it.id === 'repo');
  assert.ok(repo.h > headers.find((it) => it.id === 'order').h, '표시 줄만큼 높다');
  const svg = await toSvg(result, { isStatic: true });
  assert.equal([...svg.matchAll(/classifier-text meta[^>]*>«interface»/g)].length + [...svg.matchAll(/«interface»<\/text>/g)].length >= 2, true, '그래프 카드와 순서 머리에 모두 있다');
});

test('a graph and a sequence mix an api, a table and a box: the api and the table are header-only participants and the document plays', async () => {
  const source = ['daphnis 2', 'box web "웹"', 'api orders "POST /orders" {', '  id int', '}', 'table rows "주문" {', '  id int pk', '}', 'value n "건수" on=web from=0', 'view g graph right "구조" {', '  web', '  orders', '  rows', '}', 'view s sequence "호출" {', '  web', '  orders', '  rows', '}', 'web -> orders', 'orders -> rows', 'scene "주문" mode=once', '  web -> orders "요청" time=400ms set="n+1"', '  orders -> rows "저장" time=400ms', ''].join('\n');
  const result = await buildFigure(source);
  assert.deepEqual(result.scene.items.filter((it) => it.headerOnly).map((it) => it.id), ['orders', 'rows'], 'api와 표만 머리만 보이고, 상자는 평소 크기다');
  assert.deepEqual(result.scene.panels.map((p) => p.strategy), ['graph', 'sequence']);
  const html = await toHtml(result, 'x');
  const ids = idsOf(html);
  assert.equal(new Set(ids).size, ids.length, '문서 id가 유일');
  const svg = await toSvg(result, { scene: 0 });
  // 움직이는 SVG는 마지막 모습 층(`.fl-still`)을 한 벌 더 싣는다. 보기 수는 움직임 층에서 센다.
  assert.equal([...svg.split('class="fl-still"')[0].matchAll(/data-id="orders"/g)].length, 2, 'api 카드는 두 보기에 그려진다');
});

// ---- 정본이 아닌 이동과 시간표 marks ----

test('a hop that is not canonical is refused instead of approximated', () => {
  const ok = { track: 0, legEdges: [3, 4], gaps: [[0.4, 0.6]], ms: 1000 };
  assert.deepEqual(hopLegs(ok).map((leg) => leg.edge), [3, 4]);
  assert.deepEqual(hopLegs({ edge: 2, ms: 500 }).map((leg) => leg.edge), [2]);
  assert.throws(() => hopLegs({ track: 0, edges: [3, 4], ms: 1000 }), /not canonical/, 'legEdges 없이 edges만 있는 점');
  assert.throws(() => hopLegs({ track: 0, legEdges: [3, 4], gaps: [], ms: 1000 }), /not canonical/);
  assert.throws(() => hopLegs({ ms: 500 }), /not canonical/, '선 번호가 없는 이동');
  assert.throws(() => hopLegs({ edge: 1.5, ms: 500 }), /not canonical/);
  assert.throws(() => hopLegs({ edge: 1, ms: 0 }), /not canonical/);
});

test('the timeline marks hold no per-move entries, so no key names an undefined edge', async () => {
  const flow = await buildFigure(['daphnis 2', 'box a "A"', 'box b "B"', 'box c "C"', 'a -> b', 'b -> c', 'scene "s" mode=once', '  track a -> b -> c time=2s', ''].join('\n'));
  const beat = await compile('donut');
  for (const marks of [flow.timeline.marks, beat.timeline.marks]) {
    for (const key of Object.keys(marks)) assert.match(key, /^(edge:\d+|node:[^:]+|part:.+|chart:[^:]+:.+)$/, key);
    assert.ok(!JSON.stringify(marks).includes('undefined'));
  }
});
