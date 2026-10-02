// 점 위에 뜨는 글 상자의 크기와 자리. 움직이는 SVG, 재생기, 그림 검사가 시간표에 담은 같은 계획을 쓴다(docs/design/playback.md 이동 글).
import { curveOf, progressAt, timeAt } from './easing.js';
import { measure } from './measure/fonts.js';
import { STYLE } from './measure/sizes.js';
import { flattenRoute, pointAlong } from './route.js';
import { values } from './tokens.js';

const SPACE = values.space;
/** 글 상자와 점 사이 간격 */
export const CHIP_GAP = SPACE['6'];
/** 글 상자가 판 위아래 끝에서 떨어져야 하는 거리. 판 안쪽 여백(그림 둘레 여백)과 같다. */
export const CHIP_MARGIN = SPACE['14'];
// 글 상자 자리를 재는 경로 비율 간격(5%)
const SAMPLES = 20;
// 지점 사이를 선형으로 이은 자리가 글자를 가리면 지점을 반으로 쪼개는 최대 횟수
const REFINE_DEPTH = 4;
// 점 위와 아래가 바뀌는 구간을 이 시간(ms)의 순간으로 만든다
const FLIP_MS = values.duration['chip-flip'];
// 바뀜 시각을 찾으려고 구간을 훑는 칸 수
const FLIP_SCAN = 16;
// 겹치기 시작하는 칸 안에서 바뀜 시각을 이분 탐색하는 횟수. 칸 폭의 1/256까지 좁혀 한 프레임보다 훨씬 정확하다
const FLIP_BISECT = 8;
// 점이 선을 지나는 곡선. 움직이는 SVG와 재생기와 같다
const MOVE = curveOf('move');
// 이름 글자와 겹친 넓이가 이 값 이하면 겹침 없음으로 본다(잰 글 폭의 반올림 차이)
const OVERLAP_SLACK = 0.5;
// 잰 글 폭의 반올림 차이를 넘기 위한 여유
const FIT_SLACK = 0.5;
// 지점 사이 자리를 글자와 견주는 시간 비율(구간의 1/4, 1/2, 3/4)
const BETWEEN_RATIOS = [0.25, 0.5, 0.75];
// 후보 순위에서 옆으로 비킨 거리를 가르는 가중치. 후보 종류(위, 아래, 옆)의 순서를 넘지 않을 만큼 작다
const SHIFT_WEIGHT = 1 / 10000;

// cost: time O(l·n), heap O(1), stack O(1)
// vars: l = 줄 수, n = 줄 글자 수
// basis: estimate
/** 글 상자 크기. 줄은 시간표가 이미 나눴다. */
export function sizeChip(lines) {
  const w = Math.max(...lines.map((line) => measure(line, STYLE.chip.size, STYLE.chip.face))) + SPACE['9'];
  return { w, h: lines.length * STYLE.chip.line + SPACE['4'] };
}

function overlapArea(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

// cost: time O(a²), heap O(a), stack O(1)
// vars: a = 피할 글자 사각형 수
// basis: estimate
/**
 * 점 point 위의 글 상자 자리. 후보(점 위, 점 아래, 그리고 둘을 옆으로 비킨 것)마다 아래 순서로 견주어 가장 나은 것을 쓴다.
 * 1. 그림 안에 있다. 2. 피할 글자(도형 이름, 열, 그룹 제목)와 겹치지 않는다(겹치면 겹친 넓이가 작은 쪽). 3. 판 위아래 끝에서 CHIP_MARGIN 이상 떨어진다.
 * 4. 점 위 그대로, 점 아래, 옆으로 비킨 점 위, 옆으로 비킨 점 아래 순서다. 옆으로 비킬 때는 가리는 글자 사각형의 양 끝에 붙는 자리 가운데 점에서 글 상자 반 폭과 간격 안에 있는 것만 후보로 한다. 더 멀리 비키면 글 상자가 점에서 떨어져 보이고 경로를 따라 갑자기 튀기 때문이다.
 * 옆으로는 그림 밖으로 나가지 않게 밀어 넣는다.
 * @param scene { width, height }
 * @param avoid { x, y, w, h, name }[]
 * @returns { dx, dy, box, isOutside, hits }. dx, dy는 점 위 기본 자리에서 옮긴 양, box는 그림 좌표의 글 상자 사각형이다. hits는 겹친 글자 이름 목록이다
 */
export function placeChip(point, chip, scene, avoid = []) {
  const half = chip.w / 2 + CHIP_GAP;
  const clamp = (center) => Math.min(scene.width - half, Math.max(half, center));
  const candidates = [];
  for (const dy of [0, chip.h + CHIP_GAP * 2]) {
    const top = point.y - chip.h - CHIP_GAP + dy;
    const row = { y: top, h: chip.h };
    // 같은 높이 띠의 글자 양 끝에 붙는 자리가 옆으로 비키는 후보다.
    const near = avoid.filter((text) => text.y < row.y + row.h && row.y < text.y + text.h);
    const reach = chip.w / 2 + CHIP_GAP;
    const centers = [point.x, ...near.flatMap((text) => [text.x + text.w + chip.w / 2 + FIT_SLACK, text.x - chip.w / 2 - FIT_SLACK]).filter((center) => Math.abs(center - point.x) <= reach)];
    for (const center of centers) {
      const x = clamp(center);
      const box = { x: x - chip.w / 2, y: top, w: chip.w, h: chip.h };
      const hits = avoid.filter((text) => overlapArea(box, text) > OVERLAP_SLACK);
      const area = hits.reduce((sum, text) => sum + overlapArea(box, text), 0);
      const isOutside = isOutsideFigure(box, scene);
      const isTight = top < CHIP_MARGIN - FIT_SLACK || top + chip.h > scene.height - CHIP_MARGIN + FIT_SLACK;
      const shift = Math.abs(x - point.x);
      const order = (center === point.x ? 0 : 2) + (dy > 0 ? 1 : 0) + shift * SHIFT_WEIGHT;
      candidates.push({ dx: x - point.x, dy, box, isOutside, hits: hits.map((h) => h.name), rank: [Number(isOutside), area, Number(isTight), order] });
    }
  }
  const best = candidates.reduce((a, b) => (compare(a.rank, b.rank) <= 0 ? a : b));
  const { rank, ...placed } = best;
  return placed;
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 순위 항목 수(4)
// basis: estimate
function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// cost: time O(k·(p + a)·2^d), heap O(k·2^d), stack O(d)
// vars: k = 재는 지점 수(21), p = 경로 점 수, a = 피할 글자 사각형 수, d = 쪼개는 최대 횟수(4)
// basis: estimate
/**
 * 이동 하나의 글 상자 계획. 경로를 5% 간격으로 나눈 지점마다 글 상자 자리를 정하고, 지점 사이를 선형으로 이은 자리가 글자를 가리거나 그림 밖으로 나가면 그 사이에 지점을 더한다.
 * 움직이는 SVG와 재생기가 이 목록을 그대로 쓴다.
 * @returns { path, issues }. path는 이동 진행 비율 at(오름차순)마다 [at, dx, dy]이고, issues는 지점마다 { at, isOutside, hits }다
 */
export function planChip(scene, hop, avoid) {
  const chip = sizeChip(hop.data);
  const route = flattenRoute(scene.edges[hop.edge].points);
  const place = (fraction) => ({ at: hop.isBack ? 1 - fraction : fraction, fraction, ...placeChip(pointAlong(route, fraction), chip, scene, avoid) });
  const base = Array.from({ length: SAMPLES + 1 }, (_, i) => place(i / SAMPLES));
  // 선형으로 이은 자리 검사는 진행 비율이 오르는 순서(isBack이면 경로 비율이 내려가는 순서)로 한다.
  if (hop.isBack) base.reverse();
  const isClean = (a, b, ratios = BETWEEN_RATIOS) => ratios.every((ratio) => {
    const { box } = chipBoxBetween(route, hop, chip, [a, b], ratio);
    return !isOutsideFigure(box, scene) && !avoid.some((text) => overlapArea(box, text) > OVERLAP_SLACK);
  });
  // cost: time O((p + a)·2^d), heap O(2^d), stack O(d)
  // vars: p = 경로 점 수, a = 피할 글자 사각형 수, d = 쪼갠 깊이
  // basis: estimate
  const refine = (a, b, depth) => {
    if (isClean(a, b)) return [];
    // 더 쪼개도 사이가 글자를 가리면(점 위에서 아래로 바뀌는 구간) 앞 자리를 b 직전까지 붙들어 바뀜을 FLIP_MS 안의 순간으로 만든다.
    if (depth === 0) return flip(a, b);
    const mid = place((a.fraction + b.fraction) / 2);
    return [...refine(a, mid, depth - 1), mid, ...refine(mid, b, depth - 1)];
  };
  // cost: time O((FLIP_SCAN + FLIP_BISECT)·(p + a)), heap O(1), stack O(1)
  // vars: FLIP_SCAN = 훑는 칸 수(16), FLIP_BISECT = 이분 탐색 횟수(8), p = 경로 점 수, a = 피할 글자 사각형 수
  // basis: estimate
  // 앞 지점 a의 자리를 붙든 채 점이 가다가 처음 글자를 가리기 직전까지 두고, 거기서 FLIP_MS 안에 b의 자리로 바꾼다. 바뀜이 글자를 가리는 구간을 한 순간으로 줄이는 것이다.
  const flip = (a, b) => {
    const [ta, tb] = [timeAt(MOVE, a.at), timeAt(MOVE, b.at)];
    const held = { ...a, at: b.at };
    let safe = 0;
    while (safe < FLIP_SCAN && isClean(a, held, [(safe + 1) / FLIP_SCAN])) safe += 1;
    // 겹침은 깨끗한 마지막 칸 끝과 겹치는 칸 끝 사이 어딘가에서 시작하므로, 그 칸 안에서 마지막으로 깨끗한 비율을 찾는다.
    let [low, high] = [safe / FLIP_SCAN, Math.min(1, (safe + 1) / FLIP_SCAN)];
    for (let i = 0; i < FLIP_BISECT; i++) {
      const mid = (low + high) / 2;
      if (isClean(a, held, [mid])) low = mid;
      else high = mid;
    }
    const from = Math.min(ta + (tb - ta) * low, tb - FLIP_MS / hop.ms);
    const to = Math.min(tb, from + FLIP_MS / hop.ms);
    const [atFrom, atTo] = [progressAt(MOVE, from), progressAt(MOVE, to)];
    const entries = [];
    if (atFrom > a.at) entries.push({ ...a, at: atFrom, fraction: hop.isBack ? 1 - atFrom : atFrom });
    if (atTo > Math.max(a.at, atFrom) && atTo < b.at) entries.push({ ...b, at: atTo, fraction: hop.isBack ? 1 - atTo : atTo });
    return entries;
  };
  const samples = base.flatMap((sample, i) => (i < base.length - 1 ? [sample, ...refine(sample, base[i + 1], REFINE_DEPTH)] : [sample]));
  return { path: samples.map(({ at, dx, dy }) => [at, dx, dy]), issues: samples.map(({ at, isOutside, hits }) => ({ at, isOutside, hits })) };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * 두 계획 지점 a, b(진행 비율이 오르는 순서) 사이, 시간 비율이 a 시각에서 b 시각으로 ratio만큼 간 때의 글 상자. 움직이는 SVG와 재생기가 지점 사이를 시간에 선형으로 잇는 것과 같다.
 * @param route 그려지는 경로를 편 점 목록(flattenRoute). 점은 둥근 모서리 경로를 따라가므로 꺾은선이 아니라 이것으로 자리를 잰다
 * @returns { box, point }. box는 그림 좌표의 글 상자, point는 그 시각 점의 자리다
 */
export function chipBoxBetween(route, hop, chip, [a, b], ratio) {
  const [ta, tb] = [timeAt(MOVE, a.at), timeAt(MOVE, b.at)];
  const time = ta + (tb - ta) * ratio;
  const f = progressAt(MOVE, time);
  const point = pointAlong(route, hop.isBack ? 1 - f : f);
  const [dx, dy] = [a.dx + (b.dx - a.dx) * ratio, a.dy + (b.dy - a.dy) * ratio];
  return { point, box: { x: point.x + dx - chip.w / 2, y: point.y - chip.h - CHIP_GAP + dy, w: chip.w, h: chip.h } };
}

function isOutsideFigure(box, scene) {
  return box.x < -FIT_SLACK || box.y < -FIT_SLACK || box.x + box.w > scene.width + FIT_SLACK || box.y + box.h > scene.height + FIT_SLACK;
}
