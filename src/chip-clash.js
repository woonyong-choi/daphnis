// 서로 다른 점의 글 상자가 겹치는 것을 다룬다. 흐름(track)은 점이 여럿 동시에 지나므로, 겹치는 구간에서 나중에 출발한 점의 글 상자를 숨기고(점은 보인다) 자리가 나면 서서히 다시 보인다.
// 그림 검사 7번도 같은 계산으로 겹침을 찾는다(docs/design/playback.md 이동 글).
import { CHIP_VISIBLE_MIN, CHIP_FRAME_MS, chipStateAt } from './chip-motion.js';
import { OVERLAP_SLACK, overlapArea, sizeChip } from './chip.js';
import { curveOf, progressAt } from './easing.js';
import { flattenRoute } from './route.js';
import { values } from './tokens.js';

const MOVE = curveOf('move');
/** 글 상자가 숨고 다시 나타나는 시간(ms). 이동 글 상자 흐려짐 토큰과 같다. */
export const CHIP_HIDE_FADE_MS = values.duration['chip-fade'];

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 숨는 구간 수
// basis: estimate
/**
 * 이동 시작 뒤 t(ms)에 숨김이 글 상자에 곱하는 값(0~1). spans는 겹침이 있는 구간 [시작, 끝]이다.
 * 겹침이 시작하기 전에 숨는 시간만큼 앞서 흐려져 겹침 때는 이미 안 보이고, 끝난 뒤 같은 시간 동안 서서히 나타난다.
 */
export function hideFactor(spans, t) {
  for (const [start, end] of spans) {
    if (t >= start && t <= end) return 0;
    if (t < start && t > start - CHIP_HIDE_FADE_MS) return (start - t) / CHIP_HIDE_FADE_MS;
    if (t > end && t < end + CHIP_HIDE_FADE_MS) return (t - end) / CHIP_HIDE_FADE_MS;
  }
  return 1;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 이동의 길(그려지는 경로를 편 점 목록)과 글 상자 크기. 같은 이동은 한 번만 만든다.
function motionOf(hop, { scene, timeline }, cache) {
  if (!cache.has(hop)) cache.set(hop, { route: hop.track === undefined ? flattenRoute(scene.edges[hop.edge].points) : timeline.tracks[hop.track].route, hop, chip: sizeChip(hop.data) });
  return cache.get(hop);
}

// cost: time O(p + l), heap O(1), stack O(1)
// vars: p = 경로 점 수, l = 글 상자 경로 지점 수
// basis: estimate
// 이동 시작 뒤 local(ms)의 글 상자 { box, opacity }. 점이 보이지 않거나(도형 안, 이동 밖) 계획이 흐린 때는 없다.
function chipAt(motion, local, { isFactored }) {
  const { hop } = motion;
  if (local < 0 || local > hop.ms) return undefined;
  const progress = progressAt(MOVE, Math.min(1, local / hop.ms));
  if (hop.gaps?.some(([from, to]) => progress > from && progress < to)) return undefined;
  const { box, opacity } = chipStateAt(motion, hop.chipPath, local);
  const shown = isFactored ? opacity * hideFactor(hop.chipHide ?? [], local) : opacity;
  return shown >= CHIP_VISIBLE_MIN ? { box, hop } : undefined;
}

// cost: time O(F·h²), heap O(h), stack O(1)
// vars: F = 구간의 프레임 수, h = 구간의 글 상자 있는 이동 수
// basis: estimate
/**
 * 흐름 구간마다 글 상자가 겹치는 구간을 찾아 나중에 출발한 점의 hop.chipHide에 [시작, 끝](이동 시작 뒤 ms)로 담는다.
 * 60fps 프레임마다 먼저 출발한 점부터 글 상자를 놓고, 이미 놓인 글 상자와 겹치면 그 프레임은 겹침이다. 숨는 시간의 두 배보다 가까운 겹침 구간은 하나로 잇는다.
 */
export function planClashes(scene, timeline) {
  const cache = new Map();
  for (const seg of timeline.segs) {
    const hops = seg.hops.filter((hop) => hop.track !== undefined && hop.data).sort((a, b) => a.at - b.at);
    if (hops.length < 2) continue;
    const clashes = new Map(hops.map((hop) => [hop, []]));
    for (let t = 0; t <= seg.t1 - seg.t0; t += CHIP_FRAME_MS) {
      const placed = [];
      for (const hop of hops) {
        const chip = chipAt(motionOf(hop, { scene, timeline }, cache), t - hop.at, { isFactored: false });
        if (!chip) continue;
        if (placed.some((box) => overlapArea(box, chip.box) > OVERLAP_SLACK)) clashes.get(hop).push(t - hop.at);
        else placed.push(chip.box);
      }
    }
    for (const [hop, times] of clashes) if (times.length) hop.chipHide = spansOf(times);
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 겹친 프레임 수
// basis: estimate
// 겹친 프레임 시각들을 구간으로 묶는다. 연달아 있지 않거나 숨는 시간의 두 배 넘게 떨어지면 다른 구간이다.
function spansOf(times) {
  const spans = [];
  for (const t of times) {
    if (spans.length && t - spans.at(-1)[1] <= CHIP_HIDE_FADE_MS * 2) spans.at(-1)[1] = t;
    else spans.push([t, t]);
  }
  return spans;
}

// cost: time O(F·h²), heap O(h), stack O(1)
// vars: F = 구간의 프레임 수, h = 구간의 글 상자 있는 이동 수
// basis: estimate
/**
 * 흐름(track)의 보이는 글 상자끼리 겹치는 곳. 박자의 이동은 옛 그림의 출력과 진단을 바꾸지 않으려고 보지 않는다. 숨김(hop.chipHide)을 적용한 뒤에도 겹치면 { seg, a, b, t }(이동 a, b와 구간 안 시각)이다. 이동 글 상자 쌍마다 처음 한 곳만 돌려준다.
 */
export function findClashes(scene, timeline) {
  const cache = new Map();
  const found = [];
  const seen = new Set();
  for (const seg of timeline.segs) {
    const hops = seg.hops.filter((hop) => hop.track !== undefined && hop.data);
    if (hops.length < 2) continue;
    for (let t = 0; t <= seg.t1 - seg.t0; t += CHIP_FRAME_MS) {
      const chips = hops.map((hop) => chipAt(motionOf(hop, { scene, timeline }, cache), t - (hop.at ?? 0), { isFactored: true })).filter(Boolean);
      chips.forEach((a, i) => chips.slice(i + 1).forEach((b) => {
        const key = `${hops.indexOf(a.hop)}\u0000${hops.indexOf(b.hop)}\u0000${seg.t0}`;
        if (seen.has(key) || overlapArea(a.box, b.box) <= OVERLAP_SLACK) return;
        seen.add(key);
        found.push({ seg, a: a.hop, b: b.hop, t });
      }));
    }
  }
  return found;
}
