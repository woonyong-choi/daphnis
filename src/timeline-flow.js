// 흐름 단계(`track`)를 시간표 구간 하나로 만든다. 박자가 끝나야 다음 박자가 시작하는 시계와 달리, 흐름은 단계 길이 안에서 서로 기다리지 않고 각자 출발한다(docs/design/playback.md 흐름 단계).
import { curveOf, timeAt } from './easing.js';
import { hopMs } from './hop-ms.js';
import { flattenRoute, routeLength } from './route.js';
import { values } from './tokens.js';

const MOVE = curveOf('move');
const STEP_END = values.duration['step-end'];

// cost: time O(l·p), heap O(l·p), stack O(1)
// vars: l = 흐름의 구간(선) 수, p = 선의 경로 점 수
// basis: estimate
// 흐름 하나가 지나는 길. 구간마다 선 경로를(거꾸로 선이면 뒤집어) 이어 붙이고, 이동 시간은 구간 시간(선 길이 비례)의 합이다. time=이 있으면 경로 전체의 시간이다.
// 도형을 지나는 곳은 구간이 끝나는 점과 다음 구간이 시작하는 점을 잇는 직선이고(모서리를 둥글리지 않는다), 그 길이도 경로 길이에 센다. route는 그려지는 길을 편 점 목록이다. fracs[k]는 k번째 도형 경계에 닿는 길이 비율, gaps는 도형 안을 지나는 비율 구간이다.
function planTrack(track, { scene, speed }) {
  const parts = track.legs.map((leg) => (leg.isBack ? [...scene.edges[leg.edge].points].reverse() : scene.edges[leg.edge].points));
  const lengths = parts.map((part) => routeLength(flattenRoute(part)));
  const joins = parts.slice(1).map((part, i) => Math.hypot(part[0].x - parts[i].at(-1).x, part[0].y - parts[i].at(-1).y));
  const total = lengths.reduce((sum, length) => sum + length, 0) + joins.reduce((sum, length) => sum + length, 0);
  const fracs = [0];
  const gaps = [];
  let covered = 0;
  lengths.forEach((length, i) => {
    covered += length;
    fracs.push(covered / total);
    if (i < joins.length) {
      gaps.push([covered / total, (covered + joins[i]) / total]);
      covered += joins[i];
    }
  });
  fracs[fracs.length - 1] = 1;
  return {
    parts,
    route: parts.flatMap((part) => flattenRoute(part)),
    edges: [...new Set(track.legs.map((leg) => leg.edge))],
    legEdges: track.legs.map((leg) => leg.edge),
    names: track.path,
    nodes: track.path.map((id) => id.split('.')[0]),
    fracs,
    gaps,
    ms: track.timeMs ?? parts.reduce((sum, part) => sum + hopMs(part, speed), 0),
  };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 출발 수
// basis: estimate
// 흐름 하나의 출발 시각(단계 안 ms). at에서 시작해 every마다 되풀이하고, 단계 끝(forMs)을 넘기는 점은 그리지 않는다. every가 없으면 한 번이다.
function departures(track, { ms, forMs }) {
  const starts = [];
  for (let at = track.atMs; forMs === undefined || at + ms <= forMs; at += track.everyMs) {
    starts.push(at);
    if (track.everyMs === undefined) break;
  }
  return starts;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 경로 길이의 비율 fraction에 점이 닿는 시각(출발 뒤 ms). 이동 곡선을 따른다.
const offsetOf = (fraction, ms) => (fraction <= 0 ? 0 : fraction >= 1 ? ms : timeAt(MOVE, fraction) * ms);

// cost: time O(t·(d + l)), heap O(t·d + e), stack O(1)
// vars: t = 흐름 수, d = 흐름의 출발 수, l = 흐름의 구간 수, e = 지나는 선 수
// basis: estimate
/**
 * 흐름 단계 하나의 구간. 구간 길이는 단계의 for=이고, 없으면 마지막 점이 도착하는 시각에 duration.step-end를 더한다.
 * 선과 도형은 점이 처음 닿는 시각에 켜진다(edgesAt, nodesAt).
 * @param run 시간표를 지나며 이어지는 값 { figure, speed, t, tracks, ... }
 * @param deps { scene, cards, chips }
 * @returns { segs, moves }. segs는 구간 하나의 목록, moves는 값 바꾸기 식이 쓰는 이동 목록이다
 */
export function flowSeg({ step, si }, run, { scene, cards, chips }) {
  const plans = step.tracks.map((track) => planTrack(track, { scene, speed: run.speed }));
  const first = run.tracks.length;
  run.tracks.push(...plans.map((plan, i) => ({ parts: plan.parts, route: plan.route, names: plan.names, gaps: plan.gaps, line: step.tracks[i].line })));
  const hops = [];
  const edgesAt = {};
  plans.forEach((plan, i) => {
    const track = step.tracks[i];
    const starts = departures(track, { ms: plan.ms, forMs: step.forMs });
    for (const at of starts) hops.push({ track: first + i, edges: plan.edges, gaps: plan.gaps, isBack: false, at, ms: plan.ms, to: plan.nodes.at(-1), data: track.data === undefined ? undefined : chips(track.data), ...(track.tone ? { tone: track.tone } : {}), line: track.line });
    if (starts.length) plan.legEdges.forEach((edge, k) => (edgesAt[edge] = Math.min(edgesAt[edge] ?? Infinity, starts[0] + offsetOf(plan.fracs[k], plan.ms))));
  });
  const length = step.forMs ?? Math.max(0, ...hops.map((h) => h.at + h.ms)) + STEP_END;
  const start = cards.starts.get(step) ?? {};
  const seg = {
    si,
    bi: 0,
    t0: run.t,
    t1: run.t + length,
    labelShifts: [],
    move: length,
    hops,
    edgesOn: [],
    nodesOn: [],
    partsOn: [],
    cards: start,
    cardsBefore: start,
    cardsAt: {},
    caption: step.caption ?? '',
    series: run.hasReveal ? [...run.revealed] : run.seriesIds,
    growing: run.hasReveal || si > 0 ? [] : run.seriesIds,
    lights: [],
    edgesAt,
    nodesAt: nodesAtOf(edgesAt, scene.edges),
  };
  run.t = seg.t1;
  const moves = hops.map((hop) => ({ ...plans[hop.track - first], start: seg.t0 + hop.at, sets: step.tracks[hop.track - first].sets }));
  return { segs: [seg], moves };
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 지나는 선 수
// basis: estimate
// 도형이 켜지는 시각: 그 도형에 닿은 선 가운데 가장 먼저 켜지는 선의 시각. 박자의 이동이 선의 양 끝을 켜는 규칙과 같다.
function nodesAtOf(edgesAt, edges) {
  const at = {};
  for (const [edge, time] of Object.entries(edgesAt)) {
    for (const id of [edges[edge].from, edges[edge].to].map((end) => end.split('.')[0])) at[id] = Math.min(at[id] ?? Infinity, time);
  }
  return at;
}
