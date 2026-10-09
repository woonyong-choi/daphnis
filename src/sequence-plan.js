// 시퀀스 제어 구획을 고정된 출발 시각으로 편다. 재생기는 이미 계산된 시간표만 읽는다.
import { eventBudgetError, resolveBudget } from './budget.js';
import { hopMs } from './hop-ms.js';
import { emptyBeat } from './source/steps.js';

// cost: time O(b + h·p), heap O(h), stack O(d)
// vars: b = 원본 박자 수, h = 펼친 메시지 수, p = 경로 점 수, d = 구획 깊이
// basis: estimate
/** 배치용 전체 대안은 그대로 두고, 단계의 재생용 박자만 별도로 만든다. */
export function sequenceStep(step, run, deps) {
  if (!step.sequencePlan) return step;
  const limit = (deps.limits ?? resolveBudget()).events;
  const needed = (run.sequenceEvents ?? 0) + countEvents(step.sequencePlan);
  if (needed > limit) throw eventBudgetError('events', limit, { line: step.line, ...(Number.isSafeInteger(needed) ? { needed } : { t: run.t }) });
  run.sequenceEvents = needed;
  return { ...step, beats: step.sequencePlan.flatMap((beat) => beat.control ? packedBeat(beat.control, { run, scene: deps.scene }) : [beat]) };
}

// cost: time O(b), heap O(d), stack O(d)
// vars: b = 선택된 원본 박자 수, d = 구획 깊이
// basis: estimate
// 반복을 할당하기 전에 센다. 메시지 출발·도착은 둘, 독립된 대기는 하나다.
function countEvents(beats) {
  return beats.reduce((sum, beat) => {
    if (!beat.control) return sum + Math.max(1, beat.hops.length * 2);
    const c = beat.control;
    const count = operands(c).reduce((n, body) => n + countEvents(body), 0);
    return sum + count * (c.times ?? 1);
  }, 0);
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구획의 대안 수
// basis: estimate
function operands(control) {
  if (control.kind === 'loop' || control.kind === 'opt') return control.run === 'off' ? [] : [control.body];
  return control.branches.filter((branch) => control.kind !== 'alt' || branch.label === control.choose).map((branch) => branch.body);
}

// cost: time O(h·p), heap O(h), stack O(d)
// vars: h = 펼친 메시지 수, p = 경로 점 수, d = 구획 깊이
// basis: estimate
function packedBeat(control, ctx) {
  const hops = [];
  const end = scheduleControl(control, { ...ctx, hops }, 0);
  const lastArrival = hops.reduce((last, hop) => Math.max(last, hop.sequenceAt + hop.timeMs), 0);
  return end ? [{ ...emptyBeat(control.line), hops, waitMs: Math.max(0, end - lastArrival) }] : [];
}

// cost: time O(h·p), heap O(h), stack O(d)
// vars: h = 펼친 메시지 수, p = 경로 점 수, d = 구획 깊이
// basis: estimate
// 병렬 대안은 같은 시각에 시작하고, 다음 구획은 가장 늦은 대안의 끝에서 시작한다.
function scheduleControl(control, ctx, start) {
  const bodies = operands(control);
  if (bodies.every((body) => countEvents(body) === 0)) return start;
  if (control.kind === 'par') return bodies.reduce((end, body) => Math.max(end, schedule(body, ctx, start)), start);
  let at = start;
  for (let i = 0; i < (control.times ?? 1); i++) at = schedule(bodies[0], ctx, at);
  return at;
}

// cost: time O(h·p), heap O(h), stack O(d)
// vars: h = 펼친 메시지 수, p = 경로 점 수, d = 구획 깊이
// basis: estimate
function schedule(beats, ctx, start) {
  let at = start;
  for (const beat of beats) {
    if (beat.control) { at = scheduleControl(beat.control, ctx, at); continue; }
    let duration = 0;
    for (const hop of beat.hops) {
      const timeMs = hop.timeMs ?? hopMs(ctx.scene.edges[hop.sequenceEdge].points, ctx.run.speed);
      ctx.hops.push({ ...hop, timeMs, sequenceAt: at });
      duration = Math.max(duration, timeMs);
    }
    at += duration + beat.waitMs;
  }
  return at;
}
