// 도형 윗줄과 그룹 제목 줄의 장식(아이콘, 글자 배지, 복제 개수 알약)을 그린다. 크기와 자리는 measure/decor.js가 정한 그대로다.
import { BADGE_STYLE } from '../measure/decor.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';

// cost: time O(k), heap O(out), stack O(1)
// vars: k = 장식 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장식 한 줄을 그린다.
 * @param decor measure/decor.js의 layoutDecor 결과
 * @param place { x, y, iconData, hasChip }. x, y는 줄 왼쪽 위(그림 좌표), iconData는 아이콘 { viewBox, body }, hasChip이면 아이콘을 색 바탕 칩 안에 그린다(그룹 제목 줄)
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawDecor(decor, place, glyphs) {
  return decor.items
    .filter((item) => item.kind !== 'title')
    .map((item) => (item.kind === 'icon' ? drawIcon(item, place) : drawPill(item, place, glyphs)))
    .join('');
}

// 아이콘. 파일의 viewBox를 정사각 칸 안에 가운데로 맞춰 넣는다. 색은 class의 currentColor가 정한다. 칩이면 칸 둘레에 칩 간격을 두고 색 바탕 사각형 위에 바탕색 아이콘으로 그린다.
function drawIcon(item, { x, y, iconData, hasChip }) {
  const pad = hasChip ? values.size.icon['chip-pad'] : 0;
  const [vx, vy, vw, vh] = iconData.viewBox;
  const size = item.w - pad * 2;
  const scale = size / Math.max(vw, vh);
  const tx = x + item.x + pad + (size - vw * scale) / 2 - vx * scale;
  const ty = y + item.y + pad + (size - vh * scale) / 2 - vy * scale;
  const chip = hasChip ? `<rect x="${r(x + item.x)}" y="${r(y + item.y)}" width="${r(item.w)}" height="${r(item.h)}" rx="${values.radius.md}" class="icon-chip"/>` : '';
  return `${chip}<g class="fl-icon${hasChip ? ' on-chip' : ''}" transform="translate(${r(tx)} ${r(ty)}) scale(${r(scale * 1000) / 1000})">${iconData.body}</g>`;
}

// 글자 알약. 배지와 복제 개수가 같은 모양이다.
function drawPill(item, { x, y }, glyphs) {
  glyphs.add(item.text, BADGE_STYLE.face);
  const [left, top] = [x + item.x, y + item.y];
  return `<g class="fl-badge"><rect x="${r(left)}" y="${r(top)}" width="${r(item.w)}" height="${item.h}" rx="${item.h / 2}" class="badge-pill"/><text x="${r(left + item.w / 2)}" y="${r(centerBaseline(top + item.h / 2, BADGE_STYLE.size))}" class="badge">${escapeXml(item.text)}</text></g>`;
}
