// 알고리즘(예약, 값 유지, 대기와 조건, 사라짐, 흐름)은 같은 원본에서 같은 사건과 결과를 낸다.
// 고정 결과(fixtures/v2-golden/algorithms.json)는 옛 시간표(박자마다 머묾 700ms, 장면 끝 머묾 1600ms, 첫 박자 최소 이동 시간 3750ms)가 낸 요약이고, 이 파일은 그 파일을 다시 쓰지 않는다.
// 옛 머묾은 규정에서 없어졌다. 그래서 두 가지를 따로 잰다.
//  1. 상대 사건과 결과는 그대로여야 한다: 이동의 at/ms/cut/edge/isBack/to/줄, 값의 처음 글과 바뀐 글의 순서, 대기·건너뜀·교착·예약의 결과와 순서.
//  2. 절대 시각은 고정 결과에서 옛 머묾 상수를 걷어 낸 독립 계산(oracle)과 같아야 한다. oracle은 timeline.js를 부르지 않고, 고정 결과의 상대 사건과 옛 상수만 쓴다.
//     시각을 절대로 읽는 결과(시간 초과, 값 읽기)는 사례마다 같은지 1번에서 확인한다. 바뀐 결과가 하나라도 있으면 1번이 실패하므로 계약 변경으로 문서에 적어야 한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { FigureError } from '../src/source/problems.js';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/v2-golden/algorithms.json', import.meta.url), 'utf8'));

// 옛 시간표의 상수. 옛 규칙: 박자 길이 = max(이동 끝, 이벤트 소비, 첫 박자면 3750) + 적은 wait + 700 + (장면 마지막 박자면 1600). 흐름 장면은 for= 그대로다.
const LEGACY = { dwell: 700, stepEnd: 1600, entry: 3750 };
const EPSILON = 1e-6;

// 시간표에서 시각과 사건만 뽑는다.
function summarize(timeline) {
  return {
    total: timeline.total,
    segs: timeline.segs.map((s) => ({ si: s.si, bi: s.bi, t0: s.t0, t1: s.t1, hops: s.hops.map((h) => ({ at: h.at ?? 0, ms: h.ms, cut: h.cut, edge: h.edge, isBack: h.isBack, to: h.to, line: h.line })) })),
    values: (timeline.values ?? []).map((v) => ({ id: v.id, si: v.si, node: v.node, t0: v.t0, t1: v.t1, initial: v.initial, changes: v.changes })),
    waits: timeline.waits,
    skips: timeline.skips,
    stalls: timeline.stalls,
    reserves: timeline.reserves,
  };
}

// 장면이 흐름인지: 장면 머리 줄 뒤에 track 줄이 있으면 흐름이다.
function sceneKinds(source) {
  const kinds = [];
  for (const line of source.split('\n')) {
    if (/^scene /.test(line)) kinds.push('beat');
    else if (/^\s+track /.test(line) && kinds.length) kinds[kinds.length - 1] = 'flow';
  }
  return kinds;
}

/**
 * 고정 결과(옛 시각)에서 옛 머묾을 걷어 낸 새 박자 길이와 시작 시각. 박자마다 옛 길이에서 옛 머묾을 빼고, 첫 장면 첫 박자는 옛 최소 이동 시간을 되돌린다:
 * 옛 첫 박자 = max(M, E, 3750) + W + 머묾이므로 max(M, E)가 3750 미만이면 새 길이 = (옛 길이 - 머묾) - 3750 + max(M, E), 아니면 옛 길이 - 머묾이다.
 * M은 그 박자 이동의 끝(at + cut ?? ms), E는 그 장면 대기가 풀린 시각(고정된 waits의 t1)이다. 둘 다 고정 결과의 상대 사건이다.
 * @returns { starts: 옛 구간 번호 → [새 t0, 새 t1], total }
 */
function oracle(summary, kinds) {
  const bySi = new Map();
  summary.segs.forEach((seg, k) => bySi.set(seg.si, [...(bySi.get(seg.si) ?? []), k]));
  const bounds = [];
  let t = 0;
  for (const [si, indexes] of bySi) {
    indexes.forEach((k, n) => {
      const seg = summary.segs[k];
      const hold = kinds[si] === 'flow' ? 0 : LEGACY.dwell + (n === indexes.length - 1 ? LEGACY.stepEnd : 0);
      let length = seg.t1 - seg.t0 - hold;
      if (si === 0 && n === 0 && kinds[0] === 'beat' && length >= LEGACY.entry) {
        const move = Math.max(0, ...seg.hops.map((h) => h.at + (h.cut ?? h.ms)));
        const consumed = Math.max(0, ...(summary.waits ?? []).filter((w) => w.si === 0 && w.t1 - w.t0 <= length).map((w) => w.t1));
        if (Math.max(move, consumed) < LEGACY.entry) length = length - LEGACY.entry + Math.max(move, consumed);
      }
      bounds[k] = [t, t + length];
      t += length;
    });
  }
  return { bounds, total: t };
}

// 옛 절대 시각 t를 새 시각으로. t가 든 옛 구간(시작 포함, 끝 제외)의 처음에서 잰 거리를 새 구간 처음에 더한다. 끝 시각이나 그 뒤는 새 끝 시각이다.
function remap(t, summary, { bounds, total }) {
  const k = summary.segs.findLastIndex((seg) => seg.t0 <= t && t < seg.t1);
  if (k < 0) return t >= summary.total ? total : t;
  return bounds[k][0] + (t - summary.segs[k].t0);
}

// 고정 요약의 절대 시각을 새 시각으로 옮긴 사본. 이동의 at은 박자 안 상대 시각이라 옮기지 않는다.
function expectedFrom(summary, kinds) {
  const plan = oracle(summary, kinds);
  const at = (t) => remap(t, summary, plan);
  const deep = (value, key) => {
    if (Array.isArray(value)) return key === 'changes' ? value.map(([t, text]) => [at(t), text]) : value.map((item) => deep(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ['t0', 't1', 't', 'at'].includes(k) && typeof v === 'number' ? at(v) : deep(v, k)]));
    return value;
  };
  return {
    ...deep({ ...summary, segs: undefined, total: undefined }),
    total: plan.total,
    segs: summary.segs.map((seg, k) => ({ ...seg, t0: plan.bounds[k][0], t1: plan.bounds[k][1] })),
  };
}

// 숫자만 EPSILON까지 같다고 보는 깊은 비교(시각의 부동소수 오차)
function assertClose(actual, expected, label) {
  if (typeof expected === 'number' && typeof actual === 'number') return assert.ok(Math.abs(actual - expected) < EPSILON, `${label}: ${actual} != ${expected}`);
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && actual.length === expected.length, `${label}: 길이 ${actual?.length} != ${expected.length}`);
    return expected.forEach((item, i) => assertClose(actual[i], item, `${label}[${i}]`));
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual ?? {}).filter((k) => actual[k] !== undefined).sort(), Object.keys(expected).filter((k) => expected[k] !== undefined).sort(), `${label}: 키`);
    return Object.keys(expected).forEach((key) => expected[key] !== undefined && assertClose(actual[key], expected[key], `${label}.${key}`));
  }
  return assert.equal(actual, expected, label);
}

test('the golden cases cover builds and errors from every algorithm family', () => {
  const families = new Set(CASES.map((c) => c.from));
  for (const family of ['reserve', 'value-keep', 'when-wait', 'lost-status-legs', 'wait-length']) assert.ok(families.has(family), family);
  assert.ok(CASES.filter((c) => c.summary).length > 100);
  assert.ok(CASES.filter((c) => c.errorLines).length > 40);
  assert.equal(CASES.length, 173, '173개 알고리즘 사례를 모두 지킨다');
});

test('every golden source keeps its events, outcomes and order, and its absolute times equal the independent oracle', async () => {
  let changed = 0;
  for (const [i, c] of CASES.entries()) {
    const options = c.options ? { strict: c.options.strict, budget: c.options.budget } : undefined;
    if (!c.summary) continue;
    const { timeline } = await buildFigure(c.source, options);
    // JSON으로 한 번 거쳐 undefined 필드를 고정 결과와 같게 맞춘다.
    const now = JSON.parse(JSON.stringify(summarize(timeline)));
    const label = `case ${i} (${c.from})\n${c.source}`;
    // 1. 상대 사건과 결과: 이동, 값의 바뀐 글 순서, 대기·건너뜀·교착·예약의 결과와 순서(시각은 2번이 잰다)
    assert.deepEqual(now.segs.map((s) => [s.si, s.bi, s.hops]), c.summary.segs.map((s) => [s.si, s.bi, s.hops]), `이동 ${label}`);
    const sequence = (s) => s.values.map((v) => [v.id, v.si, v.node, v.initial, v.changes.map(([, text]) => text)]);
    assert.deepEqual(sequence(now), sequence(c.summary), `값 ${label}`);
    const outcome = (list) => (list ?? []).map(({ t0, t1, t, at, refs, ...rest }) => ({ ...rest, ...(refs ? { refs: refs.map(({ at: _, ...ref }) => ref) } : {}) }));
    for (const key of ['waits', 'skips', 'stalls', 'reserves']) assert.deepEqual(outcome(now[key]), outcome(c.summary[key]), `${key} ${label}`);
    // 2. 절대 시각: 고정 결과에서 옛 머묾 상수만 걷어 낸 값
    assertClose(now, expectedFrom(c.summary, sceneKinds(c.source)), label);
    if (JSON.stringify(now.segs.map((s) => [s.t0, s.t1])) !== JSON.stringify(c.summary.segs.map((s) => [s.t0, s.t1]))) changed++;
  }
  assert.ok(changed > 50, `옛 머묾이 있던 사례의 시각이 바뀐다: ${changed}`);
});

// 시간 한도(1시간 = 3600000ms) 경계에 있던 네 사례는 옛 머묾(박자마다 700ms, 장면 끝 1600ms) 때문에 한도를 넘었다. 머묾이 없어지면 같은 원본이 한도 안에 든다. 결과가 바뀐 사례를 숨기지 않고 여기 적는다(계약 변경, docs/design/playback.md).
// 각 사례의 새 총 길이를 손으로 계산한다(원본의 적은 시간만 쓴다):
//  - 106: 박자 하나가 대기 시간 초과 3597701ms까지 기다리고 else가 없어 점이 출발하지 않는다. 길이 = 3597701ms. 옛 길이 = 3597701 + 700 + 1600 = 3600001ms(한도보다 1ms 많음).
//  - 109: 박자 둘이 각각 1798501ms 기다린다. 길이 = 2 × 1798501 = 3597002ms. 옛 길이 = 3597002 + 2 × 700 + 1600 = 3600002ms.
//  - 149: 3599s(3599000ms) 기다린 뒤 else 선(길이로 정한 842ms)을 지난다. 길이 = 3599000 + 842 = 3599842ms. 옛 길이 = 3599842 + 700 + 1600 = 3602142ms.
//  - 152: 3596862ms 기다린 뒤 같은 else 선 842ms를 지난다. 길이 = 3596862 + 842 = 3597704ms. 옛 길이 = 3597704 + 700 + 1600 = 3600004ms.
// 경계가 사라지지 않도록 같은 원본의 대기 시간을 한도를 넘게 늘린 변형은 여전히 time-limit 오류다. 대기가 한도를 넘기는 변형의 오류 줄은 대기를 소비하는 이벤트 처리가 알려 장면 줄일 수 있어, 줄은 바뀔 수 있고 코드로 가린다.
const BOUNDARY = [
  { index: 106, total: 3597701, over: (source) => source.replace('timeout=3597701ms', 'timeout=3600001ms') },
  { index: 109, total: 3597002, over: (source) => source.replaceAll('timeout=1798501ms', 'timeout=1800001ms') },
  { index: 149, total: 3599842, over: (source) => source.replace('timeout=3599s', 'timeout=3600s') },
  { index: 152, total: 3597704, over: (source) => source.replace('timeout=3596862ms', 'timeout=3599863ms') },
];

test('the four time-limit boundary cases now fit the limit by the hand arithmetic, and the same sources over the limit still fail', async () => {
  for (const { index, total, over } of BOUNDARY) {
    const c = CASES[index];
    assert.deepEqual(c.codes, ['time-limit'], `case ${index} was a time-limit error`);
    const { timeline } = await buildFigure(c.source);
    assert.equal(timeline.total, total, `case ${index}`);
    await assert.rejects(buildFigure(over(c.source)), (error) => {
      assert.ok(error instanceof FigureError);
      assert.deepEqual(error.problems.map((p) => p.code), ['time-limit'], `case ${index} over the limit`);
      return true;
    });
  }
});

test('every golden error case keeps its lines and codes', async () => {
  const moved = new Set(BOUNDARY.map(({ index }) => index));
  for (const [i, c] of CASES.entries()) {
    if (c.summary || moved.has(i)) continue;
    const options = c.options ? { strict: c.options.strict, budget: c.options.budget } : undefined;
    await assert.rejects(buildFigure(c.source, options), (error) => {
      assert.ok(error instanceof FigureError, `case ${i}`);
      assert.deepEqual(error.problems.map((p) => p.line), c.errorLines, `case ${i} (${c.from})\n${c.source}`);
      return true;
    });
  }
});
