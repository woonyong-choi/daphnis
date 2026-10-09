// 보기(`view id graph|sequence|plot|time ...`)를 읽는다. 보기는 같은 문서의 카드를 다른 방식으로 보이는 판이다. 카드는 여러 보기에 함께 놓일 수 있다.
import { VALUES, valueNames } from './grammar.js';
import { checkId } from './names.js';
import { ID_PATTERN } from './words.js';

// 블록이 꼭 있어야 하는 보기 방식. 그래프는 블록을 생략하면 남은 카드를 모두 담는다.
const NEEDS_BLOCK = new Set(['sequence', 'plot', 'time']);

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 보기 하나를 연다. `view id graph [right|down] ["이름"] [{]`, `view id sequence|plot|time ["이름"] {`. */
export function readView({ tokens, line }, ctx) {
  const [, id, strategy, ...rest] = tokens;
  const { problems, figure } = ctx;
  const isOpen = rest.at(-1)?.type === 'open';
  const body = isOpen ? rest.slice(0, -1) : rest;
  const reject = () => {
    if (isOpen) ctx.block = { kind: 'view', card: { id: id?.value, members: [], isRejected: true, line }, line };
  };
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return reject();
  if (strategy?.type !== 'word' || !valueNames('viewStrategy').includes(strategy.value)) {
    problems.error(line, `a view is one of ${valueNames('viewStrategy').join(', ')}. Found "${strategy?.value ?? ''}"`);
    return reject();
  }
  const direction = body.find((t) => t.type === 'word');
  const label = body.find((t) => t.type === 'text');
  const extra = body.filter((t) => t !== direction && t !== label);
  if (extra.length || (direction && (strategy.value !== 'graph' || !valueNames('direction').includes(direction.value)))) {
    problems.error(line, direction && strategy.value !== 'graph' ? `${strategy.value} takes no direction` : `write view as: view ${id.value} ${strategy.value} ${strategy.value === 'graph' ? '[right|down] ' : ''}["label"]${NEEDS_BLOCK.has(strategy.value) ? ' {' : ''}`);
    return reject();
  }
  if (NEEDS_BLOCK.has(strategy.value) && !isOpen) problems.error(line, `a ${strategy.value} view lists its cards in a block: view ${id.value} ${strategy.value} {`);
  const view = { id: id.value, strategy: strategy.value, direction: direction?.value ?? VALUES.direction.default, label: label?.value, members: isOpen ? [] : undefined, line };
  figure.views.push(view);
  if (isOpen) ctx.block = { kind: 'view', card: view, line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 보기 블록 안 줄. `}`면 닫고, 아니면 카드 이름을 한 줄에 여럿 적는다. */
export function readViewLine({ tokens, line, hasLexError }, ctx) {
  const { card } = ctx.block;
  if (tokens[0].type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = undefined;
    return;
  }
  if (hasLexError || card.isRejected) return;
  for (const t of tokens) {
    if (t.type !== 'word') {
      ctx.problems.error(line, `a view block lists card names. Found "${t.value}"`, { column: t.column });
      continue;
    }
    if (card.members.some((m) => m.id === t.value)) ctx.problems.error(line, `"${t.value}" is already listed in view "${card.id}"`, { column: t.column });
    else card.members.push({ id: t.value, line, column: t.column });
  }
}
