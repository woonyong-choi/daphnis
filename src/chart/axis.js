// 차트 축: 값 축 길이 맞춤, 눈금, 축 제목, 기준선, 산점도와 선 차트의 그림 영역.
import { measure } from '../measure/fonts.js';
import { renderRich, roundCoord as r } from '../text.js';
import { labelColumn, labelFit } from './labels.js';
import { PAD, RIGHT, SPACE, TEXT } from './metrics.js';
import { formatNumber, makeScale } from './scale.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 요소 수
// basis: estimate
/**
 * 값 축 길이. 값 v의 요소는 start + 비율(v) × 길이 + extra까지 닿는다(extra는 값 글자, 점 반지름 같은 고정 폭).
 * 모든 요소가 right 안에 들어가는 가장 긴 길이를 돌려줘, 가장 멀리 닿는 요소가 right에 맞는다. 그래서 왼쪽 여백과 오른쪽 여백이 같다.
 * @param items { value, extra }[]. 비율이 0인 요소는 길이와 상관없어 건너뛴다
 * @param span { start, right }. right를 빼면 내용의 오른쪽 끝(RIGHT)이다
 */
export function fitLength(unit, items, { start, right = RIGHT }) {
  return Math.min(...items.map(({ value, extra }) => (unit.at(value) > 0 ? (right - start - extra) / unit.at(value) : Infinity)));
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 값 축 눈금 글자는 눈금 가운데에 놓여 양쪽으로 절반씩 나온다.
export function tickReach(unit) {
  return unit.ticks.map((value) => ({ value, extra: measure(formatNumber(value), TEXT['11'], 'num') / 2 }));
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 기준선 수
// basis: estimate
// 기준선 라벨은 기준선 오른쪽에서 시작한다.
export function ruleReach(rules) {
  return rules.map((rule) => ({ value: rule.value, extra: SPACE['2'] + measure(rule.label, TEXT['11']) }));
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 값 축: 축선, 눈금 글자, 축 제목
function drawValueAxis(scale, y, title) {
  const { start, length } = scale;
  const ticks = scale.ticks.map((t) => `<text x="${r(scale.at(t))}" y="${r(y + TEXT['11'] + SPACE['3'])}" class="chart-tick">${formatNumber(t)}</text>`).join('');
  const label = title ? `<text x="${r(start + length)}" y="${r(y + TEXT['11'] * 2 + SPACE['6'])}" class="chart-unit">${renderRich(title)}</text>` : '';
  return `<line x1="${r(start)}" x2="${r(start + length)}" y1="${r(y)}" y2="${r(y)}" class="chart-axis"/>${ticks}${label}`;
}

// cost: time O(r), heap O(out), stack O(1)
// vars: r = 기준선 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 기준선: 값 축에 수직인 점선과 라벨
 * @param span { axis, from, to }. axis 'x'는 세로선(값 축이 가로), 'y'는 가로선이다. from과 to는 선이 닿는 구간이다
 */
export function drawRules(rules, scale, { axis, from, to }) {
  return rules
    .map((rule) => {
      const at = scale.at(rule.value);
      return axis === 'x'
        ? `<line x1="${r(at)}" x2="${r(at)}" y1="${r(from - SPACE['3'])}" y2="${r(to)}" class="chart-rule"/><text x="${r(at + SPACE['2'])}" y="${r(from - SPACE['4'])}" class="chart-rule-label">${renderRich(rule.label)}</text>`
        : `<line x1="${r(from)}" x2="${r(to)}" y1="${r(at)}" y2="${r(at)}" class="chart-rule"/><text x="${r(to)}" y="${r(at - SPACE['2'])}" class="chart-rule-label end">${renderRich(rule.label)}</text>`;
    })
    .join('');
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/**
 * 막대, 덤벨, 상자의 값 축. 이름 칸 오른쪽에서 시작해 가장 멀리 닿는 요소가 오른쪽 끝에 맞는 길이다.
 * @param spec { kind, min, max, reaches }. reaches(unit)는 요소가 닿는 거리 목록이다
 * @returns { scale, plotX }
 */
export function rowValueScale(chart, { kind, min, max, reaches }) {
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const unit = makeScale(kind, { min, max, start: 0, length: 1 });
  const plotW = fitLength(unit, [...reaches(unit), ...tickReach(unit), ...ruleReach(chart.rules)], { start: plotX });
  return { scale: makeScale(kind, { min, max, start: plotX, length: plotW }), plotX };
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 가로 행 차트의 마무리: 기준선, 값 축, 아래 끝, 그림 검사 항목.
 * @param body { parts, over, scale, top, bottom }. parts는 행을 그린 SVG 조각, over는 기준선 위에 그릴 조각(값 글자), top과 bottom은 행이 차지하는 구간이다
 */
export function finishRowChart(chart, { parts, over = [], scale, top, bottom }) {
  const rules = drawRules(chart.rules, scale, { axis: 'x', from: top, to: bottom });
  const svg = [...parts, rules, ...over, drawValueAxis(scale, bottom + SPACE['4'], chart.x)];
  return { svg: svg.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}
