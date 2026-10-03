// 흐름 단계 문장(`step ... for=시간`, `track a -> b -> c ...`)을 읽는다. 선이 있는지와 시간이 맞는지는 flow-check.js가 확인한다.
import { readOptions } from './options.js';
import { readSets } from './value.js';
import { parseTime } from './values.js';

const TRACK_FORM = 'write a track as: track a -> b -> c ["text"] [at=time] [every=time] [time=time] [tone=name] [set="id+1@node"]';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 선택 사항 수
// basis: estimate
/** 단계의 선택 사항(`for=`)을 읽어 단계 길이(ms)를 돌려준다. 없거나 틀리면 undefined다. */
export function readStepOptions(options, { line, ctx }) {
  const found = readOptions(options, { scopes: ['step'], what: 'a step', line, ctx });
  if (found.for === undefined) return undefined;
  const ms = parseTime(found.for);
  if (ms === undefined) ctx.problems.error(line, `for is a positive time such as 12s. Found "${found.for}"`);
  return ms;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 한 단계에 박자 줄(이동, show, light, say, wait)과 흐름 줄(track)을 섞으면 오류다. 한 단계의 시간이 두 가지 뜻이 되기 때문이다. */
export function checkMixedStep(word, line, ctx) {
  const { step, problems } = ctx;
  if (word === 'track' && step.beats.length) problems.error(line, 'a step takes beats (moves, show, light, say, wait) or tracks, not both. Put the track in its own step');
  else if (word !== 'track' && step.tracks.length) problems.error(line, `a step with tracks takes no "${word === 'hop' ? 'a -> b' : word}" line. Put it in its own step`);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `track a -> b -> c ["글"] [at=time] [every=time] [time=time] [tone=name] [set="식"]`
export function readTrack({ tokens, line }, ctx) {
  const { path, rest } = splitPath(tokens);
  const texts = rest.filter((t) => t.type === 'text');
  const options = rest.filter((t) => t.type === 'option');
  if (path.length < 2 || texts.length > 1 || rest.length > texts.length + options.length) {
    ctx.problems.error(line, TRACK_FORM);
    return;
  }
  const found = readOptions(options, { scopes: ['track'], what: 'a track', line, ctx });
  const time = (key, isZeroOk) => readTime(found[key], { key, isZeroOk, line, ctx });
  const track = { path, data: texts[0]?.value, atMs: time('at', true) ?? 0, everyMs: time('every'), timeMs: time('time'), tone: found.tone, sets: found.set === undefined ? [] : readSets(found.set, { line, ctx }), line };
  if (track.everyMs !== undefined && ctx.step.forMs === undefined) ctx.problems.error(line, 'every repeats departures until the step ends, so the step needs a length. Write: step "name" for=12s');
  ctx.step.tracks.push(track);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `track` 뒤 `이름 -> 이름 -> 이름`을 잇는 낱말을 이름 목록으로 읽고, 나머지 낱말을 돌려준다.
function splitPath(tokens) {
  const path = [];
  let i = 1;
  if (tokens[i]?.type === 'word') path.push(tokens[i++].value);
  while (path.length && tokens[i]?.type === 'arrow' && tokens[i + 1]?.type === 'word') {
    path.push(tokens[i + 1].value);
    i += 2;
  }
  return { path, rest: tokens.slice(i) };
}

// 시간 선택 사항 하나. 틀리면 오류를 내고 undefined다.
function readTime(text, { key, isZeroOk = false, line, ctx }) {
  if (text === undefined) return undefined;
  const ms = parseTime(text, isZeroOk);
  if (ms === undefined) ctx.problems.error(line, `${key} is ${isZeroOk ? 'a time such as 0s, 900ms, or 2s' : 'a positive time such as 900ms or 2s'}. Found "${text}"`);
  return ms;
}
