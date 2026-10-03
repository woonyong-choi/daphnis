// 값 선언과 값 바꾸기 식을 파일을 다 읽은 뒤 확인한다. 도형 이름, 참조 사슬, 식이 가리키는 값과 도형이 맞는지 본다.
import { CARD_SHAPES } from './grammar.js';
import { unknownName } from './problems.js';
import { NUMBER_PATTERN } from './words.js';


// cost: time O(v² + e·v), heap O(v), stack O(1)
// vars: v = 값 수, e = 식 수
// basis: estimate
/** 값 선언(놓일 도형, 참조 사슬)과 모든 이동, 흐름의 값 바꾸기 식을 확인한다. */
export function checkValues(figure, names, problems) {
  const byId = new Map(figure.values.map((v) => [v.id, v]));
  for (const value of figure.values) checkDeclaration(value, { byId, names, figure }, problems);
  if (!problems.errors.length) checkSets(figure, byId, problems);
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
// 값 하나: 놓일 도형이 카드를 쓰는 도형이고, 참조가 있는 값이며, 참조가 돌아 제자리로 오지 않는다.
function checkDeclaration(value, { byId, names, figure }, problems) {
  const target = names.get(value.on);
  if (value.on !== undefined && !target && !figure.rejectedNames.has(value.on)) problems.error(value.line, unknownName('node', value.on, figure.nodes.map((n) => n.id)));
  else if (target && !CARD_SHAPES.includes(target.shape)) problems.error(value.line, `a ${target.shape} has no card. Put a value on ${CARD_SHAPES.slice(0, 4).join(', ')}`);
  if (value.ref === undefined) return;
  if (!byId.has(value.ref)) {
    problems.error(value.line, unknownName('value', value.ref, byId.keys()));
    return;
  }
  const chain = [value.id];
  for (let next = value.ref; next !== undefined; next = byId.get(next).ref) {
    if (chain.includes(next)) {
      problems.error(value.line, `value "${value.id}" refers to itself through ${[...chain, next].join(' -> ')}. A reference chain must end at a value with from=`);
      return;
    }
    chain.push(next);
  }
}

// cost: time O(e·v), heap O(v), stack O(1)
// vars: e = 식 수, v = 값 수
// basis: estimate
// 식마다: 참조 값에 쓰지 않고, @도형이 경로 위에 있고, 낱말 값에 +, -를 쓰지 않는다.
function checkSets(figure, byId, problems) {
  const moves = movesOf(figure);
  const words = wordValues(moves, byId);
  for (const { sets, nodes } of moves) {
    for (const e of sets) {
      if (byId.get(e.id).ref !== undefined) problems.error(e.line, `"${e.id}" is a reference to "${byId.get(e.id).ref}". Set "${byId.get(e.id).ref}" instead, and "${e.id}" follows it`);
      else if (e.at !== undefined && !nodes.includes(e.at)) problems.error(e.line, `@${e.at} is not on this path (${nodes.join(' -> ')}). A set applies where the dot reaches a node on its path`);
      else if (e.op !== '=' && words.has(e.id)) problems.error(e.line, `"${e.id}${e.op}${e.operand}" does a sum, but "${e.id}" holds a word. Use = for words`);
    }
  }
}

// cost: time O(s·h), heap O(h), stack O(1)
// vars: s = 단계 수, h = 단계의 이동과 흐름 수
// basis: estimate
/** 식이 있는 이동과 흐름 모두. nodes는 경로의 도형 이름이다(칸 이름은 뗀다). */
export function movesOf(figure) {
  const base = (id) => id.split('.')[0];
  return figure.steps.flatMap((step) => [
    ...step.beats.flatMap((beat) => beat.hops.filter((h) => h.sets.length).map((h) => ({ sets: h.sets, nodes: [base(h.from), base(h.to)] }))),
    ...step.tracks.filter((t) => t.sets.length).map((t) => ({ sets: t.sets, nodes: t.path.map(base) })),
  ]);
}

// cost: time O(v·e), heap O(v), stack O(1)
// vars: v = 값 수, e = 식 수
// basis: estimate
// 낱말을 담는 값: 처음 값이 낱말이거나, 낱말을 쓰거나 낱말 값을 복사하는 식이 있는 값. 더 늘지 않을 때까지 돈다.
function wordValues(moves, byId) {
  const root = (id) => (byId.get(id).ref === undefined ? id : root(byId.get(id).ref));
  const words = new Set([...byId.values()].filter((v) => v.ref === undefined && !NUMBER_PATTERN.test(v.from)).map((v) => v.id));
  const sets = moves.flatMap((m) => m.sets);
  let size = -1;
  while (words.size !== size) {
    size = words.size;
    for (const e of sets) {
      const isWord = e.op === '=' && (e.isCopy ? words.has(root(e.operand)) : !NUMBER_PATTERN.test(e.operand));
      if (isWord && byId.get(e.id).ref === undefined) words.add(e.id);
    }
  }
  return words;
}
