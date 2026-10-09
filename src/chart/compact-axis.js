// 좁은 그림의 가로축: 양 끝 눈금을 유지하고 중간 눈금은 글자 폭에 맞춰 표시한다.
import { measure, wrap } from '../measure/fonts.js';
import { renderRich, roundCoord as r } from '../text.js';
import { SPACE, TEXT } from './metrics.js';

// cost: time O(t + n²), heap O(t + n), stack O(1)
// vars: t = 눈금 수, n = 축 제목 글자 수
// basis: estimate
export function compactAxis(scale, y, title) {
  const size = TEXT['11'];
  const lineHeight = size + SPACE['6'];
  const ticks = scale.ticks.map((value, i) => ({ x: scale.at(value), label: scale.labels[i], width: measure(scale.labels[i], size, 'num') }));
  const first = ticks[0], last = ticks.at(-1);
  const start = first.x, end = last.x;
  first.x += first.width / 2;
  last.x -= last.width / 2;
  const stagger = start + first.width + SPACE['6'] > end - last.width;
  const baseline = y + size + SPACE['3'];
  let right = start + first.width;
  const visible = [first];
  if (!stagger) for (const tick of ticks.slice(1, -1)) {
    if (tick.x - tick.width / 2 < right + SPACE['6'] || tick.x + tick.width / 2 + SPACE['6'] > end - last.width) continue;
    visible.push(tick);
    right = tick.x + tick.width / 2;
  }
  visible.push(last);
  const parts = visible.map((tick) => `<text x="${r(tick.x)}" y="${r(baseline + (stagger && tick === last ? lineHeight : 0))}" class="chart-tick">${tick.label}</text>`);
  let bottom = baseline + (stagger ? lineHeight : 0);
  if (title) for (const line of wrap(title, end - start, { size })) {
    bottom += lineHeight;
    parts.push(`<text x="${r(end)}" y="${r(bottom)}" class="chart-unit">${renderRich(line)}</text>`);
  }
  return { svg: parts.join(''), bottom: bottom + SPACE['1-5'] };
}
