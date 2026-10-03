// 값 선언(`value id "이름" on=도형 [from=값 | ref=값]`)과 값 바꾸기 식(`set="id+1@도형, id=낱말"`)을 읽는다. 이름이 선언됐는지는 value-check.js가 확인한다.
import { VALUE_MAX } from './grammar.js';
import { checkId } from './names.js';
import { readOptions } from './options.js';
import { ID_PATTERN, NUMBER_PATTERN } from './words.js';

const SIGNED_STEP = /^\d+(?:\.\d+)?$/;
// 식의 연산자 자리: 값 이름 바로 뒤
const OPERATOR = /^[+\-=]/;
// 소수 계산 오차(0.1 + 0.2)를 지우는 자릿수
const DECIMALS = 6;

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 값 선언 하나를 읽는다. from이 없고 ref도 없으면 0에서 시작한다. */
export function readValue({ tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return;
  if (label?.type !== 'text') {
    ctx.problems.error(line, `write a value as: value ${id.value} "name" on=node [from=value | ref=value]`);
    return;
  }
  const found = readOptions(rest, { scopes: ['value'], what: 'a value', line, ctx });
  if (found.on === undefined) ctx.problems.error(line, `a value shows on a node card. Add on=node, such as: value ${id.value} "${label.value}" on=node`);
  if (found.from !== undefined && found.ref !== undefined) ctx.problems.error(line, 'a value takes from= or ref=, not both. A reference always shows the value it points at');
  const from = found.ref === undefined ? readLiteral(found.from ?? '0', { line, key: 'from', ctx }) : undefined;
  ctx.figure.values.push({ id: id.value, label: label.value, on: found.on, from, ref: found.ref, line });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
/** 값 글자 하나(숫자나 공백 없는 낱말)를 확인하고 숫자는 간단한 꼴로 돌려준다. 어긋나면 오류를 내고 undefined다. */
export function readLiteral(text, { line, key, ctx }) {
  if ([...text].length > VALUE_MAX) {
    ctx.problems.error(line, `${key} is at most ${VALUE_MAX} characters. Found "${text}"`);
    return undefined;
  }
  return NUMBER_PATTERN.test(text) ? String(roundNumber(Number(text))) : text;
}

/** 소수 계산 오차를 지운 숫자 */
export function roundNumber(number) {
  return Number(number.toFixed(DECIMALS));
}

// cost: time O(e·v), heap O(e), stack O(1)
// vars: e = 식 수, v = 값 수
// basis: estimate
/**
 * `set="식, 식"`을 식 목록으로 읽는다. 식은 `id+N`, `id-N`, `id=N`, `id=낱말`, `id=다른id`(복사)이고 뒤에 `@도형`을 붙일 수 있다.
 * @returns { id, op, operand, isCopy, at, line }[]. op는 `+`, `-`, `=`다. 어긋난 식은 오류를 내고 뺀다
 */
export function readSets(text, { line, ctx }) {
  const ids = ctx.figure.values.map((v) => v.id).sort((a, b) => b.length - a.length);
  return text
    .split(',')
    .map((raw) => readExpression(raw.trim(), { ids, line, ctx }))
    .filter(Boolean);
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 값 수
// basis: estimate
// 식 하나. 값 이름은 `-`를 품을 수 있어 선언된 이름 가운데 식 앞머리와 같고 바로 뒤가 연산자인 가장 긴 것이다.
function readExpression(raw, { ids, line, ctx }) {
  const [body, at, ...extra] = raw.split('@');
  const id = ids.find((name) => body.startsWith(name) && OPERATOR.test(body.slice(name.length)));
  if (extra.length || at === '' || !id) {
    const guess = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z][A-Za-z0-9]*)*/.exec(body)?.[0];
    const hint = guess && !ids.includes(guess) && !extra.length ? ` Unknown value "${guess}". Declared: ${ids.join(', ') || 'none'}` : '';
    ctx.problems.error(line, `write a set expression as id+N, id-N, id=value, optionally followed by @node. Found "${raw}".${hint}`);
    return undefined;
  }
  const op = body[id.length];
  const operand = body.slice(id.length + 1);
  const expression = { id, op, operand, isCopy: false, at, line };
  if (op !== '=') return SIGNED_STEP.test(operand) ? { ...expression, operand: String(Number(operand)) } : fail(`"${raw}" needs a number after ${op}`, { line, ctx });
  if (ids.includes(operand)) return { ...expression, isCopy: true };
  if (operand === '') return fail(`"${raw}" needs a value after =`, { line, ctx });
  const literal = readLiteral(operand, { line, key: 'a set value', ctx });
  return literal === undefined ? undefined : { ...expression, operand: literal };
}

function fail(message, { line, ctx }) {
  ctx.problems.error(line, message);
  return undefined;
}
