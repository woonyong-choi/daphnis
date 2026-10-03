// 값 바꾸기(`set=`)를 시각 순서로 적용해 값 줄마다 값이 바뀌는 시각과 새 값을 구한다. 박자 단계와 흐름 단계가 같은 규칙을 쓴다(docs/design/playback.md 값 변화).
import { arrivalOffsetMs } from './easing.js';
import { NUMBER_PATTERN } from './source/words.js';
import { roundNumber } from './source/value.js';
import { rootOf, usedValues, valueTable } from './values.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 식이 적용되는 시각(ms). 점이 그 도형에 닿는 시각이다. `@도형`이 없으면 경로의 마지막 도형이다.
function reachAt(move, expression) {
  const k = expression.at === undefined ? move.nodes.length - 1 : move.nodes.indexOf(expression.at);
  return move.start + arrivalOffsetMs(move.fracs[k], move.ms);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 식 하나를 적용한 새 값 글. 숫자가 아닌 값에 합을 하는 식은 읽을 때 오류라 여기서는 오지 않는다.
function applyExpression(e, state, byId) {
  if (e.op === '=') return e.isCopy ? state.get(rootOf(byId, e.operand)) : e.operand;
  const sign = e.op === '-' ? -1 : 1;
  return NUMBER_PATTERN.test(state.get(e.id)) ? String(roundNumber(Number(state.get(e.id)) + sign * Number(e.operand))) : undefined;
}

// cost: time O(e·(log e + w)), heap O(e + w), stack O(1)
// vars: e = 식 수, w = 단계가 보이는 값 수
// basis: estimate
/**
 * 단계 하나의 값 줄. 단계가 시작할 때 모든 값이 from으로 돌아가고, 식을 닿는 시각 순서로(같은 시각은 적은 순서로) 적용한다.
 * 참조 값은 가리키는 값이 바뀌는 같은 시각에 같은 글로 바뀐다. 글이 그대로면 바뀐 것이 아니라 변화를 적지 않는다.
 * @param moves 식이 있는 이동과 흐름 { start, ms, nodes, fracs, sets }. start는 그림 전체 시각(ms), fracs는 nodes가 경로 길이의 어느 비율에 있는지다
 * @param span { si, t0, t1 }. 단계 번호와 단계의 시작과 끝 시각
 * @returns { si, id, node, t0, t1, initial, changes: [[시각, 새 글]] }[]
 */
export function valueRows(figure, step, { moves, span }) {
  const shown = usedValues(figure, step);
  if (!shown.length) return [];
  const byId = valueTable(figure);
  const state = new Map(figure.values.filter((v) => v.ref === undefined).map((v) => [v.id, v.from]));
  const textOf = (id) => state.get(rootOf(byId, id));
  const rows = shown.map((v) => ({ si: span.si, id: v.id, node: v.on, t0: span.t0, t1: span.t1, initial: textOf(v.id), changes: [] }));
  const events = moves.flatMap((move, mi) => move.sets.map((e, ei) => ({ t: reachAt(move, e), order: mi * 1000 + ei, e })));
  events.sort((a, b) => a.t - b.t || a.order - b.order);
  for (const { t, e } of events) {
    const next = applyExpression(e, state, byId);
    if (next === undefined || next === state.get(e.id)) continue;
    state.set(e.id, next);
    for (const row of rows) if (textOf(row.id) !== (row.changes.at(-1)?.[1] ?? row.initial)) row.changes.push([t, textOf(row.id)]);
  }
  return rows;
}
