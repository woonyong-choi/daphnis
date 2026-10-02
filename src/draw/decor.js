// 도형 윗줄과 그룹 제목 줄의 장식(아이콘, 글자 배지, 개수와 반복 알약)과 개수 요약의 생략 표식, 범주색을 그린다. 크기와 자리는 measure/decor.js가 정한 그대로다.
import { BADGE_STYLE } from '../measure/decor.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';

const SIZE = values.size;
const RADIUS = values.radius;
/** 범주색을 돌려 쓰는 순서. 색 이름은 사용자가 정하지 않고 범주가 처음 나온 순서가 정한다. 파랑(지금)과 주황(비교)은 쓰지 않는다. */
const CATEGORY_TONES = ['purple', 'green', 'teal', 'gray'];

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 범주 수
// basis: estimate
/**
 * 범주 이름 → 범주색(tag 역할) 고르는 함수. 범주가 원본에 처음 나온 순서대로 보라, 초록, 청록, 회색을 받고 네 개를 넘으면 돌려 쓴다.
 * 색만으로는 범주를 가를 수 없으므로 도형에는 글자 배지가 늘 함께 있다.
 * @param order 범주 이름의 처음 나온 순서(중복 없음)
 */
export function createCategoryTones(order = []) {
  const tones = new Map(order.map((name, i) => [name, CATEGORY_TONES[i % CATEGORY_TONES.length]]));
  return (category) => (category === undefined || !tones.has(category) ? undefined : tokens.color.tag[tones.get(category)]);
}

// cost: time O(k), heap O(out), stack O(1)
// vars: k = 장식 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장식 한 줄을 그린다.
 * @param decor measure/decor.js의 layoutDecor 결과
 * @param place { x, y, iconData, tint }. x, y는 줄 왼쪽 위(그림 좌표), iconData는 아이콘 { viewBox, body }, tint는 배지 알약 위에 덮을 범주색
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawDecor(decor, place, glyphs) {
  return decor.items
    .filter((item) => item.kind !== 'title')
    .map((item) => (item.kind === 'icon' ? drawIcon(item, place) : drawPill(item, place, glyphs)))
    .join('');
}

// 아이콘. 파일의 viewBox를 정사각 칸 안에 가운데로 맞춰 넣는다. 색은 class의 currentColor가 정한다.
function drawIcon(item, { x, y, iconData }) {
  const [vx, vy, vw, vh] = iconData.viewBox;
  const scale = item.w / Math.max(vw, vh);
  const tx = x + item.x + (item.w - vw * scale) / 2 - vx * scale;
  const ty = y + item.y + (item.h - vh * scale) / 2 - vy * scale;
  return `<g class="fl-icon" transform="translate(${r(tx)} ${r(ty)}) scale(${r(scale * 1000) / 1000})">${iconData.body}</g>`;
}

// 글자 알약. 배지는 범주색 덮개가 있고, 개수와 반복은 덮개 없이 같은 모양이다.
function drawPill(item, { x, y, tint }, glyphs) {
  glyphs.add(item.text, BADGE_STYLE.face);
  const [left, top] = [x + item.x, y + item.y];
  const rect = (extra) => `<rect x="${r(left)}" y="${r(top)}" width="${r(item.w)}" height="${item.h}" rx="${item.h / 2}" ${extra}/>`;
  const wash = item.kind === 'badge' && tint ? rect(`fill="${tint}" fill-opacity="${values.opacity.tag}"`) : '';
  return `<g class="fl-badge">${rect('class="badge-pill"')}${wash}<text x="${r(left + item.w / 2)}" y="${r(centerBaseline(top + item.h / 2, BADGE_STYLE.size))}" class="badge">${escapeXml(item.text)}</text></g>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 그룹 틀 범주색 덮개. 틀과 같은 사각형을 옅은 범주색으로 한 번 더 칠한다. */
export function drawGroupTint(g, tint) {
  return tint ? `<rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.w)}" height="${r(g.h)}" rx="${RADIUS['2xl']}" fill="${tint}" fill-opacity="${values.opacity.tag}" stroke="none"/>` : '';
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 개수 요약의 생략 표식(점 세 개). 흐름이 아래로(direction=down)면 세로로, 오른쪽이면 가로로 놓인다. */
export function drawEllipsis(it) {
  const [cx, cy] = [it.x + it.w / 2, it.y + it.h / 2];
  const pitch = SIZE.ellipsis.pitch;
  return [-1, 0, 1].map((k) => `<circle cx="${r(cx + (it.axis === 'right' ? k * pitch : 0))}" cy="${r(cy + (it.axis === 'right' ? 0 : k * pitch))}" r="${SIZE.ellipsis.dot}" class="ellipsis"/>`).join('');
}
