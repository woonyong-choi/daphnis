// 원본이 고른 면, 테두리, 카드 바탕 색(`fill=`, `stroke=`, `card=`)을 그린다. 값은 문법 표의 paint 목록 이름이고, 색은 역할 토큰 `color.paint.<이름>`의 단계(fill, stroke)다.
// 고르지 않은 도형과 카드는 이 파일의 어떤 것도 쓰지 않아 출력이 그대로다. 고른 색의 CSS 규칙은 쓴 색에만 결과 파일에 들어간다.
import { tokens, values } from '../tokens.js';

const SPACE = values.space;
// 밝힌 도형의 후광: 테두리(border.strong) 바깥으로 틈(gap)을 두고 고리(ring)를 한 겹 더한다. 고리는 그 도형의 stroke 색이다.
const GLOW_WIDTH = values.border.strong + SPACE['2-5'] * 2;

/** 색 이름의 면 색 토큰 참조 */
export const fillOf = (name) => tokens.color.paint[name].fill;

/** 색 이름의 테두리 색 토큰 참조 */
export const strokeOf = (name) => tokens.color.paint[name].stroke;

/** 도형이 칠한 색 이름. 면을 먼저 보고, 없으면 테두리 색 이름이다. 외곽선은 이 색의 outline 단계다. */
export const paintOf = (item) => item.fill ?? item.stroke;

// cost: time O(s + g), heap O(c), stack O(1)
// vars: s = 도형 수, g = 그룹 수, c = 고른 색 수
// basis: estimate
/** 그림이 고른 색 이름 목록. { stroke, groupFill }은 도형 외곽선과 그룹 면에 쓴 이름이다. */
function usedPaints(scene) {
  return { stroke: [...new Set(scene.items.map(paintOf).filter(Boolean))], groupFill: [...new Set(scene.groups.map(paintOf).filter(Boolean))] };
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 고른 색 수, out = 만든 CSS 글자 수
// basis: estimate
/**
 * 고른 색의 CSS. 외곽선 색 클래스(`ps-이름`)는 평소 그 색의 outline 단계이고, 켜지면 같은 색의 진한 선(stroke) 단계로 굵어진다. 후광(`fl-halo`, 클래스 `ph-이름`)도 그 색의 옅은 면(fill) 단계다. 밝힘은 색을 바꾸지 않고 굵기와 후광만 더한다.
 * 그룹 면 클래스는 `pf-이름`이다. 쓴 색이 없으면 빈 글이다.
 */
export function paintCss(scene) {
  if (!scene) return '';
  const { stroke, groupFill } = usedPaints(scene);
  const rules = stroke.map((name) => `.fl .fl-node .fl-stroke.ps-${name} {\n  stroke: var(--color-paint-${name}-outline);\n}\n.fl .fl-node.on .fl-stroke.ps-${name} {\n  stroke: var(--color-paint-${name}-stroke);\n}\n.fl .fl-halo.ph-${name} > * {\n  stroke: var(--color-paint-${name}-fill);\n}`);
  for (const name of groupFill) {
    rules.push(`.fl .frame-box.pf-${name} {\n  fill: var(--color-paint-${name}-fill);\n}`);
    rules.push(`.fl .fl-group .frame-box.ps-${name} {\n  stroke: var(--color-paint-${name}-outline);\n}`);
    rules.push(`.fl .fl-group.on .fl-stroke.ps-${name} {\n  stroke: var(--color-paint-${name}-stroke);\n}`);
    rules.push(`.fl .frame.gt-${name} {\n  fill: var(--color-paint-${name}-ink);\n}`);
  }
  return rules.length ? `\n${rules.join('\n')}\n` : '';
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 윤곽 조각 수
// basis: estimate
/**
 * 후광: 켜졌을 때만 보이는 옅은 파랑 면. 도형 윤곽을 굵은 선으로 한 번 더 그려 테두리 바깥으로 번지게 한다.
 * @param pieces 도형 윤곽 조각. 닫지 않은 `<rect ...` 같은 글이다
 * @param option { cls, paint }. cls는 켜짐 class이고 paint는 도형이 칠한 색 이름(없으면 파랑 후광)이다
 */
export function drawHalo(pieces, { cls, paint }) {
  const ring = pieces.map((p) => `${p} stroke="${tokens.color.state.glow}" stroke-width="${GLOW_WIDTH}" stroke-linejoin="round"/>`).join('');
  return `<g class="fl-halo ${cls}${paint ? ` ph-${paint}` : ''}" fill="none" opacity="0">${ring}</g>`;
}
