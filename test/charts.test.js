// 차트 열여섯 종류: 독립 최소 원본으로 그림의 뜻(길이 비례, 부호, 비율 글자, 위치 순서)을 읽고, 종류마다 거절해야 하는 입력을 확인한다.
// 값에 묶인 차트는 정적 행과 같은 값 규칙을 받는다(#171). 시험 이름 첫 낱말(K1~K9, C1~C5)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reflowFigure } from '../src/build.js';
import { DOT, PAD } from '../src/chart/metrics.js';
import { measure } from '../src/measure/fonts.js';
import { values } from '../src/tokens.js';
import { build, dap, descendants, finalValue, findAll, lineOf, num, parseMarkup, reject, stillDom, textContent, textsOf, toHtml, toSvg, visibleTexts } from './support.js';

const chart = (kind, body, head = 'x "x(u)"\n  y "y(u)"') => dap(`chart c "T-${kind}" ${kind} {\n  ${head}\n${body.split('\n').map((l) => `  ${l.trim()}`).join('\n')}\n}\n`);

/** 범주 색으로 칠한 막대·조각 사각형(범례 표식인 정사각형은 뺀다). */
const marks = (dom) => findAll(dom, (n) => n.tag === 'rect' && /^var\(--color-data-category-(outline-)?\d+\)$/.test(n.attrs.fill ?? '') && num(n, 'width') !== num(n, 'height'));

const ratio = (a, b) => a / b;
const near = (actual, expected, message, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) < tolerance * Math.abs(expected) + 0.01, `${message}: ${actual} vs ${expected}`);

const KINDS = {
  bar: { rows: 'series v "v"\nrow "A" v=40\nrow "B" v=20', words: ['A', 'B', '40', '20'] },
  stacked: { rows: 'series p "p"\nseries q "q"\nrow "A" p=30 q=10\nrow "B" p=5 q=15', words: ['A', 'B', '+ 2: 10 = 40'] },
  percent: { rows: 'series p "p"\nseries q "q"\nrow "A" p=30 q=10\nrow "B" p=5 q=15', words: ['1: 75.0% (30)', '2: 25.0% (10)', '1: 25.0% (5)'] },
  dumbbell: { rows: 'series a "a" role=compare\nseries b "b" role=main\nrow "A" a=10 b=30\nrow "B" a=20 b=15', words: ['+200%', '−25%'] },
  difference: { rows: 'series d "d"\nrow "A" d=3 d.low=1 d.high=5\nrow "B" d=-2 d.low=-4 d.high=0', words: ['+3', '−2'] },
  line: { rows: 'series s "s"\npoint x=1 s=5\npoint x=2 s=9', words: ['s', 'x(u)', 'y(u)'] },
  step: { rows: 'series s "s"\npoint x=1 s=5\npoint x=2 s=9', words: ['s', 'x(u)', 'y(u)'] },
  area: { rows: 'series s "s"\npoint x=1 s=5\npoint x=2 s=9', words: ['s', 'x(u)', 'y(u)'] },
  scatter: { rows: 'point "P" x=1 y=2\npoint "Q" x=3 y=4', words: ['P', 'Q'] },
  histogram: { rows: 'bins 0 10 2\nsample 1\nsample 2\nsample 7', words: ['x(u)', 'y(u)'] },
  box: { rows: 'row "A" min=1 q1=2 median=3 q3=4 max=5', words: ['A', '중앙값 3'] },
  ecdf: { rows: 'sample 1\nsample 2\nsample 3', words: ['x(u)', 'y(u)'] },
  heatmap: { rows: 'cell "r1" "c1" 3\ncell "r1" "c2" 5\ncell "r2" "c1" 1\ncell "r2" "c2" 9', words: ['r1', 'r2', 'c1', 'c2', '3', '5', '1', '9'], head: '' },
  pie: { rows: 'row "A" value=30\nrow "B" value=70', words: ['30 · 30.0%', '70 · 70.0%'], head: '' },
  donut: { rows: 'row "A" value=30\nrow "B" value=70', words: ['30 · 30.0%', '70 · 70.0%'], head: '' },
  waterfall: { rows: 'row "up" value=5\nrow "down" value=-2\ntotal "sum"', words: ['0 + 5 = 5', '5 − 2 = 3', '= 3'], head: 'x "x(u)"' },
};

test('K1 each of the sixteen chart kinds builds from a minimal source, draws its title and its own reading of the numbers', async () => {
  assert.equal(Object.keys(KINDS).length, 16);
  for (const [kind, { rows, words, head }] of Object.entries(KINDS)) {
    const dom = await stillDom(chart(kind, rows, head));
    const texts = textsOf(dom);
    assert.ok(texts.includes(`T-${kind}`), `${kind}: title`);
    for (const word of words) assert.ok(texts.includes(word), `${kind}: "${word}" in ${JSON.stringify(texts)}`);
  }
});

test('K2 lengths are proportional to values: bar, stacked, percent and histogram', async () => {
  const bars = marks(await stillDom(chart('bar', KINDS.bar.rows))).map((m) => num(m, 'width'));
  near(ratio(bars[0], bars[1]), 2, 'bar 40:20');

  const stacked = marks(await stillDom(chart('stacked', KINDS.stacked.rows))).map((m) => num(m, 'width'));
  near(ratio(stacked[0], stacked[1]), 3, 'stacked 30:10');
  near(ratio(stacked[2], stacked[3]), 1 / 3, 'stacked 5:15');
  near(ratio(stacked[0], stacked[2]), 6, 'stacked 30:5 share one axis (segments lose a constant gap)', 0.1);

  const percent = marks(await stillDom(chart('percent', KINDS.percent.rows))).map((m) => num(m, 'width'));
  near(ratio(percent[0], percent[1]), 3, 'percent 75:25');
  near(ratio(percent[0] + percent[1], percent[2] + percent[3]), 1, 'every percent row spans the same 100%');

  const bins = marks(await stillDom(chart('histogram', KINDS.histogram.rows))).map((m) => num(m, 'height'));
  near(ratio(bins[0], bins[1]), 2, 'histogram counts 2:1 (samples 1, 2 | 7)');
});

test('K3 positions follow values: scatter orders points by x and y, a negative difference points left of zero', async () => {
  const dom = await stillDom(chart('scatter', KINDS.scatter.rows));
  const at = (label) => visibleTexts(dom).find((n) => textContent(n).trim() === label);
  assert.ok(num(at('Q'), 'x') > num(at('P'), 'x'), 'larger x is further right');
  assert.ok(num(at('Q'), 'y') < num(at('P'), 'y'), 'larger y is higher on the page');
  const gap = await stillDom(chart('difference', KINDS.difference.rows));
  const sign = (label) => num(visibleTexts(gap).find((n) => textContent(n).trim() === label), 'x');
  assert.ok(sign('−2') < sign('+3'), 'the negative difference sits left of the positive one');
});

test('K4 bar and stacked charts keep missing values distinct from zero', async () => {
  const bar = await stillDom(chart('bar', 'series v "v"\nrow "A" v=-\nrow "B" v=0\nrow "C" v=5\nmissing "none here"'));
  const texts = textsOf(bar);
  assert.ok(texts.includes('none here'), 'a missing bar says so');
  assert.equal(texts.filter((t) => t === '0').length >= 1, true, 'a zero bar keeps its value text');
  const [zero, ten] = marks(await stillDom(chart('bar', 'series v "v"\nrow "A" v=0\nrow "B" v=10'))).map((m) => num(m, 'width'));
  assert.ok(zero <= 3 && ten > 100, `a zero bar is only a marker (${zero}) beside a real one (${ten})`);
  const allMissing = chart('line', 'series s "s"\npoint x=1 s=-\npoint x=2 s=-');
  assert.ok(textsOf(await stillDom(allMissing)).includes('값 없음'));
});

test('K5 each kind rejects its own invalid shapes at the offending line', async () => {
  const cases = [
    ['bar', 'series v "v"\nrow "A" v=-1', 'negative'],
    ['bar', 'series v "v"\nrow "A" v=1\nrow "A" v=2', 'duplicate row'],
    ['bar', 'series v "v"\nrow "A" v=1 v.low=2 v.high=3', 'value outside its interval'],
    ['bar', 'series v "v"\nrow "A" v=1\nrule -1', 'negative rule'],
    ['stacked', 'series p "p"\nseries q "q"\nrow "A" p=1', 'missing series value'],
    ['stacked', 'series p "p" role=reference\nseries q "q"\nrow "A" p=1 q=2', 'reference series'],
    ['percent', 'series p "p"\nrow "A" p=1', 'one series'],
    ['percent', 'series p "p"\nseries q "q"\nrow "A" p=-1 q=2', 'negative share'],
    ['dumbbell', 'series a "a"\nrow "A" a=1', 'one series'],
    ['dumbbell', 'series a "a"\nseries b "b"\nseries c "c"\nrow "A" a=1 b=2 c=3', 'three series'],
    ['difference', 'series a "a"\nseries b "b"\nrow "A" a=1 b=2', 'two series'],
    ['line', 'series s "s"\npoint x=1 s=1\npoint x=1 s=2', 'duplicate x'],
    ['step', 'series s "s"\npoint x=1 s=1 s.low=0 s.high=2', 'interval on a step chart'],
    ['area', 'series s "s"\npoint x=1 s=1', 'one x'],
    ['scatter', 'point "P" x=1 y=2\npoint "P" x=3 y=4', 'duplicate name'],
    ['scatter', 'point "P" x=1 y=2\nlink "P" -> "Z"', 'link to unknown point'],
    ['box', 'row "A" min=3 q1=2 median=3 q3=4 max=5', 'quartile order'],
    ['heatmap', 'cell "r" "c" 1\ncell "r" "c" 2', 'duplicate cell'],
    ['histogram', 'bins 10 0 2\nsample 1', 'bins reversed'],
    ['bar', 'series v "v"\nrow "A" v=1\nscale log', 'log bar'],
  ];
  for (const [kind, rows, why] of cases) {
    const problems = await reject(chart(kind, rows)).catch((error) => { throw new Error(`${kind} (${why}): ${error.message}`); });
    assert.ok(problems.every((p) => p.line >= 1 && p.severity === 'error'), `${kind} ${why}: ${JSON.stringify(problems)}`);
  }
});

test('K5 a series id is unique inside its chart, like every other name inside a card', async () => {
  const source = chart('bar', 'series v "first"\nseries v "second"\nrow "A" v=1');
  assert.ok((await reject(source)).some((p) => p.line === lineOf(source, 'series v "second"')));
});

test('K6 pie and donut take no axes; a share chart with a zero total says so instead of drawing 0%', async () => {
  for (const kind of ['pie', 'donut']) {
    const withAxes = chart(kind, KINDS.pie.rows);
    assert.ok((await reject(withAxes)).some((p) => /no axes/.test(p.message)), kind);
    const zero = await stillDom(chart(kind, 'row "A" value=0\nrow "B" value=0', ''));
    assert.ok(textsOf(zero).some((t) => t.includes('비율 정의 불가')), kind);
    assert.ok(!textsOf(zero).some((t) => /0\.0%/.test(t) && !t.includes('정의')), `${kind}: no 0% claimed`);
  }
});

test('K7 the number range is shared by every number in a chart: finite, under 1e15, and not subnormal', async () => {
  const bar = (v) => chart('bar', `series v "v"\nrow "A" v=${v}`);
  await build(bar('999999999999999'));
  await build(bar('0'));
  await build(bar('2.2250738585072014e-308'.replace('e-308', '').replace('2.2250738585072014', '1')));
  for (const bad of ['1000000000000000', '1e3', '1,5', 'NaN', 'Infinity', '.5.', `${'9'.repeat(400)}`, `0.${'0'.repeat(400)}1`]) {
    const source = bar(bad);
    assert.ok((await reject(source)).some((p) => p.line === lineOf(source, 'row "A"')), bad);
  }
  const rule = chart('bar', 'series v "v"\nrow "A" v=1\nrule 1000000000000000 "r"');
  assert.ok((await reject(rule)).some((p) => p.line === lineOf(rule, 'rule ')));
});

test('K8 a successful figure never writes NaN or Infinity into a coordinate', async () => {
  const sources = [
    chart('bar', 'series v "v"\nrow "A" v=0'),
    chart('line', 'series s "s"\npoint x=1 s=0'),
    chart('line', 'series s "s"\npoint x=1 s=-\npoint x=2 s=-'),
    chart('scatter', 'point "P" x=0 y=0'),
    chart('heatmap', 'cell "r" "c" 0'),
    chart('difference', 'series d "d"\nrow "A" d=0 d.low=0 d.high=0'),
    chart('histogram', 'bins 0 10 2\nsample -'),
    chart('donut', 'row "A" value=0', ''),
    dap('box a "A"\nbox b "B"\na -> b\nscene "s" mode=once\n  a -> b time=1ms\n'),
  ];
  for (const source of sources) {
    const result = await build(source);
    for (const dom of [parseMarkup(await toSvg(result, { isStatic: true })), parseMarkup(await toSvg(result))]) {
      for (const node of descendants(dom)) {
        for (const [name, value] of Object.entries(node.attrs)) {
          if (name === 'href' || name === 'xlink:href') continue;
          assert.doesNotMatch(value, /\b(NaN|Infinity|undefined)\b/, `${node.tag} ${name}`);
        }
      }
    }
  }
});

// 좁은 폭에서 히트맵 열 이름은 수학적으로 겹치지 않아도 붙어 읽히면 안 된다. 잰 글 폭으로 이웃 열 이름 사이 간격을 직접 센다.
test('K9 heatmap column names keep a readable gap and their identity at narrow widths', async () => {
  const columns = ['00~06시', '06~12시', '12~18시', '18~24시'];
  const source = chart('heatmap', ['월', '화', '수'].flatMap((day) => columns.map((col, i) => `cell "${day}" "${col}" ${i + 1}`)).join('\n'), '');
  const base = await build(source);
  const READABLE_GAP = 6;
  for (const chartWidth of [224, 256, 272, 288, 320, 358]) {
    const dom = parseMarkup(await toSvg(await reflowFigure(base, { chartWidth }), { isStatic: true }));
    const names = findAll(dom, (n) => n.tag === 'text' && n.attrs.class === 'chart-tick').map((text) => {
      const lines = findAll(text, (n) => n.tag === 'tspan').map(textContent);
      return { center: num(text.children[0], 'x'), lines, width: Math.max(...lines.map((line) => measure(line, 11, 'num'))) };
    });
    assert.deepEqual(names.map((n) => n.lines.join('')), columns, `${chartWidth}: every column keeps its whole name`);
    for (const [i, name] of names.slice(1).entries()) {
      const gap = name.center - name.width / 2 - (names[i].center + names[i].width / 2);
      assert.ok(gap >= READABLE_GAP, `${chartWidth}: "${names[i].lines.join('')}" and "${name.lines.join('')}" are ${gap.toFixed(2)}px apart`);
    }
  }
});

// 좁은 가로축 눈금 글자: 양 끝을 지키고, 남은 눈금은 같은 걸음으로 건너뛰며, 이웃 글자 사이에 한 칸이 남고, 그림 안에 든다.
test('K9 narrow value-axis labels keep both ends, thin out at an even stride and stay inside the figure', async () => {
  const stops = Array.from({ length: 25 }, (_, i) => `point x=${i} s=${i + 1}`).join('\n');
  const sources = {
    area: chart('area', `series s "s"\n${stops}`),
    step: chart('step', `series s "s"\n${stops}`),
    histogram: chart('histogram', 'bins 0 1000 100\nsample 100\nsample 250\nsample 900'),
    ecdf: chart('ecdf', 'sample 0\nsample 200\nsample 500\nsample 800\nsample 1000'),
  };
  const xTicks = (dom) => findAll(dom, (n) => n.tag === 'text' && /\bchart-tick\b/.test(n.attrs.class ?? '') && !/\bend\b/.test(n.attrs.class));
  for (const [kind, source] of Object.entries(sources)) {
    const base = await build(source);
    const all = xTicks(parseMarkup(await toSvg(base, { isStatic: true }))).map(textContent);
    for (const chartWidth of [224, 256, 272, 288, 320, 358]) {
      const dom = parseMarkup(await toSvg(await reflowFigure(base, { chartWidth }), { isStatic: true }));
      const shown = xTicks(dom).map((text) => ({ label: textContent(text), center: num(text, 'x'), width: measure(textContent(text), 11, 'num') }));
      const where = `${kind} ${chartWidth}: ${shown.map((t) => t.label).join(' ')}`;
      const indices = shown.map((t) => all.indexOf(t.label));
      assert.deepEqual([indices[0], indices.at(-1)], [0, all.length - 1], `${where}: both ends stay`);
      assert.equal(new Set(indices.slice(1).map((index, i) => index - indices[i])).size, 1, `${where}: even stride`);
      shown.slice(1).forEach((tick, i) => assert.ok(tick.center - tick.width / 2 - (shown[i].center + shown[i].width / 2) >= values.space['6'], `${where}: readable gap`));
      const [left, , width] = dom.attrs.viewBox.split(' ').map(Number);
      assert.ok(shown.every((t) => t.center - t.width / 2 >= PAD && t.center + t.width / 2 <= left + width - PAD), `${where}: inside the figure`);
    }
  }
});

// 점 이름은 자기 점이 다른 어느 점보다 `space.6` 이상 가까워야 어느 점의 이름인지 읽힌다. 이름 자리가 모자란 아주 좁은 폭(256 이하, 점이 몰려 그런 자리가 없다)은 예전 자리로 돌아가므로 보지 않는다.
test('K9 scatter names sit nearer to their own point than to any other point', async () => {
  const base = await build(chart('scatter', 'point "Growth B" x=1000 y=5\npoint "Growth C" x=500 y=5\npoint "Low" x=0 y=0'));
  const gap = (a, b) => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.y0 - b.y1, b.y0 - a.y1, 0));
  const around = ({ x, y }) => ({ x0: x - DOT, x1: x + DOT, y0: y - DOT, y1: y + DOT });
  for (const chartWidth of [undefined, 272, 288, 320, 358]) {
    const dom = parseMarkup(await toSvg(chartWidth ? await reflowFigure(base, { chartWidth }) : base, { isStatic: true }));
    const dots = findAll(dom, (n) => n.tag === 'g' && /^cr-\d+$/.test(n.attrs.class ?? '')).map((g) => {
      const circle = descendants(g).find((n) => n.tag === 'circle');
      return { x: num(circle, 'cx'), y: num(circle, 'cy') };
    });
    const pad = values.space['0-5'];
    const names = findAll(dom, (n) => n.tag === 'rect' && /\bchart-text-bg\b/.test(n.attrs.class ?? '')).map((rect) => ({ x0: num(rect, 'x') + pad, y0: num(rect, 'y') + pad, x1: num(rect, 'x') + num(rect, 'width') - pad, y1: num(rect, 'y') + num(rect, 'height') - pad }));
    assert.equal(names.length, 3);
    names.forEach((box, k) => dots.forEach((dot, j) => j === k || assert.ok(gap(box, around(dot)) >= gap(box, around(dots[k])) + values.space['6'], `${chartWidth}: name ${k} is ${(gap(box, around(dot)) - gap(box, around(dots[k]))).toFixed(1)}px nearer to point ${j} than the margin`)));
  }
});

// ---- 값에 묶인 차트 ----

const bound = (kind, rows, sets, series = 'series v "v"') => dap(`
  value depth "depth" from=10
  chart c "Lag" ${kind} {
    x "x(u)"
    ${series}
${rows.split('\n').map((l) => `    ${l.trim()}`).join('\n')}
  }
  box a "a"
  box b "b"
  a -> b
  view graph {
    a
    b
  }
  view plot {
    c
  }
${sets.map((s, i) => `  scene "s${i}" mode=static\n    a -> b set="${s}"`).join('\n')}
`);

test('C1 a bound chart draws each scene with that scene\'s values on one fixed axis, and its marks keep their ids', async () => {
  const source = bound('bar', 'row "A" v=40\nrow "B" v=depth', ['depth=30', 'depth=20']);
  const first = await stillDom(source, 0);
  const second = await stillDom(source, 1);
  const [a0, b0] = marks(first).map((m) => num(m, 'width'));
  const [a1, b1] = marks(second).map((m) => num(m, 'width'));
  near(ratio(b0, a0), 30 / 40, 'scene 0');
  near(ratio(b1, a1), 20 / 40, 'scene 1');
  assert.equal(a0, a1, 'the fixed bar keeps its length, so the axis did not move');
  const ids = (dom) => findAll(dom, (n) => n.attrs['data-mark']).map((n) => n.attrs['data-mark']);
  assert.deepEqual(ids(first), ids(second));
  assert.ok(ids(first).length >= 2);
});

test('C2 a value that is not a number cannot feed a chart: at the start, or after a scene turns it into a word', async () => {
  const start = dap(`value d "d" from=none\nchart c "C" bar {\n  x "x(u)"\n  series v "v"\n  row "A" v=d\n}\n`);
  assert.ok((await reject(start)).some((p) => p.code === 'value-type'));
  const later = bound('bar', 'row "A" v=depth', ['depth=none']);
  assert.ok((await reject(later)).some((p) => p.code === 'value-type'));
});

test('C3 kinds that cannot move reject a binding with binding-unsupported', async () => {
  const boxBound = dap(`value d "d" from=3\nchart c "C" box {\n  x "x(u)"\n  row "A" min=1 q1=2 median=d q3=4 max=5\n}\n`);
  assert.ok((await reject(boxBound)).some((p) => p.code === 'binding-unsupported'));
  const waterfallBound = dap(`value d "d" from=3\nchart c "C" waterfall {\n  x "x(u)"\n  row "up" value=d\n  total "sum"\n}\n`);
  assert.ok((await reject(waterfallBound)).some((p) => p.code === 'binding-unsupported'));
  const xBound = dap(`value d "d" from=3\nchart c "C" line {\n  x "x(u)"\n  y "y(u)"\n  series s "s"\n  point x=d s=1\n  point x=5 s=2\n}\n`);
  assert.ok((await reject(xBound)).some((p) => p.code === 'binding-unsupported'));
});

// #171: 실행 중 받은 값도 정적 행과 같은 규칙을 받는다. 같은 숫자를 행에 적으면 거절되는 경우마다 시험 하나씩 둔다.
const TWO = 'series v "v"\nseries w "w"';
const LOG_LINE = (set) => dap(`value depth "depth" from=10\nchart c "C" line {\n  x "x(u)"\n  y "y(u)"\n  scale log\n  series s "s"\n  point x=1 s=depth\n  point x=2 s=100\n}\nbox a "a"\nbox b "b"\na -> b\nscene "s" mode=static\n  a -> b set="${set}"\n`);
for (const [name, dynamic, literal] of [
  ['bar goes negative', bound('bar', 'row "A" v=depth', ['depth=-5']), chart('bar', 'series v "v"\nrow "A" v=-5')],
  ['bar goes negative by subtraction', bound('bar', 'row "A" v=depth', ['depth-15']), chart('bar', 'series v "v"\nrow "A" v=-5')],
  ['bar reaches 1e16', bound('bar', 'row "A" v=depth', ['depth=10000000000000000']), chart('bar', 'series v "v"\nrow "A" v=10000000000000000')],
  ['percent share goes negative', bound('percent', 'row "A" v=depth w=10', ['depth=-5'], TWO), chart('percent', `${TWO}\nrow "A" v=-5 w=10`)],
  ['stacked total reaches 1e16', bound('stacked', 'row "A" v=depth w=10', ['depth=10000000000000000'], TWO), chart('stacked', `${TWO}\nrow "A" v=10000000000000000 w=10`)],
  ['bar leaves its interval', bound('bar', 'row "A" v=depth v.low=0 v.high=10', ['depth=50']), chart('bar', 'series v "v"\nrow "A" v=50 v.low=0 v.high=10')],
  ['log line reaches 0', LOG_LINE('depth=0'), dap('chart c "C" line {\n  x "x(u)"\n  y "y(u)"\n  scale log\n  series s "s"\n  point x=1 s=0\n  point x=2 s=100\n}\n')],
]) {
  test(`C4 #171 ${name}: rejected with a located error, as the same number in a row is`, async () => {
    assert.ok((await reject(literal)).length, 'the static form is rejected');
    const problems = await reject(dynamic);
    assert.ok(problems.length && problems.every((p) => p.line >= 1), JSON.stringify(problems));
  });
}

test('C4 #171 the boundary values the static rules accept stay accepted when they arrive through a value', async () => {
  await build(bound('bar', 'row "A" v=depth', ['depth=0']));
  await build(bound('bar', 'row "A" v=depth', ['depth=999999999999999']));
  await build(bound('percent', 'row "A" v=depth w=10', ['depth=0'], TWO));
});

// 구간 순서(low ≤ 값 ≤ high)는 여러 값이 함께 정하는 규칙이라 실제로 그려지는 값끼리만 본다. 값 하나만 바꿔 끼운 가정 조합은 실제 프레임이 아니다.
const INTERVAL_ROW = 'row "A" v=mid v.low=lo v.high=hi';
const interval = (sets) => dap(`
  value lo "lo" from=0
  value mid "mid" from=5
  value hi "hi" from=10
  chart c "C" bar {
    x "x(u)"
    series v "v"
    ${INTERVAL_ROW}
  }
  box a "a"
  box b "b"
  a -> b
  view graph {
    a
    b
  }
  view plot {
    c
  }
${sets.map((s, i) => `  scene "s${i}" mode=static\n    a -> b set="${s}"`).join('\n')}
`);

test('C4 an interval that a value pushes out of order is a located error in the frame where it happens, as in a static row', async () => {
  const staticSource = chart('bar', 'series v "v"\nrow "A" v=50 v.low=0 v.high=10');
  assert.ok((await reject(staticSource)).some((p) => p.line === lineOf(staticSource, 'row "A"') && /v\.low ≤ v ≤ v\.high/.test(p.message)));
  for (const set of ['mid=50', 'lo=20', 'hi=2', 'lo=100, mid=150']) {
    const source = interval([set]);
    const problems = await reject(source);
    assert.ok(problems.some((p) => p.code === 'value-type' && p.line === lineOf(source, INTERVAL_ROW) && /v\.low ≤ v ≤ v\.high/.test(p.message)), `${set}: ${JSON.stringify(problems)}`);
  }
});

test('C4 bounds that move together keep the interval in order in every frame, even though each one alone would not', async () => {
  // mid=150 with hi=10, or lo=100 with mid=5, never appear in a frame; only the values set together do.
  const source = interval(['lo=100, mid=150, hi=200', 'lo=0, mid=5, hi=10']);
  await build(source);
  for (const scene of [0, 1]) assert.ok(marks(await stillDom(source, scene)).length >= 1, `scene ${scene}`);
});

test('C5 chart data from JSON: relative path, element keys become series, and every bad shape is a located error that does not quote the file', async (t) => {
  const { workspace } = await import('./support.js');
  const secret = 'TOKEN=ghp_PRIVATE_BYTES_0123456789';
  const dir = workspace(t, {
    'rows.json': JSON.stringify({ rows: [{ label: 'A', ours: 4 }, { label: 'B', ours: 8 }] }),
    'bad-type.json': JSON.stringify([{ label: 'A', ours: 'four' }]),
    'not-array.json': JSON.stringify({ rows: 1 }),
    'no-object.json': JSON.stringify([1]),
    'secret.env': secret,
    'secret.json': `{ ${secret}`,
  });
  const source = (file, at = '') => dap(`chart c "C" bar {\n  x "x(u)"\n  data "${file}"${at}\n  series ours "ours" key="ours"\n}\n`);
  const dom = await stillDom(source('rows.json', ' at "/rows"'), 0, { baseDir: dir });
  const [a, b] = marks(dom).map((m) => num(m, 'width'));
  near(ratio(b, a), 2, 'rows read from the file keep their proportion');
  for (const [file, at] of [['missing.json', ''], ['bad-type.json', ''], ['not-array.json', ' at "/rows"'], ['no-object.json', ''], ['rows.json', ' at "/nope"'], ['secret.env', ''], ['secret.json', '']]) {
    const problems = await reject(source(file, at), { baseDir: dir });
    assert.ok(problems.length && problems.every((p) => p.line === 4), `${file}: ${JSON.stringify(problems)}`);
    for (const problem of problems) assert.ok(!problem.message.includes('PRIVATE_BYTES') && !problem.message.includes('ghp_'), `${file}: the message quotes file bytes: ${problem.message}`);
  }
});
