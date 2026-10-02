// 순서 묶음(`layout=ordered`)의 elkjs 선택 사항. 자식을 선언 순서대로 흐름 방향(direction)에 한 줄로 놓고, 반대 축은 align(start, center, end)으로 맞춘다.
// 숨은 노드나 가짜 선을 쓰지 않는다. 자식마다 구분(partition) 번호를 주면 elkjs가 번호 순서대로 층을 나눠 한 층에 자식 하나가 놓인다(docs/design/layout.md 순서 묶음).

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 순서 묶음 그룹의 elkjs 선택 사항.
 * start는 elkjs의 기본 배치가 그대로 한쪽에 붙고, center는 단순 배치(SIMPLE)가 층마다 가운데에 놓는다.
 * end는 자리를 직접 줘야 하므로(INTERACTIVE) 첫 배치로 잰 자식 크기(model.first)가 있어야 하고, 아직 없으면 가운데 배치로 크기부터 잰다.
 */
export function orderedOptions(c, model) {
  const align = c.align ?? 'center';
  const strategy = align === 'end' && model.first ? 'INTERACTIVE' : 'SIMPLE';
  return {
    'elk.partitioning.activate': 'true',
    // 선이 없는 자식이 서로 다른 덩어리로 보여 다시 포장되지 않게 한다.
    'elk.separateConnectedComponents': 'false',
    ...(align === 'start' ? {} : { 'elk.layered.nodePlacement.strategy': strategy }),
  };
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 자식 수
// basis: estimate
/**
 * 순서 묶음의 자식(elkjs 노드 목록)에 구분 번호를 붙이고, end 정렬이면 반대 축 자리를 준다.
 * 자리는 가장 큰 자식 크기에 자식의 끝을 맞춘 값이다(오른쪽 흐름은 아래 끝, 아래 흐름은 오른쪽 끝).
 * @returns 같은 자식 목록(바꿔서 돌려준다)
 */
export function orderChildren(c, children, model) {
  const sizes = children.map((child) => (model.first?.has(child.id) ? { w: model.first.get(child.id).width, h: model.first.get(child.id).height } : { w: child.width, h: child.height }));
  const isRow = c.direction === 'right';
  const crossMax = Math.max(...sizes.map((s) => (isRow ? s.h : s.w)));
  children.forEach((child, i) => {
    child.layoutOptions = { ...child.layoutOptions, 'elk.partitioning.partition': String(i) };
    if (c.align === 'end' && model.first) Object.assign(child, isRow ? { x: 0, y: crossMax - sizes[i].h } : { x: crossMax - sizes[i].w, y: 0 });
  });
  return children;
}

// cost: time O(s), heap O(s), stack O(d)
// vars: s = 도형과 그룹 수, d = 그룹 깊이
// basis: estimate
/** 첫 배치 결과를 모형에 적는다. 도형과 그룹의 elkjs 결과(크기, 자리)를 아이디로 찾는다. end 정렬이 자식의 끝을 맞추는 데 쓴다. */
export function recordFirstPass(laid, model) {
  model.first = new Map();
  // cost: time O(s), heap O(s), stack O(d)
  // vars: s = 도형과 그룹 수, d = 그룹 깊이
  // basis: estimate
  const visit = (node) => {
    for (const child of node.children ?? []) {
      model.first.set(child.id, child);
      visit(child);
    }
  };
  visit(laid);
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 그룹 수
// basis: estimate
/** 첫 배치가 필요한 순서 묶음이 있는가. end 정렬은 자식 크기를 먼저 재야 한다. */
export function needsFirstPass(model) {
  return [...model.containers.values()].some((c) => c.layout === 'ordered' && c.align === 'end' && !c.region);
}
