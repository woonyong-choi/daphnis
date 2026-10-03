// 이동 줄의 점 색(`tone=`)과 값 바꾸기(`set=`). 박자의 이동 줄이 쓰고, 흐름(track)은 flow.js가 같은 규칙으로 읽는다.
import { readOptions } from './options.js';
import { readSets } from './value.js';

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 식 수
// basis: estimate
/**
 * 이동의 tone=, set= 선택 사항 하나를 읽어 hop에 담는다. 같은 선택 사항을 두 번 쓰면 false다(호출한 쪽이 두 번 썼다는 오류를 낸다). 값 바꾸기는 흐름 그림에서만 쓴다.
 * @returns 이 낱말을 읽었으면 true(오류를 냈어도 true)
 */
export function readHopExtra(token, hop, { line, ctx }) {
  if (token.key === 'tone' ? hop.tone !== undefined : hop.sets.length > 0) return false;
  if (token.key === 'set' && ctx.figure.kind !== 'flow') {
    ctx.problems.error(line, 'set belongs to flow figures only, where value lines declare what changes');
    return true;
  }
  const found = readOptions([token], { scopes: ['hop'], what: 'a move', line, ctx });
  if (found.tone !== undefined) hop.tone = found.tone;
  if (found.set !== undefined) hop.sets = readSets(found.set, { line, ctx });
  return true;
}
