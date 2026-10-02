// 층 묶음. 순서 묶음 R의 자식이 모두 순서 묶음 G이고 G의 자식이 도형뿐이면(층 그래프), G 안 도형을 R의 층으로 펴서 한 번에 배치한다.
// G마다 elkjs 그룹을 따로 두면 층 사이 선이 그룹 경계 연결점을 세 번 거쳐 구불구불해지므로, 도형끼리의 선을 elkjs가 바로 잇게 하고 G의 틀은 도형 자리에서 그린다.
// 각 G는 R의 층 하나(구분 번호 하나)이고, 층 안의 도형은 반대 축으로 선언 순서대로 쌓인다(docs/design/layout.md 순서 묶음).
import { groupHead } from '../measure/sizes.js';
import { values } from '../tokens.js';

const SPACE = values.space;
const SIZE = values.size;
/** 층 틀과 안쪽 도형 사이 간격(옆, 아래)과 위(제목 줄) */
export const FRAME = Object.freeze({ side: SPACE['12'], bottom: SPACE['12'], top: SIZE.group.title + SPACE['6'] });
// 같은 층 도형 사이 간격(elkjs 도형 사이 간격과 같다)
const NODE_GAP = SPACE['16'];
// 이웃한 층 틀 사이에 남기는 최소 간격
const FRAME_GAP = SPACE['8'];
const ALIGN_BY_AXIS = { start: { right: 'LEFT', down: 'TOP' }, center: { right: 'CENTER', down: 'CENTER' }, end: { right: 'RIGHT', down: 'BOTTOM' } };
const TURNED = { right: 'down', down: 'right' };

// cost: time O(g·n + e), heap O(g), stack O(1)
// vars: g = 그룹 수, n = 도형 수, e = 선 수
// basis: estimate
/**
 * 층 묶음이 되는 그룹을 찾아 도형을 R의 자식으로 편다. 편 G는 isFlat이고 틀만 남는다.
 * 조건: R과 모든 자식 그룹이 순서 묶음이고, 자식은 도형뿐이며, G의 방향이 R의 반대 축이고, 선이 G에 직접 닿지 않는다.
 */
export function flattenRegions(model, edges) {
  const ended = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const r of model.containers.values()) {
    const groups = r.children.map((id) => model.containers.get(id));
    if (r.layout !== 'ordered' || !groups.length || !groups.every((g) => isLayer(g, r, { ended, model }))) continue;
    r.region = { groups: groups.map((g) => g.id) };
    for (const g of groups) g.isFlat = true;
    const leaves = groups.flatMap((g) => g.children);
    for (const id of leaves) Object.assign(model.nodes.get(id), { group: model.nodes.get(id).parent, parent: r.id, direction: r.direction });
    r.children = leaves;
  }
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 그룹 안 도형 수
// basis: estimate
// 층이 될 수 있는 그룹인가: 순서 묶음이고 자식이 도형뿐이고 R의 반대 축이며 선이 닿지 않는다.
function isLayer(g, r, { ended, model }) {
  return g?.layout === 'ordered' && g.direction === TURNED[r.direction] && !ended.has(g.id) && g.children.length > 0 && g.children.every((id) => !model.containers.has(id));
}

// cost: time O(g·n), heap O(g), stack O(1)
// vars: g = 층 수, n = 도형 수
// basis: estimate
// 층마다 크기: main은 흐름 방향 두께(층 안 도형 가운데 가장 두꺼운 것), cross는 반대 축으로 도형을 선언 순서로 쌓은 길이.
function layerSizes(c, model) {
  const isRow = c.direction === 'right';
  return c.region.groups.map((id) => {
    const sizes = model.containers.get(id).children.map((child) => outerSize(model.nodes.get(child)));
    return { main: Math.max(...sizes.map((s) => (isRow ? s.w : s.h))), cross: sizes.reduce((sum, s) => sum + (isRow ? s.h : s.w), 0) + NODE_GAP * (sizes.length - 1) };
  });
}

// 도형의 배치 사각형(바깥 여백 포함) 크기
function outerSize(n) {
  return { w: n.size.w + (n.size.marginSide ?? 0) * 2, h: n.size.h + n.size.marginTop + n.size.marginBottom };
}

// 층 덩어리의 반대 축 시작 자리. R의 align으로 가장 긴 덩어리에 맞춘다.
function offsetOf(align, { widest, cross }) {
  return { start: 0, center: (widest - cross) / 2, end: widest - cross }[align ?? 'center'];
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 자식 수
// basis: estimate
/**
 * 층 묶음 R의 elkjs 자식(도형 목록)에 층 번호(구분)와 반대 축 자리를 준다. 자리는 층마다 선언 순서로 쌓고, R의 align으로 층 덩어리끼리 맞춘 값이다.
 * 층 안 도형의 흐름 방향 맞춤은 그 층 G의 align이다.
 */
export function placeRegion(c, children, model) {
  const isRow = c.direction === 'right';
  const sizes = layerSizes(c, model);
  const widest = Math.max(...sizes.map((s) => s.cross));
  c.region.groups.forEach((id, i) => {
    let at = offsetOf(c.align, { widest, cross: sizes[i].cross });
    const align = ALIGN_BY_AXIS[model.containers.get(id).align ?? 'center'][c.direction];
    for (const child of children.filter((ch) => model.nodes.get(ch.id).group === id)) {
      Object.assign(child, { [isRow ? 'y' : 'x']: at, [isRow ? 'x' : 'y']: 0 });
      child.layoutOptions = { ...child.layoutOptions, 'elk.partitioning.partition': String(i), 'elk.alignment': align };
      at += (isRow ? child.height : child.width) + NODE_GAP;
    }
  });
  return children;
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 층 수
// basis: estimate
/**
 * 층 묶음 R의 elkjs 선택 사항: 층 번호 사용, 도형 자리 직접 지정, 선언 순서 고정, R 안쪽 여백(층 틀이 들어갈 자리), 층 사이 간격.
 * 층 틀은 제목 때문에 안쪽 도형보다 넓을 수 있어, 이웃한 틀이 겹치지 않도록 층 사이 간격을 그만큼 넓힌다.
 */
export function regionOptions(c, model) {
  const isRow = c.direction === 'right';
  const sizes = layerSizes(c, model);
  const widest = Math.max(...sizes.map((s) => s.cross));
  const reach = c.region.groups.map((id, i) => (Math.max(sizes[i][isRow ? 'main' : 'cross'] + FRAME.side * 2, titleWidth(model.containers.get(id))) - sizes[i][isRow ? 'main' : 'cross']) / 2);
  const gap = isRow ? Math.max(SPACE['30'], ...reach.slice(1).map((r, i) => reach[i] + r + FRAME_GAP)) : Math.max(SPACE['30'], FRAME.top + FRAME.bottom + FRAME_GAP);
  // 틀이 R 안쪽 여백 밖으로 나가지 않게, 옆으로 가장 멀리 나가는 만큼 여백을 더한다.
  const left = isRow ? reach[0] : Math.max(...reach.map((r, i) => r - offsetOf(c.align, { widest, cross: sizes[i].cross })));
  const right = isRow ? reach.at(-1) : Math.max(...reach.map((r, i) => r - (widest - sizes[i].cross - offsetOf(c.align, { widest, cross: sizes[i].cross }))));
  return {
    'elk.partitioning.activate': 'true',
    'elk.separateConnectedComponents': 'false',
    'elk.layered.nodePlacement.strategy': 'INTERACTIVE',
    'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
    'elk.layered.spacing.nodeNodeBetweenLayers': String(gap),
    'elk.padding': `[top=${FRAME.top * 2},left=${FRAME.side + Math.max(0, left)},bottom=${FRAME.bottom * 2},right=${FRAME.side + Math.max(0, right)}]`,
  };
}

// 층 틀의 최소 너비: 제목 줄(아이콘, 제목, 배지)에 양옆 안쪽 간격을 더한 값
function titleWidth(g) {
  return groupHead(g).w + SPACE['9'] * 2;
}

// cost: time O(g·n), heap O(g), stack O(1)
// vars: g = 층 수, n = 도형 수
// basis: estimate
/**
 * 층마다 틀을 그릴 자리(그림 좌표)를 안쪽 도형 자리에서 구한다. 틀은 도형 덩어리에 옆, 아래 여백과 위 제목 줄을 더하고, 제목이 더 넓으면 가운데에서 넓힌다.
 * @param items 도형 사각형(몸통)에 group(속한 층)이 있는 목록
 * @returns { id, x, y, w, h }[] 층 순서
 */
export function regionFrames(c, items, model) {
  return c.region.groups.map((id) => {
    const mine = items.filter((it) => it.group === id);
    const [x0, x1] = [Math.min(...mine.map((it) => it.x - (it.marginSide ?? 0))), Math.max(...mine.map((it) => it.x + it.w + (it.marginSide ?? 0)))];
    const [y0, y1] = [Math.min(...mine.map((it) => it.y - it.marginTop)), Math.max(...mine.map((it) => it.y + it.h + it.marginBottom))];
    const w = Math.max(x1 - x0 + FRAME.side * 2, titleWidth(model.containers.get(id)));
    return { id, x: (x0 + x1) / 2 - w / 2, y: y0 - FRAME.top, w, h: y1 - y0 + FRAME.top + FRAME.bottom };
  });
}
