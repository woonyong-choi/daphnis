// 순서 묶음, 개수 요약, 반복, 범주 표기의 원본 규칙. 파일을 다 읽은 뒤 흐름 그림에서 확인한다.
import { checkIcons } from './icons.js';

// cost: time O(g·n + g), heap O(n), stack O(1)
// vars: g = 그룹 수, n = 도형 수
// basis: estimate
/** 개수 요약(count)이 보이는 직접 자식 수 이상인지 보고, 아이콘 이름을 확인한다. */
export function checkDecor(figure, problems) {
  const shown = new Map();
  for (const item of [...figure.nodes, ...figure.groups]) if (item.parent) shown.set(item.parent, (shown.get(item.parent) ?? 0) + 1);
  for (const group of figure.groups) {
    const visible = shown.get(group.id) ?? 0;
    if (group.count !== undefined && group.count < visible) problems.error(group.line, `count=${group.count} is less than the ${visible} children shown in group "${group.id}". count is the total, so raise it or show fewer children`);
  }
  checkIcons(figure, problems);
}
