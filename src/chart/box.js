// 상자 차트: 최소-최대 수염, q1-q3 상자, 가운데 값 선
import { measure } from '../measure/fonts.js';
import { roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, labelText, valueText } from './labels.js';
import { BAR, ROW, SPACE, TEXT } from './metrics.js';
import { formatNumber } from './scale.js';

// 상자 높이(막대 두께의 두 배)와 q1과 q3가 같을 때도 보이는 최소 너비
const BOX_H = BAR * 2;
const BOX_MIN_W = SPACE['0-5'];

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 축 범위와 길이. 가운데 값 글자가 수염 끝 옆에 놓이므로 그 폭만큼 오른쪽을 남긴다.
function boxScale(chart) {
  const all = chart.rows.flatMap((row) => [row.values.min, row.values.max]);
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const reaches = () => chart.rows.map((row) => ({ value: row.values.max, extra: SPACE['3'] + measure(formatNumber(row.values.median), TEXT['11'], 'num') }));
  return rowValueScale(chart, { kind: chart.scale, min: Math.min(...ruled), max: Math.max(...ruled), reaches });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 수염, 상자, 가운데 값 선, 그리고 이름과 가운데 값 글자
function boxRow(ctx, row, k) {
  const { scale, cy } = ctx;
  const v = row.values;
  const [a, q1, m, q3, b] = [v.min, v.q1, v.median, v.q3, v.max].map(scale.at);
  const texts = inkGroup(k, labelText(row.label, cy, 'chart-label') + valueText({ x: b + SPACE['3'], cy }, formatNumber(v.median), 'chart-value late'));
  return (
    `<g class="cr-${k}"><line x1="${r(a)}" x2="${r(b)}" y1="${r(cy)}" y2="${r(cy)}" class="chart-whisker"/>` +
    `<rect x="${r(q1)}" y="${r(cy - BAR)}" width="${r(Math.max(BOX_MIN_W, q3 - q1))}" height="${BOX_H}" rx="${values.radius.sm}" class="chart-box grow"/>` +
    `<line x1="${r(m)}" x2="${r(m)}" y1="${r(cy - BAR)}" y2="${r(cy + BAR)}" class="chart-median"/></g>` +
    texts
  );
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawBoxes(figure, top) {
  const { chart } = figure;
  const { scale } = boxScale(chart);
  const parts = chart.rows.map((row, k) => boxRow({ scale, cy: top + k * ROW + ROW / 2 }, row, k));
  return finishRowChart(chart, { parts, scale, top, bottom: top + chart.rows.length * ROW });
}
