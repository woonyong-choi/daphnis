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
  defaultOrderedHeads(figure);
}

// cost: time O(e·d), heap O(n + g), stack O(1)
// vars: e = 선 수, d = 그룹 깊이, n = 도형 수, g = 그룹 수
// basis: estimate
// 순서 묶음 안에서 양 끝이 이어지는 선은 화살촉을 생략하면 없는 쪽(head=none)이다. 층 그래프의 전연결에서 화살촉이 한 점에 몰리지 않게 하기 위해서다. 묶음 밖 선과 head를 적은 선은 옛 뜻 그대로다.
function defaultOrderedHeads(figure) {
  const parent = new Map([...figure.nodes, ...figure.groups].map((item) => [item.id, item.parent]));
  const ordered = new Set(figure.groups.filter((g) => g.layout === 'ordered').map((g) => g.id));
  // cost: time O(d), heap O(d), stack O(1)
  // vars: d = 그룹 깊이
  // basis: estimate
  const chain = (id) => {
    const found = new Set();
    for (let p = parent.get(id); p; p = parent.get(p)) if (ordered.has(p)) found.add(p);
    return found;
  };
  for (const edge of figure.edges) {
    if (edge.head === undefined && [...chain(edge.from)].some((g) => chain(edge.to).has(g))) edge.head = 'none';
  }
}
