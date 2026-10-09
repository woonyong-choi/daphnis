// 구획 카드(표, API, 클래스)와 순서 보기 참여자의 공통 머리. 머리 면은 평소 중립 면이고 파랑은 선택된 칸만 쓴다.
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { drawSymbol } from './decor.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 머리 면. 바깥 경계 안에서 위쪽 모서리만 둥글게 채운다. 면 색은 CSS(.schema-heading)가 정한다. */
export function schemaHeader(it, height) {
  const inset = values.simple2['node-stroke'];
  const x = it.x + inset;
  const y = it.y + inset;
  const w = it.w - inset * 2;
  const corner = Math.max(0, values.simple2['node-corner'] - inset);
  const d = `M${r(x + corner)} ${r(y)}H${r(x + w - corner)}Q${r(x + w)} ${r(y)} ${r(x + w)} ${r(y + corner)}V${r(it.y + height)}H${r(x)}V${r(y + corner)}Q${r(x)} ${r(y)} ${r(x + corner)} ${r(y)}Z`;
  return `<path class="schema-heading" d="${d}"/>`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 머리 한 줄: 아이콘과 이름이 나란하고 아이콘 가운데가 이름 가운데와 같다. 묶음은 카드 가운데에 놓인다(measure/table.js headerRow).
 * @param it 카드. head(headerRow 결과)와 iconData가 있다
 * @param height 머리 줄 높이
 */
export function drawHeaderRow(it, height, glyphs) {
  glyphs.add(it.label, STYLE.label.face);
  const icon = values.size.icon.node;
  const left = it.x + (it.w - it.head.w) / 2;
  // 머리 줄 위에 «interface» 같은 표시가 있으면(headerTop) 줄이 그만큼 아래다.
  const top = it.y + (it.headerTop ?? 0);
  const mark = it.head.icon ? drawSymbol(it.iconData, { x: left, y: top + (height - icon) / 2, size: icon }) : '';
  const stereotype = it.stereotype ? `<text x="${r(it.x + it.w / 2)}" y="${r(centerBaseline(it.y + it.headerTop / 2, STYLE.meta.size))}" text-anchor="middle" class="classifier-text meta">${it.stereotype}</text>` : '';
  if (it.stereotype) glyphs.add(it.stereotype, STYLE.meta.face);
  return `${stereotype}${mark}<text x="${r(left + it.head.titleX)}" y="${r(centerBaseline(top + height / 2, STYLE.label.size))}" class="label">${renderRich(it.label)}</text>`;
}
