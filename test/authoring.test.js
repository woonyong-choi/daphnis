// 작성 기본값: 이름 없는 보기와 묵시 보기, 장면 기본 mode, 한 낱말 색(tone)과 모양(appearance).
// 문법 단순화(G2, G3, G5) 계약이다. 시험 이름 첫 낱말이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다. (G1, 이름 있는 보기의 거절은 cards.test.js의 S9가 본다.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, dap, lineOf, panelStrategies, reject, toSvg } from './support.js';

const CHART = 'chart c "C" bar {\n  x "x(u)"\n  series v "v"\n  row "r" v=1\n}\n';
const TRACE = 'trace t "T" {\n  span s "s" lane=a at=0 dur=1\n}\n';

test('G2 views no one listed appear on their own: a trace gets a time view, an edge-less chart a plot, the rest one graph', async () => {
  const cases = [
    ['box a "A"\n', ['graph']],
    [CHART, ['plot']],
    [`box a "A"\n${CHART}`, ['graph', 'plot']],
    [`box a "A"\n${CHART}a -> c\n`, ['graph']],
    [`box a "A"\n${TRACE}`, ['graph', 'time']],
    [`${CHART}box a "A"\n${TRACE}`, ['plot', 'graph', 'time']],
  ];
  for (const [body, expected] of cases) assert.deepEqual(await panelStrategies(dap(body)), expected, body);
});

test('G2 an explicit view only adds: its members get no second implicit view and an unlisted card still gets one graph', async () => {
  assert.deepEqual(await panelStrategies(dap('box a "A"\nbox b "B"\nview graph\n')), ['graph']);
  assert.deepEqual(await panelStrategies(dap('box a "A"\nbox b "B"\nview graph "All"\n')), ['graph']);
  assert.deepEqual(await panelStrategies(dap(`box a "A"\n${TRACE}view time "Timing" {\n  t\n}\n`)), ['time', 'graph']);
  assert.deepEqual(await panelStrategies(dap(`box a "A"\n${CHART}view plot "Numbers" {\n  c\n}\n`)), ['plot', 'graph']);
  assert.deepEqual(await panelStrategies(dap('person u "U"\nbox s "S"\nview sequence {\n  u\n  s\n}\n')), ['sequence']);
  assert.deepEqual(await panelStrategies(dap('person u "U"\nbox s "S"\nbox z "Z"\nview sequence {\n  u\n  s\n}\n')), ['sequence', 'graph']);
  // 같은 카드를 여러 방식에 함께 놓는 일은 그대로 된다
  assert.deepEqual(await panelStrategies(dap('person u "U"\nbox s "S"\nu -> s\nview graph\nview sequence {\n  u\n  s\n}\n')), ['graph', 'sequence']);
});

test('G2 an explicit view lists only members its kind can hold', async () => {
  const wrong = [
    [`box a "A"\n${CHART}view plot {\n  a\n}\n`, 'a'],
    [`box a "A"\n${TRACE}view time {\n  a\n}\n`, 'a'],
    ['box a "A"\nview sequence {\n  zz\n}\n', 'zz'],
  ];
  for (const [body, member] of wrong) {
    const source = dap(body);
    assert.ok((await reject(source)).some((p) => p.message.includes(member)), body);
  }
});

test('G3 a scene with no lines is still, a scene with lines plays once, and an explicit mode always wins', async () => {
  const mode = async (scene, extra = 'box a "A"\nbox b "B"\na -> b\n') => {
    const result = await build(dap(`${extra}${scene}`));
    return result.timeline.steps.map((s) => s.mode);
  };
  assert.deepEqual(await mode('scene "s"\n'), ['static']);
  assert.deepEqual(await mode('scene "s"\n  a -> b\n'), ['once']);
  assert.deepEqual(await mode('scene "s" mode=static\n  a -> b\n'), ['static']);
  assert.deepEqual(await mode('scene "s" mode=loop\n  a -> b\n'), ['loop']);
  assert.deepEqual(await mode('scene "s"\nscene "t"\n  a -> b\nscene "u" mode=loop\n  a -> b\n'), ['static', 'once', 'loop']);
  // 렌더링도 같은 방식을 따른다
  const svg = (scene, i) => build(dap(`box a "A"\nbox b "B"\na -> b\n${scene}`)).then((r) => toSvg(r, { scene: i }));
  assert.match(await svg('scene "s"\n  a -> b\n', 0), /data-mode="once"/);
  assert.match(await svg('scene "s"\n', 0), /data-mode="static"/);
});

test('G3 an empty scene cannot be asked to play: mode=once or mode=loop with no lines is a located error', async () => {
  for (const mode of ['once', 'loop']) {
    const source = dap(`box a "A"\nscene "s" mode=${mode}\n`);
    assert.ok((await reject(source)).some((p) => p.line === lineOf(source, 'scene "s"')), mode);
  }
  await build(dap('box a "A"\nscene "s" mode=static\n'));
});

test('G3 a scene name is never only digits, since --scene reads digits as a number; names with other characters are fine', async () => {
  for (const label of ['2', '10', '007']) {
    const source = dap(`box a "A"\nscene "${label}" mode=static\n`);
    assert.ok((await reject(source)).some((p) => p.line === lineOf(source, 'scene "')), label);
  }
  for (const label of ['2단계', 'v2', '2.0', ' 2 x']) await build(dap(`box a "A"\nscene "${label}" mode=static\n`));
});

const TONES = ['blue', 'yellow', 'red', 'green', 'orange', 'purple', 'cyan', 'gray'];

test('G5 tone is the one color word on people, boxes, externals, stores, groups and card rows; it takes the eight names only', async () => {
  for (const tone of TONES) {
    for (const card of ['person', 'box', 'external', 'store']) await build(dap(`${card} a "A" tone=${tone}\n`));
    await build(dap(`group g "G" tone=${tone} {\n  box a "A"\n}\n`));
    await build(dap(`box a "A"\nbox b "B"\na -> b\nscene "s"\n  a -> b\n  show b "x" tag="t" tone=${tone}\n`));
  }
  for (const bad of ['brand', 'amber', 'teal', 'navy', 'pink', 'sky', '"blue"', '#ff0000', 'Blue', '']) {
    const source = dap(`box a "A" tone=${bad}\n`);
    assert.ok((await reject(source)).some((p) => p.line === lineOf(source, 'tone=')), `tone=${bad}`);
  }
});

test('G5 the options tone replaced are errors at their line, not silently ignored: fill, stroke and show card', async () => {
  for (const line of ['box a "A" fill=blue', 'box a "A" stroke=blue', 'person a "A" fill=red', 'group g "G" stroke=green {\n  box a "A"\n}', 'external a "A" fill=gray', 'store a "A" stroke=cyan']) {
    const source = dap(`${line}\n`);
    const problems = await reject(source);
    assert.ok(problems.some((p) => p.line === lineOf(source, line.split('\n')[0]) && p.code === 'syntax'), line);
    for (const problem of problems) assert.doesNotMatch(problem.message, /renamed|no longer|used to|old form|instead of|replaced/i, 'no migration advice');
  }
  const card = dap('box a "A"\nbox b "B"\na -> b\nscene "s"\n  a -> b\n  show b "x" card=blue\n');
  assert.ok((await reject(card)).some((p) => p.line === lineOf(card, 'show b')));
});

test('G5 appearance is plain, filled or outline; the colored two need a tone; plain is the default', async () => {
  for (const appearance of ['plain', 'filled', 'outline']) await build(dap(`box a "A" tone=red appearance=${appearance}\n`));
  await build(dap('box a "A" appearance=plain\n'));
  for (const line of ['box a "A" appearance=filled', 'box a "A" appearance=outline', 'box a "A" tone=red appearance=hollow', 'box a "A" tone=red appearance=']) {
    const source = dap(`${line}\n`);
    assert.ok((await reject(source)).some((p) => p.line === lineOf(source, line)), line);
  }
});

test('G5 tone and appearance change the picture, plain without a tone is the neutral default, and the same input draws the same bytes', async () => {
  const svg = async (options) => toSvg(await build(dap(`box a "A" ${options}\nbox b "B"\na -> b\n`)), { isStatic: true });
  const neutral = await svg('');
  assert.equal(await svg('appearance=plain'), neutral, 'plain is the default');
  const toned = await svg('tone=purple');
  const filled = await svg('tone=purple appearance=filled');
  const outline = await svg('tone=purple appearance=outline');
  const other = await svg('tone=green appearance=filled');
  assert.equal(new Set([neutral, toned, filled, outline, other]).size, 5, 'each choice draws something different');
  assert.equal(await svg('tone=purple appearance=filled'), filled);
});
