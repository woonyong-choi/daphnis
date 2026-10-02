// 여섯 종류 차트를 SVG 조각으로 그린다. 계열 요소는 class `cs-{계열 번호}`, 행 요소는 `cr-{행 번호}`를 달아 재생이 드러내기와 밝히기를 건다.
import { mixHex, pickInk } from '../contrast.js';
import { measure } from '../measure/fonts.js';
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { curveOf, timeAt } from '../easing.js';
import { presentSlots, slotMiddle } from './slots.js';
import { formatChange, formatNumber, makeScale } from './scale.js';

const SPACE = values.space;
const SIZE = values.size;
const TEXT = values.size.text;
const WIDTH = SIZE['chart-width'];
const LABEL_W = SIZE['chart-label'];
const LABEL_MAX = SIZE['chart-label-max'];
const LABEL_GAP = SPACE['6'];
// 차트 항목 이름이 칸에 들어가는 최대 폭
const LABEL_ROOM = LABEL_MAX - LABEL_GAP;
const BAR = SIZE['chart-bar'];
const ROW = SIZE['chart-row'];
const DOT = SIZE['chart-dot'];
const PAD = SPACE['14'];
const CAP = SIZE['chart-cap'];
const RANGE = SIZE['chart-range'];
const ARROW_MIN = SIZE['chart-arrow-min'];
// 내용이 닿는 오른쪽 끝. 왼쪽 여백(PAD)과 같은 여백을 오른쪽에도 둔다.
const RIGHT = WIDTH - PAD;
// 히트맵 칸 색. 값 0은 핵심 1 옅게, 최댓값은 핵심 1 진하게이고 그 사이는 sRGB 보간이다(문서 스킬 색표).
// 칸 색은 CSS(.chart-heat의 color-mix)가 변수로 계산해 다크 모드 값을 따라간다. 여기 hex는 color-mix를 모르는 뷰어용 대체 색(라이트)이다.
const HEAT_LOW = values.color.data['heat-low'];
const HEAT_HIGH = values.color.data['heat-high'];
// 칸 안 값 글자 후보. 칸마다 대비가 큰 쪽을 빌드 때 고른다. 다크는 두 후보가 같은 밝은 색이고 칸 색 범위가 그 글자와 4.5 이상이 되게 정했다(테스트가 모든 강도를 잰다).
const HEAT_INK = values.color.data['heat-ink'];
const HEAT_INK_ON = values.color.data['heat-ink-on'];
const ROLE_COLOR = { main: tokens.color.data.main, compare: tokens.color.data.compare };
const REVEAL = curveOf('reveal');

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 계열 번호 i의 색. 계열이 없는 차트(산점도 점)는 main 색이다.
const seriesColor = (chart, i) => ROLE_COLOR[chart.series[i]?.role ?? 'main'];

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 차트 하나를 그린다.
 * @returns { body, width, height, rowKeys, fits, dotAts }. rowKeys[k]는 행 k의 light 이름이다. dotAts는 선 차트 점이 나타나는 시각(자라는 시간 대비 비율, `data-at`)의 오름차순 목록이다. fits는 칸에 들어가야 하는 글({ text, width, room, line, what })이다
 */
export function drawChart(figure) {
  const header = drawHeader(figure);
  const draw = { bar: drawBars, dumbbell: drawDumbbells, box: drawBoxes, scatter: drawScatter, line: drawLine, heatmap: drawHeatmap }[figure.chartType];
  const plot = draw(figure, header.bottom);
  // 계열이 없는 차트는 그림 전체를 계열 0으로 묶는다. 시간표가 차트 전체를 계열 하나로 보기 때문이다(timeline.js chartSeriesIds).
  const marks = figure.chart.series.length ? plot.svg : `<g class="cs-0">${plot.svg}</g>`;
  return { body: `${header.svg}\n${marks}`, width: WIDTH, height: plot.bottom + PAD, rowKeys: plot.rowKeys, fits: plot.fits ?? [], dotAts: plot.dotAts ?? [] };
}

// cost: time O(r·n), heap O(1), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 항목 이름 칸 너비. 가장 긴 이름에 맞추되 LABEL_W와 LABEL_MAX 사이다. 넘는 이름은 그림 검사 1번이 알린다. */
export function labelColumn(names) {
  return Math.min(LABEL_MAX, Math.max(LABEL_W, ...names.map((name) => measure(name, TEXT['13']) + LABEL_GAP)));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function heatColor(strength) {
  return mixHex(HEAT_LOW, HEAT_HIGH, strength);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 요소 수
// basis: estimate
/**
 * 값 축 길이. 값 v의 요소는 start + 비율(v) × 길이 + extra까지 닿는다(extra는 값 글자, 점 반지름 같은 고정 폭).
 * 모든 요소가 right 안에 들어가는 가장 긴 길이를 돌려줘, 가장 멀리 닿는 요소가 right에 맞는다. 그래서 왼쪽 여백과 오른쪽 여백이 같다.
 * @param items { value, extra }[]. 비율이 0인 요소는 길이와 상관없어 건너뛴다
 */
function fitLength(unit, start, items, right = RIGHT) {
  return Math.min(...items.map(({ value, extra }) => (unit.at(value) > 0 ? (right - start - extra) / unit.at(value) : Infinity)));
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 값 축 눈금 글자는 눈금 가운데에 놓여 양쪽으로 절반씩 나온다.
function tickReach(unit) {
  return unit.ticks.map((value) => ({ value, extra: measure(formatNumber(value), TEXT['11'], 'num') / 2 }));
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 기준선 수
// basis: estimate
// 기준선 라벨은 기준선 오른쪽에서 시작한다.
function ruleReach(rules) {
  return rules.map((rule) => ({ value: rule.value, extra: SPACE['2'] + measure(rule.label, TEXT['11']) }));
}

function labelFit(name, line) {
  return { text: name, width: measure(name, TEXT['13']), room: LABEL_ROOM, line, what: 'item name' };
}

// cost: time O(s log s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 범례 순서: main이 먼저다. 계열 번호는 그대로 둬 재생이 같은 번호로 보임을 건다.
function legendOrder(series) {
  return series.map((s, i) => ({ s, i })).sort((a, b) => Number(b.s.role === 'main') - Number(a.s.role === 'main'));
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 제목, 부제, 계열 범례
function drawHeader(figure) {
  const parts = [];
  let y = PAD;
  if (figure.title) {
    parts.push(`<text x="${PAD}" y="${r(y + TEXT['15'])}" class="chart-title">${renderRich(figure.title)}</text>`);
    y += TEXT['15'] + SPACE['4'];
  }
  if (figure.subtitle) {
    parts.push(`<text x="${PAD}" y="${r(y + TEXT['12'])}" class="chart-sub">${renderRich(figure.subtitle)}</text>`);
    y += TEXT['12'] + SPACE['5'];
  }
  if (figure.chart.series.length) {
    let x = PAD;
    legendOrder(figure.chart.series).forEach(({ s, i }) => {
      parts.push(`<g class="cs-${i}"><rect x="${x}" y="${r(y + SPACE['2'])}" width="${BAR}" height="${BAR}" rx="${values.radius.sm}" fill="${seriesColor(figure.chart, i)}"/>` + `<text x="${x + BAR + SPACE['3']}" y="${r(y + BAR)}" class="chart-legend">${renderRich(s.label)}</text></g>`);
      x += BAR + SPACE['3'] + measure(s.label, TEXT['12']) + SPACE['9'];
    });
    y += BAR + SPACE['6'];
  }
  return { svg: parts.join('\n'), bottom: y + SPACE['6'] };
}

// cost: time O(r·s), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, out = 만든 SVG 글자 수
// basis: estimate
// 막대: 행마다 계열 막대를 쌓고, 신뢰구간 막대기(끝 캡 없는 선)와 값 글자를 붙인다. 값이 없으면 missing 글이다.
// 값 글자는 기준선에 걸려도 비키지 않고 막대 끝 옆에 둔다. 기준선보다 위에 그려 글자의 바탕색 테두리(halo)가 점선을 가리므로 막대, 기준선, 값 글자 순으로 쌓는다.
function drawBars(figure, top) {
  const { chart } = figure;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const all = chart.rows.flatMap((row) => chart.series.flatMap((s) => [row.values[s.id], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const max = Math.max(...all, ...chart.rules.map((x) => x.value));
  const unit = makeScale('linear', 0, max, 0, 1);
  // 값 글자가 가장 멀리 닿는 막대 끝에서 오른쪽 여백이 왼쪽 여백(PAD)과 같아지게 값 축 길이를 정한다.
  const reaches = chart.rows.flatMap((row) => chart.series.flatMap((s, i) => (typeof row.values[s.id] === 'number' ? [{ value: Math.max(row.values[s.id], row.values[`${s.id}.high`] ?? 0), extra: SPACE['3'] + measure(formatNumber(row.values[s.id]), TEXT['11'], i === 0 ? 'numSemibold' : 'num') }] : [])));
  const plotW = fitLength(unit, plotX, [...reaches, ...tickReach(unit), ...ruleReach(chart.rules)]);
  const scale = makeScale('linear', 0, max, plotX, plotW);
  const parts = [];
  const valueTexts = [];
  let y = top;
  chart.rows.forEach((row, k) => {
    const groupH = chart.series.length * BAR + (chart.series.length - 1) * SPACE['2'];
    // 이름은 값이 있는 막대 묶음의 세로 가운데에 둔다. 값이 없는 계열 슬롯(비교 없음 글)은 묶음에 넣지 않아 이름이 막대와 나란하다.
    // 계열을 하나씩 드러내는 동안은 시간표의 labelShifts만큼 옮겨 보이는 막대에 맞춘다(timeline.js).
    const middle = BAR / 2 + slotMiddle(presentSlots(row, chart.series));
    parts.push(`<g class="cr-${k}"><text x="${PAD}" y="${r(centerBaseline(y + middle, TEXT['13']))}" class="chart-label shift">${renderRich(row.label)}</text></g>`);
    chart.series.forEach((s, i) => {
      const by = y + i * (BAR + SPACE['2']);
      const cy = by + BAR / 2;
      const v = row.values[s.id];
      if (v === null) {
        parts.push(`<g class="cr-${k}"><g class="cs-${i}"><text x="${r(plotX)}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-missing">${renderRich(chart.missing ?? '비교 없음')}</text></g></g>`);
        return;
      }
      const end = scale.at(v);
      const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
      const reach = high !== undefined ? scale.at(high) : end;
      const ci = high !== undefined ? `<line x1="${r(scale.at(low))}" x2="${r(reach)}" y1="${r(cy)}" y2="${r(cy)}" class="chart-ci late"/>` : '';
      parts.push(`<g class="cr-${k}"><g class="cs-${i}"><rect x="${r(plotX)}" y="${r(by)}" width="${r(Math.max(SPACE['1'], end - plotX))}" height="${BAR}" rx="${values.radius.sm}" fill="${seriesColor(chart, i)}" class="grow"/>${ci}</g></g>`);
      valueTexts.push(`<g class="cr-${k}"><g class="cs-${i}"><text x="${r(Math.max(end, reach) + SPACE['3'])}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-value${i === 0 ? ' ours' : ''} late">${formatNumber(v)}</text></g></g>`);
    });
    y += groupH + SPACE['11'];
  });
  const bottom = y - SPACE['11'];
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(...valueTexts);
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 차트에서 신뢰구간이 한 점뿐일 때 쓰는 세로 오차 막대. 점과 같은 시각 at에 나타난다. 경로 d는 구간 선과 양 끝 캡이고, 흰 바탕 위라서 보조 글자 색 가는 선으로 점보다 앞서지 않게 한다.
function pointInterval(d, at) {
  return `<path d="${d}" class="chart-interval dot" data-at="${at}"/>`;
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 덤벨 행마다 오른쪽 끝에 닿는 요소. 값 글자는 두 점과 두 범위 바깥 끝 옆에 놓이고, 그 오른쪽에 바뀐 비율 글자가 오른쪽 끝에 붙는다. 값 글자와 비율 글자 사이는 한 칸 띄운다.
function dumbbellReach(chart, unit) {
  const [first, second] = chart.series;
  return chart.rows.flatMap((row) => {
    const [before, after] = [row.values[first.id], row.values[second.id]];
    const change = formatChange(before, after);
    const isAfterRight = unit.at(after) >= unit.at(before);
    const rightText = measure(formatNumber(isAfterRight ? after : before), TEXT['11'], isAfterRight ? 'numSemibold' : 'num');
    const tail = SPACE['3'] + rightText + (change ? SPACE['6'] + measure(change, TEXT['12'], 'numSemibold') : 0);
    const bounds = [first, second].flatMap((s) => [`${s.id}.low`, `${s.id}.high`].map((key) => row.values[key]).filter((v) => v !== undefined));
    return [...[before, after].map((value) => ({ value, extra: DOT + tail })), ...bounds.map((value) => ({ value, extra: tail }))];
  });
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 덤벨: 첫 계열 값(핵심 색 1 빈 점)에서 둘째 계열 값(핵심 색 2 화살촉)으로 화살표, 오른쪽에 바뀐 비율.
// 신뢰구간은 점 뒤에 같은 줄로 깔리는 옅은 범위 막대기다. 값 글자는 두 범위의 바깥 끝 밖에 두어 막대기, 점, 화살표와 겹치지 않는다.
// 두 점이 가까워 화살표를 그릴 자리가 없으면 화살표를 빼고 둘째 값을 점으로 찍는다.
function drawDumbbells(figure, top) {
  const { chart } = figure;
  const [first, second] = chart.series;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const all = chart.rows.flatMap((row) => [first, second].flatMap((s) => [row.values[s.id], row.values[`${s.id}.low`], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const unit = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), 0, 1);
  const plotW = fitLength(unit, plotX, [...dumbbellReach(chart, unit), ...tickReach(unit), ...ruleReach(chart.rules)]);
  const scale = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), plotX, plotW);
  const parts = [];
  chart.rows.forEach((row, k) => {
    const cy = top + k * ROW + ROW / 2;
    const [before, after] = [row.values[first.id], row.values[second.id]];
    const [x1, x2] = [scale.at(before), scale.at(after)];
    const dir = x2 >= x1 ? 1 : -1;
    const base = r(centerBaseline(cy, TEXT['11']));
    const range = (s, i) => {
      const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
      return low === undefined ? '' : `<line x1="${r(scale.at(low))}" x2="${r(scale.at(high))}" y1="${r(cy)}" y2="${r(cy)}" stroke="${seriesColor(chart, i)}" stroke-width="${RANGE}" class="chart-range pop"/>`;
    };
    // 값 글자는 두 점과 두 범위를 모두 덮는 구간의 바깥에 둔다. 한 점의 범위가 다른 점의 글자 자리까지 뻗어도 겹치지 않게 하기 위해서다.
    const ends = [first, second].flatMap((s, i) => {
      const x = i ? x2 : x1;
      return [x - DOT, x + DOT, ...[`${s.id}.low`, `${s.id}.high`].map((key) => row.values[key]).filter((v) => v !== undefined).map(scale.at)];
    });
    const [left, right] = [Math.min(...ends) - SPACE['3'], Math.max(...ends) + SPACE['3']];
    const gap = Math.abs(x2 - x1) - DOT - SPACE['1'];
    const hasArrow = gap >= ARROW_MIN;
    const arrow = hasArrow
      ? `<line x1="${r(x1 + dir * (DOT + SPACE['1']))}" y1="${r(cy)}" x2="${r(x2)}" y2="${r(cy)}" pathLength="1" class="chart-arrow draw" marker-end="url(#fl-arrow-main)"/>`
      : `<circle cx="${r(x2)}" cy="${r(cy)}" r="${DOT}" fill="${seriesColor(chart, 1)}" class="chart-after pop"/>`;
    const [firstX, secondX] = x1 < x2 ? [left, right] : [right, left];
    const side = (x) => (x === left ? 'end' : 'start');
    parts.push(
      `<text x="${PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-label cr-${k}">${renderRich(row.label)}</text>` +
        `<g class="cr-${k}"><g class="cs-0">${range(first, 0)}<circle cx="${r(x1)}" cy="${r(cy)}" r="${DOT}" class="chart-before pop"/><text x="${r(firstX)}" y="${base}" class="chart-value first late ${side(firstX)}">${formatNumber(before)}</text></g>` +
        `<g class="cs-1">${range(second, 1)}${arrow}` +
        `<text x="${r(secondX)}" y="${base}" class="chart-value second late ${side(secondX)}">${formatNumber(after)}</text>` +
        `<text x="${WIDTH - PAD}" y="${r(centerBaseline(cy, TEXT['12']))}" class="chart-ratio late">${formatChange(before, after)}</text></g></g>`,
    );
  });
  const bottom = top + chart.rows.length * ROW;
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 상자: 최소-최대 수염, q1-q3 상자, 가운데 값 선
function drawBoxes(figure, top) {
  const { chart } = figure;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const all = chart.rows.flatMap((row) => [row.values.min, row.values.max]);
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const unit = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), 0, 1);
  const medians = chart.rows.map((row) => ({ value: row.values.max, extra: SPACE['3'] + measure(formatNumber(row.values.median), TEXT['11'], 'num') }));
  const plotW = fitLength(unit, plotX, [...medians, ...tickReach(unit), ...ruleReach(chart.rules)]);
  const scale = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), plotX, plotW);
  const parts = chart.rows.map((row, k) => {
    const cy = top + k * ROW + ROW / 2;
    const v = row.values;
    const [a, q1, m, q3, b] = [v.min, v.q1, v.median, v.q3, v.max].map(scale.at);
    return (
      `<text x="${PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-label cr-${k}">${renderRich(row.label)}</text>` +
      `<g class="cr-${k}"><line x1="${r(a)}" x2="${r(b)}" y1="${r(cy)}" y2="${r(cy)}" class="chart-whisker"/>` +
      `<rect x="${r(q1)}" y="${r(cy - BAR)}" width="${r(Math.max(1, q3 - q1))}" height="${BAR * 2}" rx="${values.radius.sm}" class="chart-box grow"/>` +
      `<line x1="${r(m)}" x2="${r(m)}" y1="${r(cy - BAR)}" y2="${r(cy + BAR)}" class="chart-median"/>` +
      `<text x="${r(b + SPACE['3'])}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-value late">${formatNumber(v.median)}</text></g>`
    );
  });
  const bottom = top + chart.rows.length * ROW;
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(p + l + t), heap O(out), stack O(1)
// vars: p = 점 수, l = link 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 산점도: 같은 크기 점, 이름 글자, link 화살표. 계열이 있으면 계열 색이다. 신뢰구간은 받지 않는다.
function drawScatter(figure, top) {
  const { chart } = figure;
  const { sx, sy, frame, top: plotTop, right } = plotFrame(figure, top, chart.rows.map((p) => p.values.x), chart.rows.map((p) => p.values.y));
  const seriesIndex = (p) => Math.max(0, chart.series.findIndex((s) => s.id === p.values.series));
  const parts = [frame];
  const at = new Map(chart.rows.map((p) => [p.label, { x: sx.at(p.values.x), y: sy.at(p.values.y), p }]));
  // 점 이름은 점 오른쪽에 두고, 그림 오른쪽 끝을 넘으면 점 왼쪽으로 옮긴다. 화살촉이 이름을 피하게 하려고 이름 글자 상자를 먼저 구한다.
  const offset = DOT + SPACE['3'];
  const names = chart.rows.map((p) => {
    const { x, y } = at.get(p.label);
    const nameW = measure(p.label, TEXT['12']);
    const toLeft = x + offset + nameW > right;
    const width = measure(p.label, TEXT['11']);
    return { p, nameW, toLeft, box: { x0: toLeft ? x - offset - width : x + offset, x1: toLeft ? x - offset : x + offset + width, y0: y - TEXT['11'] / 2, y1: y + TEXT['11'] / 2 } };
  });
  for (const link of chart.links) {
    const [a, b] = [at.get(link.from), at.get(link.to)];
    const ka = chart.rows.indexOf(a.p);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
    // 두 점의 테두리에서 끊는다. 화살촉이 끝 점에 가려 방향이 안 보이는 일을 막기 위해서다.
    // 끝은 화살촉이 어느 점의 이름 글자 상자와도 겹치지 않을 때까지 시작 점 쪽으로 더 당긴다.
    const gap = DOT + SPACE['2'];
    let tip = gap;
    while (tip < length / 2 && names.some(({ box }) => arrowheadHits(b, ux, uy, tip, box))) tip += 1;
    const [x1, y1, x2, y2] = [a.x + ux * gap, a.y + uy * gap, b.x - ux * tip, b.y - uy * tip];
    parts.push(`<g class="cr-${ka}"><g class="cs-${seriesIndex(b.p)}"><line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" pathLength="1" class="chart-link draw" marker-end="url(#fl-arrow)"/></g></g>`);
  }
  const fits = [];
  names.forEach(({ p, nameW, toLeft }, k) => {
    const { x, y } = at.get(p.label);
    const i = seriesIndex(p);
    fits.push({ text: p.label, width: nameW, room: Math.max(right - x, x - PAD) - offset, line: p.line, what: 'point name' });
    const name = `<text x="${r(toLeft ? x - offset : x + offset)}" y="${r(centerBaseline(y, TEXT['11']))}" class="chart-name late${toLeft ? ' end' : ''}">${renderRich(p.label)}</text>`;
    parts.push(`<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(x)}" cy="${r(y)}" r="${DOT}" fill="${seriesColor(chart, i)}" class="pop"/>${name}</g></g>`);
  });
  parts.push(drawRules(chart.rules, sy, sx.at(sx.ticks[0]), sx.at(sx.ticks.at(-1)), 'y'));
  return { svg: parts.join('\n'), bottom: plotTop + SIZE['chart-plot-h'] + TEXT['11'] * 2 + SPACE['12'], rowKeys: chart.rows.map((p) => p.label), fits };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 화살표가 끝 점 b에서 끝 거리 tip만큼 떨어져 끝날 때 화살촉(끝에서 시작 쪽으로 뻗은 삼각형)이 글자 상자 box와 겹치는가. (ux, uy)는 시작 점에서 끝 점으로 향하는 단위 방향이다.
// 화살촉은 선 굵기 곱 토큰 크기라 선 굵기가 두꺼우면 크다. 삼각형의 세 꼭짓점과 가운데를 상자에 간격 `space.2`를 더해 본다.
function arrowheadHits(b, ux, uy, tip, box) {
  const length = values.size.marker * values.border.strong;
  const [tx, ty] = [b.x - ux * tip, b.y - uy * tip];
  const [bx, by] = [tx - ux * length, ty - uy * length];
  const [px, py] = [-uy * length * 0.4, ux * length * 0.4];
  const points = [[tx, ty], [bx + px, by + py], [bx - px, by - py], [bx, by], [(tx + bx) / 2, (ty + by) / 2]];
  const pad = SPACE['2'];
  return points.some(([x, y]) => x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad);
}

// cost: time O(p·s·STEPS + t), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, STEPS = timeAt의 이분 탐색 횟수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 차트: 계열마다 선과 점 표시. x 순서대로 잇는다. 신뢰구간은 계열 색의 옅은 띠(low~high)이고 선과 점은 띠 위에 그린다.
// 신뢰구간이 이어진 점이 하나뿐이면 띠가 면이 못 되므로 세로 오차 막대로 그린다.
function drawLine(figure, top) {
  const { chart } = figure;
  const points = [...chart.rows].sort((a, b) => a.values.x - b.values.x);
  const ys = points.flatMap((p) => chart.series.flatMap((s) => [p.values[s.id], p.values[`${s.id}.low`], p.values[`${s.id}.high`]])).filter((v) => v !== undefined);
  const { sx, sy, frame, top: plotTop } = plotFrame(figure, top, points.map((p) => p.values.x), ys);
  const parts = [frame];
  const order = new Map(points.map((p, k) => [p, k]));
  const ats = chart.series.map((s) => arrivals(points.map((p) => [sx.at(p.values.x), sy.at(p.values[s.id])])));
  chart.series.forEach((s, i) => {
    const bands = intervalRuns(points, s.id).map((run) => (run.length > 1 ? bandPath(run, s.id, sx, sy, seriesColor(chart, i)) : pointInterval(verticalInterval(sx.at(run[0].values.x), sy.at(run[0].values[`${s.id}.low`]), sy.at(run[0].values[`${s.id}.high`])), ats[i][order.get(run[0])])));
    if (bands.length) parts.push(`<g class="cs-${i}">${bands.join('')}</g>`);
  });
  chart.series.forEach((s, i) => {
    const d = points.map((p, k) => `${k ? 'L' : 'M'} ${r(sx.at(p.values.x))} ${r(sy.at(p.values[s.id]))}`).join(' ');
    parts.push(`<g class="cs-${i}"><path d="${d}" fill="none" stroke="${seriesColor(chart, i)}" stroke-width="${values.border.strong}" pathLength="1" class="draw"/></g>`);
  });
  chart.rows.forEach((p, k) => {
    for (const [i, s] of chart.series.entries()) parts.push(`<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(sx.at(p.values.x))}" cy="${r(sy.at(p.values[s.id]))}" r="${DOT}" fill="${seriesColor(chart, i)}" class="dot" data-at="${ats[i][order.get(p)]}"/></g></g>`);
  });
  parts.push(drawRules(chart.rules, sy, sx.at(sx.ticks[0]), sx.at(sx.ticks.at(-1)), 'y'));
  return { svg: parts.join('\n'), bottom: plotTop + SIZE['chart-plot-h'] + TEXT['11'] * 2 + SPACE['12'], rowKeys: chart.rows.map((p) => `x=${p.values.x}`), dotAts: [...new Set(ats.flat())].sort((a, b) => a - b) };
}

// cost: time O(p·STEPS), heap O(p), stack O(1)
// vars: p = 점 수, STEPS = timeAt의 이분 탐색 횟수
// basis: estimate
// 선이 점마다 닿는 시각. 선은 왼쪽부터 길이 순서로 그려지고(dashoffset) 길이 비율 f에 닿는 시간 비율은 easing.reveal을 거꾸로 푼 timeAt(f)이다.
// 값은 자라는 시간 대비 비율이고 소수 셋째 자리로 줄인다. 재생기와 움직이는 SVG가 이 값에 자라는 시간을 곱해 쓴다.
function arrivals(xy) {
  const lengths = [0];
  for (let k = 1; k < xy.length; k++) lengths.push(lengths[k - 1] + Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]));
  const total = lengths.at(-1) || 1;
  return lengths.map((length) => Math.round(timeAt(REVEAL, length / total) * 1000) / 1000);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// x 순서 점 가운데 신뢰구간이 있는 점의 이어진 묶음들
function intervalRuns(points, id) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p.values[`${id}.high`] !== undefined) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 묶음의 점 수
// basis: estimate
// 띠: high를 왼쪽에서 오른쪽으로, low를 오른쪽에서 왼쪽으로 이은 면. 계열이 자랄 때 왼쪽부터 드러난다(wipe).
function bandPath(run, id, sx, sy, color) {
  const edge = (p, key) => `${r(sx.at(p.values.x))} ${r(sy.at(p.values[`${id}.${key}`]))}`;
  const d = [...run.map((p) => edge(p, 'high')), ...[...run].reverse().map((p) => edge(p, 'low'))].map((xy, k) => `${k ? 'L' : 'M'} ${xy}`).join(' ');
  return `<path d="${d} Z" fill="${color}" class="chart-band wipe"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 세로 신뢰구간 경로: 세로선과 양 끝 가로 캡. yLow, yHigh는 화면 좌표다.
function verticalInterval(x, yLow, yHigh) {
  return `M ${r(x - CAP / 2)} ${r(yLow)} H ${r(x + CAP / 2)} M ${r(x)} ${r(yLow)} V ${r(yHigh)} M ${r(x - CAP / 2)} ${r(yHigh)} H ${r(x + CAP / 2)}`;
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 칸 수, out = 만든 SVG 글자 수
// basis: estimate
// 히트맵: 행과 열 이름, 값에 비례한 칸 진하기, 칸 안 값
function drawHeatmap(figure, top) {
  const { chart } = figure;
  const rows = [...new Set(chart.rows.map((c) => c.row))];
  const cols = [...new Set(chart.rows.map((c) => c.col))];
  const plotX = labelColumn(rows) + PAD;
  // 칸 너비는 이름 칸 오른쪽에서 내용의 오른쪽 끝까지 남은 폭을 열 수로 나눈 값이다. 상한 없이 채워 다른 차트처럼 960 폭을 채우고 좌우 여백이 같다. 칸 높이는 토큰 그대로다.
  const cellW = (RIGHT - plotX + SPACE['1']) / cols.length;
  const cellH = SIZE['chart-cell'];
  const max = Math.max(...chart.rows.map((c) => c.values.value));
  const parts = cols.map((c, j) => `<text x="${r(plotX + j * cellW + cellW / 2)}" y="${r(top + TEXT['11'])}" class="chart-tick">${renderRich(c)}</text>`);
  const gridTop = top + TEXT['11'] + SPACE['4'];
  rows.forEach((row, i) => parts.push(`<text x="${PAD}" y="${r(centerBaseline(gridTop + i * cellH + cellH / 2, TEXT['13']))}" class="chart-label">${renderRich(row)}</text>`));
  chart.rows.forEach((c, k) => {
    const [x, y] = [plotX + cols.indexOf(c.col) * cellW, gridTop + rows.indexOf(c.row) * cellH];
    const strength = max ? c.values.value / max : 0;
    parts.push(
      `<g class="cr-${k}"><rect x="${r(x)}" y="${r(y)}" width="${r(cellW - SPACE['1'])}" height="${r(cellH - SPACE['1'])}" rx="${values.radius.sm}" class="chart-heat" style="--s:${Math.round(strength * 1000) / 1000}" fill="${heatColor(strength)}"/>` +
        `<text x="${r(x + cellW / 2)}" y="${r(centerBaseline(y + cellH / 2, TEXT['11']))}" class="chart-cell${pickInk(heatColor(strength), HEAT_INK, HEAT_INK_ON) === HEAT_INK_ON ? ' on' : ''}">${formatNumber(c.values.value)}</text></g>`,
    );
  });
  // 열 이름은 칸 너비 안에 들어가야 한다. 넘으면 옆 열 이름과 겹친다.
  const fits = cols.map((c) => ({ text: c, width: measure(c, TEXT['11'], 'num'), room: cellW - SPACE['1'], line: chart.rows.find((row) => row.col === c).line, what: 'column name' }));
  fits.push(...rows.map((row) => labelFit(row, chart.rows.find((c) => c.row === row).line)));
  return { svg: parts.join('\n'), bottom: gridTop + rows.length * cellH, rowKeys: chart.rows.map((c) => `${c.row}\u0000${c.col}`), fits };
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 산점도와 선 차트의 그림 영역: 두 축, 격자, 눈금, 축 제목
function plotFrame(figure, top, xs, ys) {
  const { chart } = figure;
  const left = PAD + SIZE['chart-axis'];
  const plotH = SIZE['chart-plot-h'];
  // 세로축 제목은 그림 영역 위 한 줄에 둔다. 맨 위 눈금 글자와 겹치지 않게 그만큼 내린다.
  const titleH = chart.y ? values.size.text['11'] + SPACE['8'] : 0;
  top += titleH;
  const xKind = figure.chartType === 'scatter' ? chart.scale : 'linear';
  // 선 차트 가로축은 값 축이 아니라 0에서 시작하지 않는다(docs/design/charts.md 값 축 표).
  const xOptions = { fromZero: figure.chartType === 'scatter' };
  // 기준선은 세로 값 축에 긋는다. 기준선이 그림 밖에 그려지지 않게 값 범위에 넣는다.
  const ruledYs = [...ys, ...chart.rules.map((x) => x.value)];
  const yScale = makeScale(chart.scale, Math.min(...ruledYs), Math.max(...ruledYs), 0, plotH);
  const sy = { ...yScale, at: (v) => top + plotH - (yScale.at(v) - 0) };
  // 내용의 왼쪽 끝은 제목, 범례, 세로축 제목이 있으면 PAD, 없으면 세로축 눈금 글자의 왼쪽 끝이다. 오른쪽 끝은 그만큼 남긴다.
  const tickW = Math.max(...yScale.ticks.map((t) => measure(formatNumber(t), TEXT['11'], 'num')));
  const hasHeader = Boolean(figure.title || figure.subtitle || chart.series.length || chart.y);
  const right = WIDTH - Math.min(hasHeader ? PAD : Infinity, left - SPACE['3'] - tickW);
  const unitX = makeScale(xKind, Math.min(...xs), Math.max(...xs), 0, 1, xOptions);
  const plotW = fitLength(unitX, left, [...tickReach(unitX), ...xs.map((value) => ({ value, extra: DOT }))], right);
  const sx = makeScale(xKind, Math.min(...xs), Math.max(...xs), left, plotW, xOptions);
  const parts = [];
  for (const t of sy.ticks) parts.push(`<line x1="${left}" x2="${r(left + plotW)}" y1="${r(sy.at(t))}" y2="${r(sy.at(t))}" class="chart-grid"/><text x="${r(left - SPACE['3'])}" y="${r(centerBaseline(sy.at(t), TEXT['11']))}" class="chart-tick end">${formatNumber(t)}</text>`);
  for (const t of sx.ticks) parts.push(`<text x="${r(sx.at(t))}" y="${r(top + plotH + TEXT['11'] + SPACE['3'])}" class="chart-tick">${formatNumber(t)}</text>`);
  if (chart.x) parts.push(`<text x="${r(left + plotW)}" y="${r(top + plotH + TEXT['11'] * 2 + SPACE['8'])}" class="chart-unit">${renderRich(chart.x)}</text>`);
  if (chart.y) parts.push(`<text x="${PAD}" y="${r(top - titleH + values.size.text['11'])}" class="chart-unit start">${renderRich(chart.y)}</text>`);
  return { sx, sy, frame: parts.join(''), top, right };
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 값 축: 축선, 눈금 글자, 축 제목
function drawValueAxis(scale, x, width, y, title) {
  const ticks = scale.ticks.map((t) => `<text x="${r(scale.at(t))}" y="${r(y + TEXT['11'] + SPACE['3'])}" class="chart-tick">${formatNumber(t)}</text>`).join('');
  const label = title ? `<text x="${r(x + width)}" y="${r(y + TEXT['11'] * 2 + SPACE['6'])}" class="chart-unit">${renderRich(title)}</text>` : '';
  return `<line x1="${r(x)}" x2="${r(x + width)}" y1="${r(y)}" y2="${r(y)}" class="chart-axis"/>${ticks}${label}`;
}

// cost: time O(r), heap O(out), stack O(1)
// vars: r = 기준선 수, out = 만든 SVG 글자 수
// basis: estimate
// 기준선: 값 축에 수직인 점선과 라벨
function drawRules(rules, scale, from, to, axis) {
  return rules
    .map((rule) => {
      const at = scale.at(rule.value);
      return axis === 'x'
        ? `<line x1="${r(at)}" x2="${r(at)}" y1="${r(from - SPACE['3'])}" y2="${r(to)}" class="chart-rule"/><text x="${r(at + SPACE['2'])}" y="${r(from - SPACE['4'])}" class="chart-rule-label">${renderRich(rule.label)}</text>`
        : `<line x1="${r(from)}" x2="${r(to)}" y1="${r(at)}" y2="${r(at)}" class="chart-rule"/><text x="${r(to)}" y="${r(at - SPACE['2'])}" class="chart-rule-label end">${renderRich(rule.label)}</text>`;
    })
    .join('');
}

/** 차트 글자가 쓰는 글꼴. 숫자는 Inter의 자리 폭 같은 숫자(num)로 그린다. */
export const CHART_FACES = ['regular', 'semibold', 'num', 'numSemibold'];

// cost: time O(r + n), heap O(n), stack O(1)
// vars: r = 행 수, n = 글자 수
// basis: estimate
/** 차트에 쓰는 글자를 글꼴 조각에 모은다. */
export function chartText(figure) {
  const { chart } = figure;
  return [figure.title, figure.subtitle, chart.x, chart.y, chart.missing ?? '비교 없음', ...chart.series.map((s) => s.label), ...chart.rules.map((x) => x.label), ...chart.rows.flatMap((row) => [row.label ?? '', row.row ?? '', row.col ?? ''])]
    .filter(Boolean)
    .join('') + '0123456789.kM−+%-';
}

export { STYLE };
