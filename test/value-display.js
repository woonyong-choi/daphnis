// 값 시험이 같이 쓰는 표시 모형: 시간표를 표시 시각(화면 ms)으로 읽어 값 글자와 갱신 펄스 세기를 내는 도구(docs/design/playback.md 값 변화, 논리 시간과 표시 시간).
// 논리 시각(시간표의 ms)에는 효과 시간이 없고, 표시 시각은 논리 시각을 장면 배속으로 나눈 값에 효과 꼬리를 더한다. 움직이는 SVG의 한 바퀴와 재생기의 장면 길이가 표시 길이다.
import { sliceTimeline } from '../src/svg.js';
import { values } from '../src/tokens.js';

// 펄스 세기를 견주는 허용 오차. keyTimes가 소수 5자리라 한 꼭짓점이 시각으로 0.1ms쯤 어긋나고 세기는 그 기울기만큼 달라진다.
export const LEVEL_TOLERANCE = 0.02;
// 갱신 펄스 세 구간(화면 ms): 올라감, 머묾, 내려감(토큰 duration.effect-*). 값이 바뀐 시각에 한 줄이 이 모양으로 깜빡인다.
const { 'effect-rise': RISE, 'effect-hold': HOLD, 'effect-decay': FALL } = values.duration;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 펄스가 시작한 뒤 x(화면 ms)가 흐른 때의 세기(0에서 1). 시작 전과 끝난 뒤는 0이다. */
export const level = (x) => (x < 0 || x >= RISE + HOLD + FALL ? 0 : x < RISE ? x / RISE : x < RISE + HOLD ? 1 : 1 - (x - RISE - HOLD) / FALL);

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 줄 수
// basis: estimate
/**
 * 장면 si의 표시 모형: 그 장면만 자른 시간표(sliced), 장면 값 줄의 문서 전체 번호(globals), 표시 길이(display, ms), 배속(speed).
 * 자른 시간표의 펄스 키(`value:번호`)와 재생기의 값 줄 번호는 문서 전체 번호를 쓴다.
 */
export const sceneModel = (result, si) => {
  const sliced = sliceTimeline(result.timeline, si, result.scene);
  const globals = result.timeline.values.flatMap((row, vi) => (row.si === si ? [vi] : []));
  return { sliced, globals, display: sliced.presentation[si], speed: result.timeline.steps[si].speed };
};

// cost: time O(r·(p + c)), heap O(r), stack O(1)
// vars: r = 값 줄 수, p = 구간 수, c = 값이 바뀌는 횟수
// basis: estimate
/**
 * 장면 안 표시 시각 td(ms)의 값 줄마다 { text, flash }. 글자는 논리 시각 td × speed의 값 구간에서 읽고(마지막 구간이 끝난 뒤 효과 꼬리 동안은 마지막 글을 유지한다),
 * 펄스 세기는 같은 값 줄의 펄스(sliced.pulses, 논리 ms)가 시작한 표시 시각(at ÷ speed)부터 표시 ms(80/80/240)로 잰다.
 */
export const timelineStateAt = ({ sliced, globals, speed }, td) =>
  sliced.values.map((row, vi) => {
    const logical = td * speed;
    const period = row.periods.find(([from, to]) => logical >= from && logical < to) ?? (logical >= (row.periods.at(-1)?.[1] ?? Infinity) ? row.periods.at(-1) : undefined);
    return { text: period?.[2], flash: Math.max(0, ...sliced.pulses.filter(({ key }) => key === `value:${globals[vi]}`).map(({ at }) => level(td - at / speed))) };
  });

/** 두 값 상태 목록이 글자는 같고 펄스 세기는 허용 오차 안으로 같다. */
export const sameState = (actual, expected) => actual.length === expected.length && actual.every((state, i) => state.text === expected[i].text && Math.abs(state.flash - expected[i].flash) <= LEVEL_TOLERANCE);
