// 공통 상태 계약: 켜짐과 평소의 모습은 figure.css의 효과 한 벌(`--fx-*`) 하나가 정하고, 움직이는 SVG의 keyframes와 HTML 재생기의 규칙이 같은 사용자 정의 속성을 읽는다.
// 차트 방향선의 화살촉은 색 역할마다 정의 하나이고, 차트 종류가 섞여도 선언 순서와 상관없이 몸통과 같은 역할의 색을 읽는다.
// 브라우저에서 계산된 색은 보지 않는다(화면 검수는 따로 한다). 여기서는 출력이 어떤 정의를 읽는지만 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, dap, toHtml, toSvg } from './support.js';

const GRAPH = dap(`
  table t "T" {
    id bigint pk
  }
  grid g "G" cols=2 {
    item a "A" col=0
  }
  box s "S" tone=yellow appearance=outline
  box f "F" tone=blue appearance=filled
  s -> f "go"
  view graph {
    t g s f
  }
  scene "s"
    light t.id g.a
    light s f
    s -> f
`);

const DUMBBELL = `chart d "지연" dumbbell {
  x "지연(ms)"
  series before "전" role=compare
  series after "후" role=main
  row "a" before=10 after=5
}`;
const SCATTER = `chart p "점" scatter {
  x "크기(줄)"
  y "장애(건)"
  point "p1" x=1 y=1
  point "p2" x=2 y=2
  link "p1" -> "p2"
}`;

const KEYFRAMES = /@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g;

test('S1 켜짐과 평소 모습은 효과 한 벌(--fx-*)을 움직이는 SVG와 HTML이 함께 읽는다', async () => {
  const result = await build(GRAPH);
  const svg = await toSvg(result);
  const html = await toHtml(result, 'state');
  for (const out of [svg, html]) {
    const defined = new Set([...out.matchAll(/(--fx-[\w-]+)\s*:/g)].map((m) => m[1]));
    const read = [...out.matchAll(/var\((--fx-[\w-]+)/g)].map((m) => m[1]);
    assert.deepEqual(read.filter((name) => !defined.has(name)), [], 'every --fx-* that is read is defined in the same document');
  }
  const frames = (svg.match(KEYFRAMES) ?? []).filter((k) => k.includes('--fx-'));
  assert.ok(frames.length > 0, 'the lit nodes, parts and cells animate through --fx-*');
  assert.ok(frames.every((k) => !/--color-state-active\)|--simple2-(hover-fill|separator|row-selection|surface-edge)|--color-paint/.test(k)), 'keyframes do not repeat token colors');
  assert.match(html, /\.fl-part\.on :is\(\.part-bg, \.grid-cell\)\s*\{\s*fill: var\(--fx-face-on\)/, 'the HTML lit field and cell read the same lit face as the animated SVG');
  assert.ok(frames.some((k) => k.includes('fill: var(--fx-face-on)') && !k.includes('stroke')) && frames.some((k) => k.includes('fill: var(--fx-face);')), 'the animated SVG lights a field and a cell by that lit face only');
  assert.match(svg, /\.fl-node\.ap-outline\.tn-yellow\s*\{\s*--fx-edge-rest:/, 'a chosen tone changes only the rest values');
  assert.match(svg, /\.fl-node\.ap-filled\.tn-blue\s*\{\s*--fx-face:/);
});

// 켜진 차트 카드: 카드 면은 켜짐 면(--fx-face-on)으로 바뀌므로 글자 바탕과 받침 선도 같은 구간에 같은 면을 따라야 한다.
// 면은 윤곽 요소의 class가, 차트는 그 형제 묶음(.fl-chart)이 가지므로 움직이는 SVG는 묶음에 같은 켜짐 구간을 따로 건다.
// 건 속성은 일반 상속 속성 color다(chart.css의 `.fl-chart`가 바탕 면을 color로 싣고 받는 쪽이 currentColor로 읽는다). 사용자 정의 속성 keyframes는 시작 때 값이 굳어 테마가 바뀌어도 따라가지 않는다.
const LIT_CHART = dap(`
  box a "A"
  a -> sales
  chart sales "매출" line {
    x "시각(시)"
    y "지연(ms)"
    series u "A" role=main
    series v "B" role=compare
    point x=1 u=1 v=3
    point x=2 u=2 v=1
    point x=3 u=4 v=2
  }
  view graph down
  scene "켜짐" mode=loop
    a -> sales time=600ms
    light sales
    wait 1s
`);

test('S3 켜진 차트 카드의 글자 바탕과 받침 선은 정지 SVG, 움직이는 SVG, HTML 모두 켜진 카드 면을 따른다', async () => {
  const result = await build(LIT_CHART);
  const groupsOf = (out) => [...out.matchAll(/<g class="fl-chart(?: ([\w-]+))?" data-chart="sales"/g)].map((m) => m[1]);
  const GROUND_ON = 'color: var(--fx-face-on)';
  const GROUND_OFF = 'color: var(--fx-face)';

  const still = await toSvg(result, { isStatic: true });
  const [stillName] = groupsOf(still);
  assert.match(stillName ?? '', /^a\d+$/, 'the static SVG puts a lit class on the chart group, not only on the card face');
  assert.ok(still.includes(`.fl .${stillName} { ${GROUND_ON}; }`), 'the final state is lit, so the ground is the lit face');

  const moving = await toSvg(result);
  const names = groupsOf(moving);
  const live = names.find((name) => /^a\d+$/.test(name ?? ''));
  assert.ok(live, 'the animated SVG puts a lit class on the chart group');
  const frames = (moving.match(KEYFRAMES) ?? []).find((k) => k.startsWith(`@keyframes ${live} `));
  assert.ok(frames?.includes(GROUND_ON) && frames.includes(GROUND_OFF), 'the loop turns the ground from the rest face to the lit face and back with the card');
  assert.ok(moving.includes(`.fl .${live} { animation: ${live} `), 'the keyframes run on the chart group');
  assert.ok(!frames.includes('--chart-ground'), 'the keyframes animate the inherited color, not the alias');
  const declaring = (moving.match(KEYFRAMES) ?? []).filter((k) => /[{;]\s*--[\w-]+\s*:/.test(k));
  assert.deepEqual(declaring.map((k) => k.slice(0, k.indexOf('{')).trim()), [], 'no keyframes declare a custom property, whose value would freeze at the start and miss a theme change');
  const frozen = names.find((name) => /^sa\d+$/.test(name ?? ''));
  assert.ok(frozen === undefined || moving.includes(`.fl .${frozen} { ${GROUND_ON}; }`), 'the final-state layer holds the lit ground');

  const html = await toHtml(result, 'lit');
  assert.ok(groupsOf(html).length > 0 && groupsOf(html).every((name) => name === undefined), 'the HTML player has no lit class on the chart group');
  assert.match(html, /\.fl \.fl-node\.on\s*\{\s*--chart-ground:\s*var\(--fx-face-on\)/, 'the HTML player lights the ground by the existing .on rule, which the chart group carries as color');
  assert.match(html, /\.fl \.fl-chart\s*\{\s*color:\s*var\(--chart-ground\)/, 'the same carrier in the HTML player');
});

for (const [first, order] of [['덤벨', [DUMBBELL, SCATTER]], ['산점도', [SCATTER, DUMBBELL]]]) {
  test(`S2 차트 종류가 섞여도 방향선 화살촉은 몸통과 같은 역할의 색을 읽는다 (${first} 먼저)`, async () => {
    const result = await build(dap(`${order.join('\n')}\nscene "a"`));
    for (const out of [await toSvg(result), await toHtml(result, 'arrows')]) {
      assert.deepEqual([...out.matchAll(/<marker id="(fl-arrow-[a-z]+)"/g)].map((m) => m[1]).sort(), ['fl-arrow-main', 'fl-arrow-muted'], 'one marker per role, whatever the declaration order');
      const lines = [...out.matchAll(/class="chart-(?:arrow|link) arrow-([a-z]+) pop" marker-end="url\(#(fl-arrow-[a-z]+)\)"/g)];
      assert.ok(lines.length >= 2, 'both chart kinds draw a direction line');
      assert.ok(lines.every(([, role, marker]) => marker === `fl-arrow-${role}`), 'each line points at the marker of its own role');
      assert.doesNotMatch(out, /url\(#fl-arrow\)/, 'no shared marker whose color the first chart decides');
    }
  });
}
