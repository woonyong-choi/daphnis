// 원본이 고른 면, 테두리, 카드 바탕 색(`fill=`, `stroke=`, `card=`)을 그린다. 값은 문법 표의 paint 목록 이름이고, 색은 역할 토큰 `color.paint.<이름>`의 단계(fill, stroke)다.
// 고르지 않은 도형과 카드는 이 파일의 어떤 것도 쓰지 않아 출력이 그대로다. 고른 색의 CSS 규칙은 쓴 색에만 결과 파일에 들어간다.
import { TONES } from '../tone.js';
import { tokens } from '../tokens.js';

/** 색 이름의 면 색 토큰 참조 */
export const fillOf = (name) => tokens.color.paint[name].fill;

// 그룹 강조로 면까지 틴트로 칠하는 색 이름(틴트 단계 토큰 group-1이 있는 색 이름)과, 강조 그룹 안에서 깊이마다 한 단계씩 진해지는 틴트 단계 수 한계
const TINTED = new Set(TONES.filter((name) => tokens.color.paint[name]?.['group-1']));
const MAX_TINT_STEP = 2;

// cost: time O(d·g), heap O(1), stack O(1)
// vars: d = 그룹 중첩 깊이, g = 그룹 수
// basis: estimate
/**
 * 그룹 면을 칠하는 강조 틴트. 그룹 자신이나 가장 가까운 바깥 그룹이 sky나 purple을 골랐으면 { name, level }이다. 강조 그룹이 level 1이고 그 안으로 깊이마다 1씩 늘어 3에서 멈춘다. 강조 밖의 그룹은 undefined라 깊이 규칙의 회색을 쓴다.
 */
export function tintOf(group, scene) {
  let steps = 0;
  for (let up = group; up; up = scene.groups.find((g) => g.id === up.parent)) {
    if (TINTED.has(paintOf(up))) return { name: paintOf(up), level: Math.min(steps, MAX_TINT_STEP) + 1 };
    steps += 1;
  }
  return undefined;
}

/** 도형이 고른 색 이름. 테두리 색(stroke=)을 먼저 보고, 없으면 면 색(fill=)이다. 외곽선과 밝힌 테두리는 이 색의 단계다. */
export const paintOf = (item) => item.stroke ?? item.fill;

// cost: time O(s + g), heap O(c), stack O(1)
// vars: s = 도형 수, g = 그룹 수, c = 고른 색 수
// basis: estimate
/** 그림이 고른 색 이름 목록. { stroke, groupFill }은 도형 외곽선과 그룹 면에 쓴 이름이다. */
function usedPaints(scene) {
  return { stroke: [...new Set(scene.items.map(paintOf).filter(Boolean))], groupFill: [...new Set(scene.groups.map(paintOf).filter(Boolean))], tints: [...new Set(scene.groups.map((g) => tintOf(g, scene)).filter(Boolean).map(({ name, level }) => `${name}-${level}`))] };
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 고른 색 수, out = 만든 CSS 글자 수
// basis: estimate
/**
 * 고른 색의 CSS. 외곽선 색 클래스(`ps-이름`)는 그 색의 outline 단계이고 지금 단계나 호버가 색을 바꾸지 않는다(사용자가 고른 색을 상태가 덮지 않는다). 외곽선을 중복해서 그리지 않고 굵기는 유지한다.
 * 강조 그룹(fill=이나 stroke=로 색을 고른 그룹)은 그 색의 진한 단계(ink, 면 위 대비 3 이상) 1.5px 테두리와 같은 색 제목 글자를 쓴다. sky와 purple 강조는 면도 그 색의 옅은 틴트(`tint-이름-단계`)로 칠하고, 그 안의 그룹은 같은 색상각 틴트를 깊이마다 한 단계씩 진하게(다크는 밝게) 칠한다. 그 밖의 색은 면이 깊이 규칙의 회색이다. 쓴 색이 없으면 빈 글이다.
 */
export function paintCss(scene) {
  if (!scene) return '';
  const { stroke, groupFill, tints } = usedPaints(scene);
  // 도착 후광(.fl-pulse)은 같은 계열의 effect 단계(테두리를 같은 색상에서 밝힌 값)로 칠한다. 계열이 아닌 이름(gray)은 효과 단계가 없어 상태 파랑이다.
  const rules = stroke.flatMap((name) => [`.fl .fl-node .fl-stroke.ps-${name} {\n  stroke: var(--color-paint-${name}-outline);\n}`, ...(tokens.color.paint[name]?.effect ? [`.fl .fl-node .fl-pulse.ps-${name} {\n  stroke: var(--color-paint-${name}-effect);\n}`] : [])]);
  for (const name of groupFill) {
    rules.push(`.fl .fl-group .frame-box.ps-${name} {\n  stroke: var(--color-paint-${name}-ink);\n  stroke-width: var(--border-tag);\n}`);
    rules.push(`.fl .frame.gt-${name} {\n  fill: var(--color-paint-${name}-ink);\n}`);
  }
  for (const key of tints) rules.push(`.fl .frame-box.tint-${key} {\n  fill: var(--color-paint-${key.split('-')[0]}-group-${key.split('-')[1]});\n}`);
  return rules.length ? `\n${rules.join('\n')}\n` : '';
}
