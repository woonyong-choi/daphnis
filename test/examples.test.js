// 표현 서른 가지: examples/ 폴더의 원본을 유효한 씨앗으로 삼아, 모든 예제가 경고 없이 읽히고 모든 장면이 올바른 SVG와 HTML이 되는지 본다.
// 독립 최소 경계 입력은 charts.test.js(차트 열여섯)와 kinds.test.js(개발 그림 열넷)에 있다. 시험 이름 첫 낱말(K30)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { build, descendants, EXAMPLES, findAll, parseMarkup, textsOf, toHtml, toSvg } from './support.js';

const CHARTS = ['area', 'bar', 'box', 'difference', 'donut', 'dumbbell', 'ecdf', 'heatmap', 'histogram', 'line', 'percent', 'pie', 'scatter', 'stacked', 'step', 'waterfall'];
const FIGURES = ['api', 'architecture', 'class', 'flow', 'integration', 'memory', 'metric', 'pointer', 'queue', 'schema', 'sequence', 'stack', 'state', 'trace'];
const ANIMATION = new Set(['animate', 'set', 'animateMotion', 'animateTransform']);

test('K30 the examples are one per expression: sixteen chart kinds and fourteen figure families, nothing else', () => {
  const names = readdirSync(EXAMPLES).filter((f) => f.endsWith('.dap')).map((f) => f.replace(/\.dap$/, '')).sort();
  assert.deepEqual(names, [...CHARTS, ...FIGURES].sort());
});

/** 원본의 장면 줄에서 장면마다 기대하는 mode. mode를 적지 않으면 줄이 없는 장면은 static, 있는 장면은 once다. */
function expectedModes(source) {
  const modes = [];
  let current;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (/^scene\b/.test(line) && !/^scene\s*->/.test(line)) {
      current = { mode: /\bmode=(static|once|loop)\b/.exec(line)?.[1], lines: 0 };
      modes.push(current);
    } else if (current && line.trim()) current.lines += 1;
  }
  return modes.map(({ mode, lines }) => mode ?? (lines ? 'once' : 'static'));
}

/** 그림에 선언한 카드 제목(`kind id "제목"`). 코드 조각과 줄바꿈이 필요한 긴 글은 뺀다. */
function declaredTitles(source) {
  return [...source.matchAll(/^\s*(?:person|box|external|store|decision|queue|state|table|api|class|interface|grid|chart|trace|group)\s+[a-z][a-z0-9-]*\s+"([^"]{1,16})"/gm)].map((m) => m[1]).filter((t) => !t.includes('`'));
}

for (const name of [...CHARTS, ...FIGURES]) {
  test(`K30 ${name}.dap builds strictly, every scene is a well-formed picture, and the page is standalone`, async () => {
    const source = readFileSync(join(EXAMPLES, `${name}.dap`), 'utf8');
    const result = await build(source, { baseDir: EXAMPLES });
    assert.deepEqual(result.warnings, []);
    const modes = expectedModes(source);
    const scenes = Math.max(modes.length, 1);
    for (let scene = 0; scene < scenes; scene += 1) {
      const moving = parseMarkup(await toSvg(result, { scene }));
      const still = parseMarkup(await toSvg(result, { scene, isStatic: true }));
      assert.equal(moving.attrs['data-scene'], String(scene));
      const animations = descendants(moving).filter((n) => ANIMATION.has(n.tag));
      if (modes[scene] === 'loop') assert.ok(animations.every((n) => n.attrs.repeatCount === 'indefinite'), `scene ${scene} loops`);
      if (modes[scene] === 'once') assert.ok(animations.every((n) => n.attrs.repeatCount === '1'), `scene ${scene} plays once`);
      if (modes[scene] === 'static') assert.equal(animations.length, 0, `scene ${scene} is still`);
      assert.equal(still.attrs['data-mode'], 'static');
      assert.equal(descendants(still).filter((n) => ANIMATION.has(n.tag)).length, 0);
    }
    const first = textsOf(parseMarkup(await toSvg(result, { scene: 0, isStatic: true }))).join(' ').replace(/\s+/g, ' ');
    for (const title of declaredTitles(source)) assert.ok(first.includes(title.replace(/\s+/g, ' ')), `"${title}" is drawn`);

    const html = await toHtml(result, name);
    const page = parseMarkup(html, { html: true });
    assert.ok(findAll(page, (n) => n.tag === 'section' && n.attrs['data-strategy']).length >= 1);
    assert.equal(findAll(page, (n) => n.tag === 'script' && n.attrs.src).length, 0);
    assert.doesNotMatch(html, /\b(src|href)="https?:/);
    const rebuilt = await build(source, { baseDir: EXAMPLES });
    assert.equal(await toSvg(rebuilt, { scene: 0 }), await toSvg(result, { scene: 0 }), 'the same source draws the same bytes');
    assert.equal(await toHtml(rebuilt, name), html);
  });
}

test('K30 every chart example is the chart kind its file is named after, and says so in its title', async () => {
  for (const kind of CHARTS) {
    const source = readFileSync(join(EXAMPLES, `${kind}.dap`), 'utf8');
    assert.match(source, new RegExp(`^chart\\s+[a-z][a-z0-9-]*\\s+"[^"]*"\\s+${kind}\\b`, 'm'), kind);
  }
});
