// 차트 카드를 그리고, 값에 묶인 차트(`row "now" ms=depth`)의 프레임을 만든다.
// 값이 바뀌면 차트는 다른 프레임으로 바뀐다. 모든 프레임이 같은 축을 쓰도록 값 범위(extent)와 그림 영역 길이를 고정하고,
// 프레임마다 달라지는 표식(막대, 점, 값 글자)에는 프레임이 바뀌어도 변하지 않는 id를 붙인다(data-mark, 글자는 data-mark-text).
// 프레임은 이산적으로 바뀌고 시각은 값 줄의 변화 시각 그대로다. 프레임이 시각(t0, t1, at)을 바꾸지 않는다.
import { chartText } from './chart/draw.js';
import { extentOfFrames } from './chart/extent.js';
import { changedBetween, frameSet } from './chart/frames.js';
import { drawChecked } from './chart/guard.js';
import { patternDefs } from './styles.js';
import { prepareChartRows } from './source/chart-rules.js';
import { FigureError, createProblems, makeDiagnostic } from './source/problems.js';
import { NUMBER_PATTERN } from './source/words.js';
import { values } from './tokens.js';
import { rootOf, valueTable } from './values.js';

const COMPACT_WIDTH = values.size.chart['compact-width'];
// 값 축이 없어 범위를 고정할 필요가 없는 차트
const NO_AXIS = new Set(['pie', 'donut', 'heatmap']);

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 카드 수
// basis: estimate
/** 문서의 차트 카드 모두 */
export const chartCards = (figure) => figure.nodes.filter((n) => n.shape === 'chart' && !n.isRejected);

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
/** 차트 카드의 행이 묶은 값 이름 목록 */
export const boundIds = (card) => [...new Set(card.plot.chart.rows.flatMap((row) => Object.values(row.bind ?? {})))];

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 보기 수
// basis: estimate
/** 차트 보기에 놓인 차트는 문서 폭 전체로, 그래프 카드로만 놓인 차트는 좁은 폭으로 그린다. 한 차트는 한 모양으로만 그린다. */
export const isFullChart = (figure, card) => figure.views.some((v) => v.strategy === 'plot' && v.cardIds.includes(card.id));

// cost: time O(b·t), heap O(b·t), stack O(1)
// vars: b = 묶은 값 수, t = 값이 가질 글 수
// basis: estimate
/**
 * 값 범위를 정하려고 그려 볼 모든 행 목록: 처음 값, 값 하나가 가질 글을 하나씩 넣은 것, 묶은 값이 모두 가장 큰(또는 가장 작은) 글을 가진 것.
 * 쌓은 막대의 합과 음수 합은 묶은 값이 함께 움직일 때 가장 크므로 마지막 두 목록이 양쪽 끝을 덮는다.
 * @param texts 값 이름 → 가질 글 집합
 */
function extentRows(card, figure, texts) {
  const ids = boundIds(card);
  const byId = valueTable(figure);
  const base = Object.fromEntries(ids.map((id) => [id, startText(id, figure)]));
  const candidates = (id) => [...(texts.get(rootOf(byId, id)) ?? [])].filter((t) => NUMBER_PATTERN.test(t));
  const pick = (choose) => Object.fromEntries(ids.map((id) => [id, candidates(id).sort((a, b) => choose(Number(a), Number(b)))[0] ?? base[id]]));
  const singles = ids.flatMap((id) => candidates(id).map((text) => ({ ...base, [id]: text })));
  return [base, ...singles, pick((a, b) => b - a), pick((a, b) => a - b)].map((assign) => rowsWith(card, assign));
}

// cost: time O(b·t·r·s), heap O(b·t·r), stack O(1)
// vars: b = 묶은 값 수, t = 값이 가질 글 수, r = 행 수, s = 계열 수
// basis: estimate
/**
 * 묶은 값이 가질 모든 값과 고정 값으로 정한 값 범위. 값 축이 없는 차트와 묶은 값이 없는 차트는 undefined다.
 * 범위 규칙은 chart/extent.js 하나다: 쌓은 막대는 양수 합과 음수 합, 퍼센트는 0~100, 누적분포는 0~1, 나머지는 모든 값의 최솟값과 최댓값이다.
 * @param texts 값 이름 → 가질 글 집합
 */
export function extentOf(card, figure, texts) {
  const { chart, chartType } = card.plot;
  if (!boundIds(card).length || NO_AXIS.has(chartType)) return undefined;
  return extentOfFrames(chartType, chart.series.map((s) => s.id), extentRows(card, figure, texts), chart.scale);
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 묶은 자리에 값을 채운 행. assign은 값 이름 → 숫자 글이다.
function rowsWith(card, assign) {
  return card.plot.chart.rows.map((row) => (row.bind ? { ...row, values: { ...row.values, ...Object.fromEntries(Object.entries(row.bind).map(([key, id]) => [key, Number(assign[id])])) } } : row));
}

// 이 차트 카드를 그리는 입력 모형. 행과 값 범위, 그림 영역 길이(plotWidth)를 바꿔 끼운 복사본이다.
// 값에 묶인 차트는 그리기가 표식 이름과 원자료를 직접 붙인다(chart.markIds, chart/marks.js). 프레임 짝맞춤은 그 이름만 읽는다.
function plotWith(card, { rows, extent, plotWidth, probe, isFull, chartWidth }) {
  const { plot } = card;
  const markIds = boundIds(card).length > 0;
  return { ...plot, chart: { ...plot.chart, rows, extent, plotWidth, probe, markIds, ...layoutOf({ isFull, chartWidth }) } };
}

// 차트 그림 폭 규칙. 차트 보기는 기본으로 문서 폭 전체이고 그래프 카드만이면 좁은 폭이다. 좁은 배치(chartWidth)는 둘 다 그 폭 이하로 그린다.
function layoutOf({ isFull, chartWidth }) {
  if (chartWidth === undefined) return isFull ? {} : { layout: { width: COMPACT_WIDTH } };
  return { layout: { width: isFull ? chartWidth : Math.min(COMPACT_WIDTH, chartWidth) } };
}

// cost: time O(draw), heap O(out), stack O(1)
// vars: draw = 차트를 그리는 비용, out = 만든 SVG 글자 수
// basis: estimate
// 프레임 하나를 그린다. 원·도넛처럼 행 값에서 비율이 정해지는 차트는 비율을 다시 계산한다.
function drawFrame(card, options, problems) {
  const plot = plotWith(card, options);
  if (card.plot.chart.rows.some((row) => row.bind)) prepareChartRows(plot, problems);
  const drawn = drawChecked(plot, problems);
  return { ...drawn, text: chartText(plot) };
}

// cost: time O(f·draw), heap O(f·out), stack O(1)
// vars: f = 값 글 수, draw = 차트를 그리는 비용, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 차트 카드를 처음 값으로 그린다. 값에 묶인 차트는 값이 가질 글 하나씩을 넣어 그려 그림 영역 길이를 모으고, 가장 짧은 길이로 고정해 다시 그린다.
 * 그래서 어느 프레임에서도 눈금과 축의 위치가 같다. 카드 크기는 모든 프레임 가운데 가장 큰 그림의 크기다.
 * @param chartWidth 좁은 배치가 정한 차트 그림 폭. 없으면 기본 폭이다
 * @returns { drawn, pin: { extent, plotWidth, isFull, chartWidth } }. drawn은 { body, width, height, text, rowKeys, fits, clashes, dotAts, dimsInkColor }, pin은 프레임을 그릴 때 같은 값으로 쓴다
 */
export function drawChartBase(card, { figure, texts, chartWidth, problems }) {
  const isFull = isFullChart(figure, card);
  const extent = extentOf(card, figure, texts);
  const ids = boundIds(card);
  const base = Object.fromEntries(ids.map((id) => [id, startText(id, figure)]));
  let plotWidth;
  if (ids.length) {
    const byId = valueTable(figure);
    const probe = [];
    drawFrame(card, { rows: rowsWith(card, base), extent, probe, isFull, chartWidth }, createProblems());
    for (const id of ids) {
      for (const text of texts.get(rootOf(byId, id)) ?? []) {
        if (NUMBER_PATTERN.test(text)) drawFrame(card, { rows: rowsWith(card, { ...base, [id]: text }), extent, probe, isFull, chartWidth }, createProblems());
      }
    }
    plotWidth = probe.length ? Math.min(...probe) : undefined;
  }
  const pin = { extent, plotWidth, isFull, chartWidth };
  return { drawn: drawFrame(card, { rows: rowsWith(card, base), ...pin }, problems), pin };
}

// 값이 시간표를 만들기 전에 가진 처음 글(참조면 가리키는 값의 처음 글)
function startText(id, figure) {
  const byId = valueTable(figure);
  return byId.get(rootOf(byId, id)).from;
}

// 값 줄이 시각 t에 보이는 글. 값 줄의 구간 가운데 t가 들어 있는 것이고, 없으면 마지막 구간이다(재생기와 같은 규칙).
const textAt = (row, t) => (row.periods.find(([from, to]) => from <= t && t < to) ?? row.periods.at(-1))[2];

// cost: time O(s·(v·c + p)), heap O(f + p), stack O(1)
// vars: s = 장면 수, v = 묶은 값 수, c = 값이 바뀌는 횟수, p = 구간 수, f = 프레임 수
// basis: estimate
/**
 * 값에 묶인 차트 카드의 프레임과 시간표를 만든다.
 * 프레임은 묶은 값이 가진 글의 서로 다른 조합마다 하나(0번은 처음 값)이고, 장면마다 값이 바뀌는 시각으로 구간을 나눠 그 구간에 보이는 프레임 번호를 적는다.
 * 같은 시각에 이어 쓴 값은 마지막 글만 보이고(길이 0 구간은 건너뛴다), 한 시각 안에서 제자리로 돌아오면 바뀐 표식이 없다.
 * 길이 0인 장면도 자신의 값으로 길이 0 구간 하나를 갖는다. 장면의 첫 구간에서 바뀐 표식은 장면이 시작할 때 보이는 값(`set`, `keep`)과 견준다.
 * @returns { frames, marks, rows, body, defs } 또는 묶은 값이 없으면 undefined. rows는 장면마다 { si, t0, t1, periods: [[from, to, 프레임 번호, 바뀐 표식 id[]]] }, body는 표식 id를 붙인 처음 그림이다. 바뀐 표식은 원자료가 달라진 것뿐이다(위치만 밀린 표식은 조용히 옮겨진다).
 * @throws FigureError 묶은 값이 숫자가 아닌 글을 가질 때(value-type)나 프레임끼리 표식 이름이 다를 때(chart-frames, 그리기의 버그)
 */
export function buildChartFrames(card, { figure, timeline, base, pin }, problems) {
  const ids = boundIds(card);
  if (!ids.length) return undefined;
  const assigns = [Object.fromEntries(ids.map((id) => [id, startText(id, figure)]))];
  const indexOf = (assign) => {
    const key = JSON.stringify(ids.map((id) => assign[id]));
    const found = assigns.findIndex((a) => JSON.stringify(ids.map((id) => a[id])) === key);
    return found >= 0 ? found : assigns.push(assign) - 1;
  };
  const scenes = sceneSpans(timeline);
  const rows = scenes.map(({ si, t0, t1 }) => {
    const sources = ids.map((id) => ({ id, row: timeline.values.find((r) => r.id === id && r.si === si) }));
    // 장면 끝 시각(t1)에 일어난 변화도 그 장면의 마지막 모습이다: 길이 0인 마지막 구간으로 남겨, 값 줄의 마지막 구간과 같은 규칙으로 읽힌다.
    const cuts = [...new Set([t0, ...sources.flatMap(({ row }) => row.changes.map(([t]) => t))])].filter((t) => t <= t1).sort((a, b) => a - b);
    const periods = [];
    // 바뀐 표식의 기준은 문서의 처음 값이 아니라 이 장면이 시작할 때 보이는 값(`set`, `keep`이 정한 처음 글)의 프레임이다.
    const start = indexOf(Object.fromEntries(sources.map(({ id, row }) => [id, row.initial])));
    cuts.forEach((from, k) => {
      const to = cuts[k + 1] ?? t1;
      const assign = Object.fromEntries(sources.map(({ id, row }) => [id, textAt(row, from)]));
      checkNumbers(assign, { card, at: from });
      const frame = indexOf(assign);
      if (to > from && periods.at(-1)?.[2] === frame) periods.at(-1)[1] = to;
      else if (to > from || (from === t1 && periods.at(-1)?.[2] !== frame)) periods.push([from, to, frame]);
    });
    return { si, t0, t1, start, periods };
  });
  const drawn = assigns.map((assign) => drawFrame(card, { rows: rowsWith(card, assign), ...pin }, problems));
  const { marks, frames, raws, body } = pairFrames(drawn.map((d) => d.body), card);
  const changed = (a, b) => changedBetween(raws, a, b);
  for (const row of rows) {
    row.periods = row.periods.map(([from, to, frame], k) => [from, to, frame, changed(k ? row.periods[k - 1][2] : row.start, frame)]);
    delete row.start;
  }
  // 무늬 정의는 프레임마다 쓴 것의 합이다(같은 id는 같은 내용이라 합쳐도 겹치지 않는다).
  return { frames, marks, rows, body, defs: patternDefs(drawn) };
}

// 장면마다 시작과 끝 시각
function sceneSpans(timeline) {
  const spans = new Map();
  for (const seg of timeline.segs) spans.set(seg.si, { si: seg.si, t0: spans.get(seg.si)?.t0 ?? seg.t0, t1: seg.t1 });
  return [...spans.values()];
}

// 묶은 값의 글은 모두 숫자여야 한다. 아니면 묶은 행의 줄에서 알린다.
function checkNumbers(assign, { card, at }) {
  for (const [id, text] of Object.entries(assign)) {
    if (NUMBER_PATTERN.test(text)) continue;
    const line = card.plot.chart.rows.find((row) => Object.values(row.bind ?? {}).includes(id)).line;
    throw new FigureError([makeDiagnostic({ severity: 'error', line, message: `chart "${card.id}" reads "${id}", which holds "${text}" at ${at}ms. A chart value is a number` }, { code: 'value-type' })]);
  }
}

// cost: time O(f·n), heap O(f·m), stack O(1)
// vars: f = 프레임 수, n = SVG 토큰 수, m = 표식 수
// basis: estimate
// 프레임마다 그린 그림을 표식 이름으로 짝맞춘다(chart/frames.js). 칸마다 표식이 늘 있어 값이 0에서 양수가 되어도 같은 구조다. 어긋나면 그리기의 버그라 어느 표식인지 알린다.
function pairFrames(bodies, card) {
  try {
    return frameSet(bodies);
  } catch (error) {
    throw new FigureError([makeDiagnostic({ severity: 'error', line: card.line, message: `chart "${card.id}" cannot pair its frames: ${error.message}` }, { code: 'chart-frames' })]);
  }
}
