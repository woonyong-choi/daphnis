// 도형 선언(`box id "이름" ["부제"] [shape=circle]`)을 읽는다.
import { STATEMENTS, valueNames } from './grammar.js';
import { checkId, currentGroup, rejectName } from './names.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `box id "이름" ["부제"] [shape=circle]`. 사람, 갈림길, 상태는 부제가 없다. 모양(shape)은 box만 받고 원은 부제가 없다.
export function readNode({ tokens, line }, ctx) {
  const [head, id, label, ...tail] = tokens;
  const shape = head.value;
  const takesSub = STATEMENTS[shape].node.hasSub;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return rejectName(id, ctx);
  if (label?.type !== 'text') {
    ctx.problems.error(line, `write ${shape} as: ${shape} ${id.value} "${shape === 'decision' ? 'question' : 'name'}"`);
    return;
  }
  const options = shape === 'box' ? tail.filter((t) => t.type === 'option' && t.key === 'shape') : [];
  const [sub, ...rest] = tail.filter((t) => !options.includes(t));
  if (sub && (sub.type !== 'text' || !takesSub)) ctx.problems.error(line, takesSub ? 'the subtitle must be quoted text' : `${shape} takes no subtitle`);
  if (rest.length) ctx.problems.error(line, `${shape} takes no more words or options`);
  const form = readShape(options, line, ctx);
  if (form === 'circle' && sub) ctx.problems.error(line, 'a circle takes a name only. Remove the subtitle or shape=circle');
  ctx.figure.nodes.push({ id: id.value, shape: form ?? shape, label: label.value, sub: sub?.type === 'text' ? sub.value : undefined, parent: currentGroup(ctx), line });
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 선택 사항 수
// basis: estimate
// `shape=` 선택 사항. 한 번만 쓰고 값은 값 목록 안이어야 한다. 모양 이름을 돌려준다(없으면 undefined).
function readShape(options, line, ctx) {
  let form;
  for (const t of options) {
    if (form !== undefined) ctx.problems.error(line, '"shape" is written twice');
    else if (t.valueType !== 'word' || !valueNames('shape').includes(t.value)) ctx.problems.error(line, `shape is one of ${valueNames('shape').join(', ')}`);
    else form = t.value;
  }
  return form === 'rect' ? undefined : form;
}
