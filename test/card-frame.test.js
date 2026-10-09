// 값 없는 카드: 내용이 없는 단계에서는 빈 점선 틀을 그리지 않는다(docs/design/figure-syntax.md 카드).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const CARD_FRAME = /<rect [^>]*class="fl-card[ "][^>]*>/g;
// 첫 장면에서만 카드에 글이 올라간다. 둘째 장면의 정지 그림은 모든 카드가 비어 있다.
const SOURCE = `daphnis 2
person user "사용자"
box extract "추출기" "LLM"
store graph "기억 그래프"
user -> extract
extract -> graph
scene "첫 대화" mode=once
  user -> extract "민지는 3월에 토스로 옮겼어"
  show extract "민지" tag="person"
  show graph "민지 -> 토스"
scene "비움"
  user -> extract
`;

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 카드 틀 수
// basis: estimate
// 정지 SVG에서 보이는 카드 틀의 수. 틀의 보임은 속성 opacity와 그 틀이 단 클래스(`a1`)의 CSS 규칙이 함께 정하므로 규칙까지 읽는다.
function visibleFrames(svg) {
  const opacityOf = new Map([...svg.matchAll(/\.(a\d+) \{ opacity: ([\d.]+); \}/g)].map((m) => [m[1], Number(m[2])]));
  return svg.match(CARD_FRAME).filter((frame) => {
    const [, attribute] = /opacity="([\d.]+)"/.exec(frame);
    const cls = /class="fl-card (a\d+)"/.exec(frame)?.[1];
    return (opacityOf.get(cls) ?? Number(attribute)) > 0;
  });
}

// 근거: 이슈 #63 "값 없는 카드의 빈 점선 틀". 카드에 내용이 없는 정지 SVG에는 틀이 보이지 않고, 내용이 있는 장면에서는 같은 틀이 보인다
test('toSvg_static_card_without_content_draws_no_visible_frame', async () => {
  const result = await buildFigure(SOURCE);
  const filled = await toSvg(result, { isStatic: true, name: 'memory', scene: 0 });
  const empty = await toSvg(result, { isStatic: true, name: 'memory', scene: 1 });

  assert.equal(filled.match(CARD_FRAME).length, 2);
  assert.equal(visibleFrames(filled).length, 2, '글이 올라간 카드는 틀이 보인다');
  assert.equal(empty.match(CARD_FRAME).length, 2);
  assert.deepEqual(visibleFrames(empty), [], '비어 있는 카드는 틀이 보이지 않는다');
});
