// 시간 흐름 문장(scene과 박자 줄)을 읽는다. 이름이 선언됐는지는 validate.js가 확인한다.
import { readStepOptions, readTrack, checkMixedStep } from './flow.js';
import { readActivation } from './sequence-life.js';
import { parseMiniGraph } from './minigraph.js';
import { readMoveOptions } from './move-options.js';
import { isOverTimeLimit, overLimitMessage, parseNumber, parseTime } from './values.js';
import { flagNames, optionsOf, valueNames, VALUES } from './grammar.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 시간 흐름 문장 하나를 읽어 지금 장면에 더한다. word는 문장 첫 낱말이거나 이동 줄이면 'hop'이다. */
export function readTimeline(word, statement, ctx) {
  const handlers = { scene: readScene, hop: readHops, track: readTrack, show: readShow, clear: readClear, light: readLight, wait: readWait, note: readNote, reveal: readReveal, activate: readActivation, deactivate: readActivation };
  if (word !== 'scene') checkMixedStep(word, statement.line, ctx);
  handlers[word](statement, ctx);
}

/** 빈 박자. 박자 줄마다 하나씩 만든다. */
export function emptyBeat(line) {
  return { line, hops: [], ops: [], light: [], chartLight: [], waitMs: 0, reveal: [], notes: [], isPause: false };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `scene "이름" [mode=static|once|loop] [speed=1] [for=12s] [keep="값, 값"] [set="식, 식"] [status="도형=종류"]`
function readScene({ tokens, line }, ctx) {
  const plain = tokens.filter((t) => t.type !== 'option');
  const [, label, surplus] = plain;
  if (label?.type !== 'text' || surplus) {
    const column = label?.type === 'text' ? surplus.column : undefined;
    ctx.problems.error(line, 'write a scene as: scene "name" [mode=static|once|loop] [speed=1] [for=12s] [keep=names] [set=exprs] [status=list]', { column });
  }
  // `--scene`은 숫자 모양 값을 장면 번호로 읽는다. 숫자만으로 된 이름은 번호와 겹쳐 이름으로 고를 수 없으므로 받지 않는다.
  if (label?.type === 'text' && /^\d+$/.test(label.value)) ctx.problems.error(line, `scene "${label.value}" is only digits, which --scene reads as a scene number. Add a word to the name, such as "step ${label.value}"`);
  const options = tokens.filter((t) => t.type === 'option');
  const { forMs, keep, sets, status } = readStepOptions(options.filter((t) => t.key !== 'mode' && t.key !== 'speed'), { line, ctx });
  const { mode, speed } = readPlayback(options, { line, ctx });
  ctx.step = { label: label?.value ?? '', mode, speed, line, beats: [], tracks: [], forMs, keep, sets, status, hasConditions: false };
  ctx.figure.steps.push(ctx.step);
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 선택 사항 수
// basis: estimate
// 장면의 재생 방식. mode는 static, once, loop이고 적지 않으면 줄이 있는 장면은 once, 줄이 없는 장면은 static이다(validate.js가 줄을 센 뒤 정한다).
// speed는 0보다 큰 유한한 숫자(기본 1)다. 재생 속도일 뿐 시간표의 ms는 바꾸지 않는다.
function readPlayback(options, { line, ctx }) {
  const modeToken = options.find((t) => t.key === 'mode');
  const speedToken = options.find((t) => t.key === 'speed');
  for (const key of ['mode', 'speed']) if (options.filter((t) => t.key === key).length > 1) ctx.problems.error(line, `"${key}" is written twice`);
  let mode;
  if (modeToken) {
    if (modeToken.valueType !== 'word' || !valueNames('sceneMode').includes(modeToken.value)) ctx.problems.error(line, `mode is one of ${valueNames('sceneMode').join(', ')}. Found "${modeToken.value}"`);
    else mode = modeToken.value;
  }
  let speed = 1;
  if (speedToken) {
    const number = parseNumber(speedToken.value);
    if (speedToken.valueType !== 'word' || number === undefined || !(number > 0)) ctx.problems.error(line, `speed is a number above 0, such as speed=2. Found "${speedToken.value}"`, { code: 'invalid-speed' });
    else speed = number;
  }
  return { mode, speed };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `a -> b "글" time=3s & c -> d`. 순서 보기에 보이는 이동은 메시지 하나이고 글이 필수다(validate.js가 확인한다).
function readHops({ tokens, line }, ctx) {
  const beat = pushBeat(ctx, line);
  const groups = [[]];
  for (const t of tokens) {
    if (t.type === 'amp') groups.push([]);
    else groups.at(-1).push(t);
  }
  for (const group of groups) {
    const [from, arrow, to, ...rest] = group;
    if (from?.type !== 'word' || arrow?.type !== 'arrow' || to?.type !== 'word') {
      ctx.problems.error(line, 'write a move as: a -> b ["text"] [time=2s]');
      continue;
    }
    const stuck = rest.filter((t) => t.type === 'word' && t.value === 'stuck');
    if (stuck.length > 1) ctx.problems.error(line, 'stuck is written twice in one move');
    const { timeMs, tone, sets, lost, condition } = readMoveOptions(rest.filter((t) => t.type === 'option'), { scope: 'hop', line, ctx, isStuck: stuck.length > 0 });
    const hop = { from: from.value, to: to.value, data: undefined, timeMs, dashed: false, tone, sets, lost, ...(condition ? { condition } : {}), line };
    for (const t of rest.filter((w) => w.type !== 'option' && !stuck.includes(w))) readHopWord(t, hop, { line, ctx });
    if (hop.create) hop.dashed = true;
    beat.hops.push(hop);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이동 줄의 글과 순서 보기의 dashed, create, destroy. 선택 사항(time=, tone=, set=)은 readMoveOptions가 읽는다.
function readHopWord(t, hop, { line, ctx }) {
  if (t.type === 'text' && hop.data === undefined) hop.data = t.value;
  else if (t.type === 'word' && ['dashed', 'create', 'destroy'].includes(t.value) && !hop[t.value]) hop[t.value] = true;
  else if ((t.type === 'text' && hop.data !== undefined) || (['dashed', 'create', 'destroy'].includes(t.value) && hop[t.value])) ctx.problems.error(line, `${t.type === 'text' ? 'the move text' : t.value} is written twice in one move`);
  else ctx.problems.error(line, `a move takes a quoted text, time=, tone=, set=, lost=, when=, wait=, timeout=, else=, and stuck. Found "${t.value}"`);
}

// cost: time O(t + g), heap O(g), stack O(1)
// vars: t = 문장 낱말 수, g = 관계 그래프 글자 수
// basis: estimate
// `show id "글" [tag=".."] [tone=..] [meta=".."] [mark=".."] [mono]` 또는 `show id graph "가 -> 나" [lit=".."]`
function readShow({ tokens, line }, ctx) {
  const [, id, first, ...rest] = tokens;
  if (id?.type !== 'word') {
    ctx.problems.error(line, 'write show as: show id "text"');
    return;
  }
  const beat = attachBeat(ctx, line);
  if (first?.type === 'word' && first.value === 'graph') {
    const [text, ...more] = rest;
    if (text?.type !== 'text') {
      ctx.problems.error(line, 'write a graph row as: show id graph "a -> b; a -> c" [lit="a"]');
      return;
    }
    const lit = more.find((t) => t.type === 'option' && t.key === 'lit' && t.valueType === 'text');
    if (more.length !== (lit ? 1 : 0)) ctx.problems.error(line, 'a graph row takes only lit="names"');
    const graph = parseMiniGraph(text.value, lit?.value ?? '');
    if (graph.error) ctx.problems.error(line, graph.error);
    else beat.ops.push({ type: 'show', node: id.value, row: { graph }, line });
    return;
  }
  if (first?.type !== 'text') {
    ctx.problems.error(line, 'write show as: show id "text"');
    return;
  }
  const row = { text: first.value };
  for (const t of rest) readRowOption(t, row, { line, ctx });
  checkRowLengths(row, line, ctx);
  checkRowTone(row, line, ctx);
  row.appearance ??= VALUES.appearance.default;
  beat.ops.push({ type: 'show', node: id.value, row, line });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 색 선택 사항 둘의 짝. tone은 태그 알약을 칠하거나(plain), appearance=filled|outline일 때 카드 줄 내용의 면과 경계를 칠한다. filled와 outline은 칠할 색(tone)이 있어야 한다.
function checkRowTone(row, line, ctx) {
  const isPlain = (row.appearance ?? VALUES.appearance.default) === 'plain';
  if (!isPlain && row.tone === undefined) ctx.problems.error(line, `appearance=${row.appearance} needs tone. Add tone=name or use appearance=plain`);
  else if (row.tone !== undefined && row.tag === undefined && isPlain) ctx.problems.error(line, 'tone colors a tag or, with appearance=filled|outline, the card. Add tag="..." or appearance, or remove tone');
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 선택 사항 수
// basis: estimate
// 글자 수 상한이 있는 선택 사항(mark)을 넘으면 오류다. 카드 오른쪽 끝에 들어갈 자리가 정해져 있기 때문이다.
function checkRowLengths(row, line, ctx) {
  for (const [key, spec] of Object.entries(optionsOf('show'))) {
    const isTooLong = spec.maxLength && row[key] !== undefined && [...row[key]].length > spec.maxLength;
    if (isTooLong) ctx.problems.error(line, `${key} is at most ${spec.maxLength} characters`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 카드 줄 선택 사항 하나. 키와 값 목록은 grammar.js의 show 범위다.
function readRowOption(t, row, { line, ctx }) {
  const spec = t.type === 'option' ? optionsOf('show')[t.key] : undefined;
  if (t.type === 'word' && flagNames('show').includes(t.value) && !row.isMono) row.isMono = true;
  else if (spec && spec.type !== 'flag' && row[t.key] === undefined) readRowValue(t, { spec, row }, { line, ctx });
  else {
    const keys = Object.entries(optionsOf('show')).filter(([, o]) => o.type !== 'flag').map(([key]) => `${key}=`);
    ctx.problems.error(line, `a card row takes ${keys.join(', ')}, and ${flagNames('show').join(', ')} once each. Found "${t.key ?? t.value}"`);
  }
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 목록의 값 수
// basis: estimate
// 카드 줄 선택 사항의 값. 값 목록이 있으면 그 안의 값만 받는다.
function readRowValue(t, { spec, row }, { line, ctx }) {
  if (spec.values && (t.valueType !== 'word' || !valueNames(spec.values).includes(t.value))) ctx.problems.error(line, `${t.key} is one of ${valueNames(spec.values).join(', ')}`);
  else if (!spec.values && t.valueType !== 'text') ctx.problems.error(line, `write ${t.key} as quoted text: ${t.key}="..."`);
  else row[t.key] = t.value;
}

// `clear id`
function readClear({ tokens, line }, ctx) {
  const [, id, extra] = tokens;
  if (id?.type !== 'word' || extra) {
    ctx.problems.error(line, 'write clear as: clear id');
    return;
  }
  if (!ctx.step.beats.length) {
    ctx.problems.error(line, 'a scene cannot start with clear. There is no card to clear yet');
    ctx.step.hasError = true;
    return;
  }
  attachBeat(ctx, line).ops.push({ type: 'clear', node: id.value, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 카드와 칸: `light a b.part`. 차트 카드: `light 차트 "항목"`, `light 차트 x=값`, `light 차트 "행" "열"`.
function readLight({ tokens, line }, ctx) {
  const args = tokens.slice(1);
  const beat = pushBeat(ctx, line);
  if (!args.length) ctx.problems.error(line, 'light needs at least one target');
  if (!args.some((t) => t.type === 'text' || t.type === 'option')) {
    for (const t of args) {
      if (t.type === 'word') beat.light.push(t.value);
      else ctx.problems.error(line, `light takes names. Found "${t.value}"`);
    }
    return;
  }
  const [target, ...rest] = args;
  const isX = rest.length === 1 && rest[0].type === 'option' && rest[0].key === 'x' && parseNumber(rest[0].value) !== undefined;
  const isTexts = rest.length >= 1 && rest.length <= 2 && rest.every((t) => t.type === 'text');
  if (target.type !== 'word') ctx.problems.error(line, 'write a chart light as: light chart "item", light chart x=value, or light chart "row" "column"');
  else if (isX) beat.chartLight.push({ chart: target.value, x: parseNumber(rest[0].value), line });
  else if (isTexts) beat.chartLight.push({ chart: target.value, names: rest.map((t) => t.value), line });
  else ctx.problems.error(line, 'in a chart, write light chart "item", light chart x=value, or light chart "row" "column"');
}

// `wait 2s`
function readWait({ tokens, line }, ctx) {
  const [, time, extra] = tokens;
  const ms = parseTime(time?.value);
  if (time?.type === 'word' && ms === undefined && !extra && isOverTimeLimit(time.value)) ctx.problems.error(line, overLimitMessage('wait', time.value), { code: 'time-limit' });
  else if (time?.type !== 'word' || ms === undefined || extra) ctx.problems.error(line, 'write wait as: wait 2s');
  pushBeat(ctx, line).waitMs = ms ?? 0;
}

// `note id "글"`. 바로 앞 메시지 박자에 붙는다.
function readNote({ tokens, line }, ctx) {
  const [, id, text, extra] = tokens;
  if (id?.type !== 'word' || text?.type !== 'text' || extra) {
    ctx.problems.error(line, 'write note as: note id "text"');
    return;
  }
  const beat = ctx.step.beats.at(-1);
  const hop = beat?.hops[0];
  if (ctx.previous !== 'hop' || !hop) {
    ctx.problems.error(line, 'write a note on the line right after a message');
    return;
  }
  if (id.value !== hop.from && id.value !== hop.to) {
    ctx.problems.error(line, `a note points at "${hop.from}" or "${hop.to}", the participants of the message above`);
    return;
  }
  beat.notes.push({ node: id.value, text: text.value, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `reveal 차트.계열 …`. 계열이 없는 차트는 `reveal 차트`로 통째로 드러낸다.
function readReveal({ tokens, line }, ctx) {
  const ids = tokens.slice(1);
  if (!ids.length || ids.some((t) => t.type !== 'word')) ctx.problems.error(line, 'write reveal as: reveal chart.series');
  const beat = pushBeat(ctx, line);
  for (const t of ids.filter((w) => w.type === 'word')) {
    const [chart, series, ...more] = t.value.split('.');
    if (more.length || !ID_PATTERN.test(chart) || (series !== undefined && !ID_PATTERN.test(series))) ctx.problems.error(line, `write a series as chart.series. Found "${t.value}"`);
    else beat.reveal.push({ chart, series, line });
  }
}

function pushBeat(ctx, line) {
  const beat = emptyBeat(line);
  ctx.step.beats.push(beat);
  return beat;
}

// show, clear는 바로 앞 박자에 붙는다. 단계 첫 줄이면 멈추는 박자를 만든다.
function attachBeat(ctx, line) {
  const last = ctx.step.beats.at(-1);
  if (last) return last;
  const beat = pushBeat(ctx, line);
  beat.isPause = true;
  return beat;
}
