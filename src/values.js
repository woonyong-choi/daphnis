// 값(`value`) 모형 도우미. 단계가 보이는 값과 카드 줄을 시간표, 카드 크기 계산, 그림 검사가 같게 쓴다(docs/design/figure-syntax.md 값).
import { VALUE_MAX } from './source/grammar.js';

/** 카드 줄 폭을 재는 본보기 글. 값이 바뀌어도 줄 폭과 줄 수가 달라지지 않게 가장 넓은 자리를 미리 비워 둔다. */
export const VALUE_SAMPLE = '8'.repeat(VALUE_MAX);

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
/** 값 이름 → 선언. */
export function valueTable(figure) {
  return new Map(figure.values.map((v) => [v.id, v]));
}

// cost: time O(c), heap O(1), stack O(c)
// vars: c = 참조 사슬 길이
// basis: estimate
/** 참조를 끝까지 따라간 값 이름(from이 있는 값). 참조 순환은 읽을 때 오류라 여기서는 끝이 있다. */
export function rootOf(byId, id) {
  const { ref } = byId.get(id);
  return ref === undefined ? id : rootOf(byId, ref);
}

// cost: time O(v·(s + c)), heap O(s), stack O(c)
// vars: v = 값 수, s = 단계의 식 수, c = 참조 사슬 길이
// basis: estimate
/** 한 단계가 보여 주는 값(선언 순서). 그 단계의 식이 쓰는 값과, 그 값을 참조 사슬로 가리키는 값이다. 식이 건드리지 않는 값은 카드에 올리지 않는다. */
export function usedValues(figure, step) {
  if (!figure.values.length) return [];
  const byId = valueTable(figure);
  const targets = new Set([...step.beats.flatMap((b) => b.hops), ...step.tracks].flatMap((move) => move.sets.map((e) => e.id)));
  const isUsed = (v) => targets.has(v.id) || (v.ref !== undefined && isUsed(byId.get(v.ref)));
  return figure.values.filter(isUsed);
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
/** 단계의 값 카드 줄을 도형별로. 줄은 `이름` 글과 오른쪽 끝 자리(mark)이고, 값 글자는 시간표의 변화 목록이 따로 그린다. */
export function valueRowsByNode(figure, step) {
  const rows = new Map();
  for (const v of usedValues(figure, step)) rows.set(v.on, [...(rows.get(v.on) ?? []), { text: v.label, mark: VALUE_SAMPLE, isValue: true, valueId: v.id }]);
  return rows;
}
