// 이동 하나의 글 상자 계획. 자리 바꿈을 가장 적게 하고, 꼭 바꿔야 하면 짧게 미끄러지고, 그것도 안 되면 그 구간만 흐리게 한다(docs/design/playback.md 이동 글).
import { CHIP_GAP, chipCandidateAt, chipCandidates, sizeChip } from './chip.js';
import { issuesOf, settle, simplify } from './chip-fade.js';
import { boxAt, CHIP_FRAME_MS, dotAt, isHit, MOVE, NODE_MS } from './chip-motion.js';
import { progressAt } from './easing.js';
import { flattenRoute } from './route.js';
import { values } from './tokens.js';

export { CHIP_FRAME_MS, CHIP_VISIBLE_MIN, chipStateAt } from './chip-motion.js';

/** 글 상자가 점의 움직임에 더해 한 프레임에 움직일 수 있는 최대 거리(px). 미끄러지는 속도의 상한이다. */
export const CHIP_STEP_MAX = 6;
// 미끄러짐 시간(토큰)
const SLIDE_MS = values.duration['chip-slide'];
// 거리가 멀어 한 번에 못 미끄러질 때 미끄러짐 시간을 늘리는 배수
const SLIDE_STRETCH = [1, 2, 4];
// 자리 바꿈 후보로 보는 자리 수(좋은 순)
const BEAM = 6;
// 글 상자와 점 사이가 이보다 멀면 떨어졌다고 본다(가리는 것을 비켜 올린 최대 거리까지는 붙은 것이다)
const DETACH_GAP = CHIP_GAP * 2 + CHIP_GAP * 4;
// 비용 가중치. 겹침 > 자리 바꿈 > 떨어짐(DETACH_GAP을 넘은 px마다) > 가까운 선(넓이마다) > 위아래 끝 여백 > 선택 순서 순으로 크다. 바꿈 한 번이 지점 수백 개의 작은 비용 합보다 크다
const UNCLEAN_COST = 1e7;
const SWITCH_COST = 1e6;
const DETACH_COST_PER_PX = 2e4;
const NEAR_COST = 300;
const MARGIN_COST = 500;
const ORDER_COST = 100;

// cost: time O(n·(k·a + b²·s·a)), heap O(n·k), stack O(1)
// vars: n = 계획 지점 수, k = 후보 수, a = 피할 사각형 수, b = BEAM, s = 미끄러짐 프레임 수
// basis: estimate
/**
 * 이동 하나의 글 상자 계획. 계획 지점마다 후보를 재고, 자리 바꿈 횟수를 가장 적게 하는 후보 열을 동적 계획으로 고른다.
 * 바꿔야 하면 두 자리 사이를 시간에 선형으로 미끄러지고(중간 프레임이 모두 깨끗한 때만), 깨끗한 길이 없으면 바꾸지 않고 겹치는 구간만 흐리게 한다.
 * 움직이는 SVG와 재생기가 이 목록을 그대로 쓴다.
 * @returns { path, issues }. path는 이동 진행 비율 at(오름차순)마다 [at, dx, dy, opacity]이고, issues는 지점마다 { at, isOutside, hits }다
 */
export function planChip(scene, hop, avoid) {
  const ctx = { scene, hop, chip: sizeChip(hop.data), field: avoid.filter((o) => o.edge !== hop.edge), route: flattenRoute(scene.edges[hop.edge].points), dots: new Map() };
  ctx.hard = ctx.field.filter((o) => !o.soft);
  const times = nodeTimes(hop.ms);
  const descs = usefulDescs(ctx, times);
  const nodes = times.map((t) => ({ t, slots: slotsAt(ctx, t, descs) }));
  // 바꾸지 않고 가는 길이 바꿈 한 번보다 싸면 그것이 답이다. 바꿈 후보는 그렇지 않을 때만 잰다.
  let chosen = chooseSlots(ctx, nodes, false);
  if (chosen.cost >= SWITCH_COST) chosen = chooseSlots(ctx, nodes, true);
  const rest = settle(ctx, chosen.rest);
  const path = simplify(rest).map(({ t, dx, dy, opacity }) => [progressAt(MOVE, t / hop.ms), dx, dy, opacity]);
  // 이분 탐색의 오차를 없애 첫 지점은 정확히 0, 끝 지점은 정확히 1로 둔다.
  path[0][0] = 0;
  path.at(-1)[0] = 1;
  return { path, issues: issuesOf(rest, hop) };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 계획 지점 수
// basis: estimate
function nodeTimes(ms) {
  const count = Math.max(1, Math.ceil(ms / NODE_MS));
  return Array.from({ length: count + 1 }, (_, j) => Math.min(ms, j * NODE_MS));
}

// cost: time O(n·k·a), heap O(k), stack O(1)
// vars: n = 계획 지점 수, k = 후보 수, a = 피할 사각형 수
// basis: estimate
// 이동 중 어느 지점에서든 깨끗했던 자리 종류(key별 desc). 점 위 기본 자리는 깨끗한 때가 없어도 마지막 수단으로 넣는다.
// 후보는 점마다 가까운 사각형 때문에 생기고 사라지므로, 이 자리 종류를 모든 지점에서 다시 만들어야 같은 자리를 이동 내내 이을 수 있다.
function usefulDescs(ctx, times) {
  const descs = new Map();
  for (const t of times) {
    for (const c of chipCandidates(dotAt(ctx, t), ctx.chip, { scene: ctx.scene, avoid: ctx.field })) if (!c.isOutside && c.hits.length === 0) descs.set(c.key, c.desc);
  }
  const fallback = { row: ['above'], side: ['mid'], inset: 'gap' };
  return descs.set('above/mid/gap', fallback);
}

// cost: time O(k·a), heap O(k), stack O(1)
// vars: k = 자리 종류 수, a = 피할 사각형 수
// basis: estimate
// 시각 t에 자리 종류마다 만든 후보. key로 찾는다.
function slotsAt(ctx, t, descs) {
  const point = dotAt(ctx, t);
  const slots = new Map();
  for (const [key, desc] of descs) {
    const c = chipCandidateAt(point, ctx.chip, { scene: ctx.scene, avoid: ctx.field, desc });
    slots.set(key, { ...c, key, point, cost: unaryCost(c, point), isClean: !c.isOutside && c.hits.length === 0 });
  }
  return slots;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 후보 하나의 한 지점 비용. 겹침이나 그림 밖은 흐려져야 하므로 가장 크다.
function unaryCost({ rank: [, area, near, tight, crowded, order], box, isOutside, hits }, point) {
  const unclean = isOutside || hits.length ? UNCLEAN_COST + area : 0;
  const gap = Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.w), Math.max(box.y - point.y, 0, point.y - box.y - box.h));
  return unclean + near * NEAR_COST + (tight + crowded) * MARGIN_COST + order * ORDER_COST + Math.max(0, gap - DETACH_GAP) * DETACH_COST_PER_PX;
}

// cost: time O(n·(k + b²·s·a)), heap O(n·k), stack O(1)
// vars: n = 계획 지점 수, k = 후보 수, b = BEAM, s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 지점마다 가장 싼 누적 비용으로 이어지는 후보 열. 같은 key를 이으면 비용이 없고, 다른 key로 가려면 미끄러짐(SWITCH_COST)이 든다.
function chooseSlots(ctx, nodes, isSlideAllowed) {
  const best = nodes.map(() => new Map());
  nodes.forEach((node, j) => {
    for (const [key, slot] of node.slots) {
      const stay = best[j - 1]?.get(key);
      if (j === 0) best[j].set(key, { cost: slot.cost });
      else if (stay) best[j].set(key, { cost: stay.cost + slot.cost, prev: { j: j - 1, key } });
    }
    if (j > 0 && isSlideAllowed) addSlides(ctx, { nodes, best }, j);
  });
  return backtrack(nodes, best);
}

// cost: time O(b²·s·a), heap O(b), stack O(1)
// vars: b = BEAM, s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 지점 j에 닿는 미끄러짐. 앞 지점 j - m의 깨끗한 자리에서 j의 깨끗한 자리로, 미끄러짐 시간 배수마다 본다.
function addSlides(ctx, { nodes, best }, j) {
  const to = cleanOf(nodes[j].slots, (slot) => slot.cost);
  const linked = new Set();
  for (const stretch of SLIDE_STRETCH) {
    const from = Math.max(0, j - Math.ceil((SLIDE_MS * stretch) / NODE_MS));
    if (from === j || nodes[j].t - nodes[from].t < SLIDE_MS * stretch - NODE_MS) continue;
    const start = cleanOf(nodes[from].slots, (slot) => best[from].get(slot.key)?.cost ?? Infinity).filter((slot) => best[from].has(slot.key));
    for (const a of start) for (const b of to) if (!linked.has(`${a.key}>${b.key}`) && tryLink(ctx, { nodes, best }, { from, j, a, b })) linked.add(`${a.key}>${b.key}`);
  }
}

// cost: time O(s·a), heap O(1), stack O(1)
// vars: s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 두 자리가 다르고 미끄러짐이 가능하면 연결을 비용이 더 싸면 기록한다. 미끄러짐이 가능했는지를 돌려준다.
function tryLink(ctx, { nodes, best }, { from, j, a, b }) {
  if (a.key === b.key || !canSlide(ctx, [nodes[from], nodes[j]], [a, b])) return false;
  const cost = best[from].get(a.key).cost + SWITCH_COST + b.cost;
  if (cost < (best[j].get(b.key)?.cost ?? Infinity)) best[j].set(b.key, { cost, prev: { j: from, key: a.key } });
  return true;
}

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 후보 수
// basis: estimate
// 깨끗한 후보 가운데 비용이 낮은 BEAM개
function cleanOf(slots, costOf) {
  return [...slots.values()].filter((slot) => slot.isClean).sort((x, y) => costOf(x) - costOf(y)).slice(0, BEAM);
}

// cost: time O(s·a), heap O(1), stack O(1)
// vars: s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 두 자리 사이를 시간에 선형으로 미끄러질 때 속도가 상한 이하이고 모든 프레임이 깨끗한지. 가운데 프레임이 가장 먼저 걸리므로 가운데부터 잰다.
function canSlide(ctx, [first, last], [a, b]) {
  const span = last.t - first.t;
  if (Math.hypot(b.dx - a.dx, b.dy - a.dy) / (span / CHIP_FRAME_MS) > CHIP_STEP_MAX) return false;
  const times = [];
  for (let t = first.t + CHIP_FRAME_MS; t < last.t; t += CHIP_FRAME_MS) times.push(t);
  const middle = times.splice(times.length >> 1, 1);
  return [...middle, ...times].every((t) => {
    const ratio = (t - first.t) / span;
    return !isHit(ctx, boxAt(dotAt(ctx, t), ctx.chip, { dx: a.dx + (b.dx - a.dx) * ratio, dy: a.dy + (b.dy - a.dy) * ratio }));
  });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 계획 지점 수
// basis: estimate
// 끝 지점에서 가장 싼 후보부터 거꾸로 걸어 머무는 지점마다의 후보와 총비용을 모은다. 미끄러지는 동안의 지점은 건너뛴다.
function backtrack(nodes, best) {
  const last = nodes.length - 1;
  const [endKey, end] = [...best[last].entries()].reduce((a, b) => (b[1].cost < a[1].cost ? b : a));
  let key = endKey;
  const rest = [];
  for (let j = last; j >= 0; ) {
    const state = best[j].get(key);
    rest.push({ t: nodes[j].t, slot: nodes[j].slots.get(key) });
    [j, key] = state.prev ? [state.prev.j, state.prev.key] : [-1, key];
  }
  return { rest: rest.reverse(), cost: end.cost };
}
