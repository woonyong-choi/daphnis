import { values } from '../tokens.js';

// 격자 칸과 원 도형에 이은 선의 연결점과, 격자 안 선 조각(lead). 칸 자리와 통로는 measure/grid-links.js가 정하고, 여기서는 그림 방향에 맞는 면을 고른다(docs/design/layout.md 도형 크기와 연결점).

// 그림 방향마다 나가는 선과 들어오는 선이 앞에서부터 고르는 면. 칸이 걸친 첫 면에 바로 나가고, 걸친 면이 없으면 통로 연결(LANE)이다.
const SIDES_BY = { right: { out: ['EAST'], in: ['WEST'] }, down: { out: ['SOUTH', 'EAST'], in: ['NORTH', 'WEST'] } };
// 원은 면의 가운데에만 닿는다. 들어오는 선이 늘면 다음 면의 가운데를 쓴다(합류 연산 입력). 나가는 선은 모두 오른쪽 면 가운데에서 갈라진다(한 원에서 여러 곳으로 퍼지는 연결).
// 층 안 원의 연결점 간격과, 그 간격이 넘지 못하는 지름 비율
const PORT_STEP = values.space['3'];
const PORT_SPREAD = 0.7;
const LAYER_SIDES = { right: { out: ['EAST'], in: ['WEST'] }, down: { out: ['SOUTH'], in: ['NORTH'] } };
const CIRCLE_SIDES = { out: ['EAST'], in: ['WEST', 'NORTH', 'SOUTH'] };

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 격자 칸에 이은 선 끝의 연결점 { side, position, lead }. lead는 칸 면에서 격자 테두리까지의 점(격자 좌표)이다. */
export function cellPort(node, end) {
  const plan = node.size.cellEnds[`${end.edge.index}:${end.way}`];
  const chosen = SIDES_BY[node.direction][end.way].map((side) => plan[side]).find(Boolean) ?? plan.LANE;
  return { side: chosen.side, position: chosen.port, lead: chosen.lead };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 도형의 연결점 수
// basis: estimate
/**
 * 원 도형의 연결점. 같은 방향 선이 늘면 다음 면의 가운데를 쓴다.
 * 층 안의 원(group)은 선이 모두 흐름 방향 면 하나에 닿고, 그 면 위에서 선마다 `space.3`씩 떨어진 원 둘레 점을 쓴다. 한 점에 선이 겹치지 않아 나란한 선이 붙지 않는다.
 */
export function circlePort(node, way) {
  const index = node.ports.filter((p) => p.way === way).length;
  if (node.group !== undefined) return layerPort(node, way, index);
  const sides = CIRCLE_SIDES[way];
  const side = sides[index % sides.length];
  const { w, h } = node.size;
  const spots = { EAST: { x: w, y: h / 2 }, WEST: { x: 0, y: h / 2 }, SOUTH: { x: w / 2, y: h }, NORTH: { x: w / 2, y: 0 } };
  return { side, position: spots[side] };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 층 안 원의 연결점. 면 가운데를 중심으로 선 수만큼 PORT_STEP 간격으로 늘어놓고, 둘레 위 점(면 가운데에서 d만큼 떨어진 곳)에 둔다. 원 둘레를 벗어나지 않도록 간격은 지름의 35% 안으로 묶는다.
function layerPort(node, way, index) {
  const { w, h } = node.size;
  const side = LAYER_SIDES[node.direction][way][0];
  const count = node.lineCount[way];
  const step = count > 1 ? Math.min(PORT_STEP, (w * PORT_SPREAD) / (count - 1)) : 0;
  const d = (index - (count - 1) / 2) * step;
  const r = w / 2;
  // 둘레 위 점. 면 가운데에서 d만큼 비껴 간 만큼 안쪽(면에서 r - sqrt(r² - d²))에 놓인다.
  const inset = r - Math.sqrt(r * r - d * d);
  const spots = { EAST: { x: w - inset, y: h / 2 + d }, WEST: { x: inset, y: h / 2 + d }, SOUTH: { x: w / 2 + d, y: h - inset }, NORTH: { x: w / 2 + d, y: inset } };
  return { side, position: spots[side] };
}

// 같은 격자의 두 칸을 잇는 선인지
export function isInnerEdge(edge) {
  return Boolean(edge.fromCell && edge.toCell && edge.from === edge.to);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * 선의 경로에 격자 안 선 조각을 잇는다. 나가는 쪽은 앞에, 들어오는 쪽은 뒤에 붙인다. 같은 격자의 두 칸을 잇는 선은 elkjs를 거치지 않고 격자 안 경로가 전부다.
 * @param points elkjs 경로(그림 좌표). 선 끝 연결점에서 시작하고 끝난다
 */
export function withLeads(points, edge, { model, rects }) {
  if (isInnerEdge(edge)) return shifted(model.nodes.get(edge.from).size.cellRoutes[edge.index], rects.get(edge.from));
  const front = leadAt(edge, 'out', { model, rects });
  const back = leadAt(edge, 'in', { model, rects });
  return [...front.slice(0, -1), ...points, ...back.reverse().slice(1)];
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// 격자 좌표의 점들을 도형 자리만큼 옮긴다.
function shifted(points, rect) {
  return points.map((p) => ({ x: rect.x + p.x, y: rect.y + p.y }));
}

// cost: time O(q + p), heap O(p), stack O(1)
// vars: q = 도형의 연결점 수, p = lead 점 수
// basis: estimate
// 선 끝 연결점이 가진 lead를 그림 좌표로. 없으면 빈 목록이다.
function leadAt(edge, way, { model, rects }) {
  const id = way === 'out' ? edge.from : edge.to;
  const port = model.nodes.get(id)?.ports.find((p) => p.id === `${id}::${way}::${edge.index}`);
  return port?.lead ? shifted(port.lead, rects.get(id)) : [];
}
