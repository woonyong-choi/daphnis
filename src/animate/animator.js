// 박자별 상태를 CSS keyframes class와 SMIL 점으로 바꾼다. 시계, 켜짐 keyframes, 점, 차트는 이 폴더의 파일이 나눠 맡는다.
import { chartSeriesIds, litIds } from '../timeline.js';
import { tokens } from '../tokens.js';
import { animateChart } from './chart.js';
import { createClock } from './clock.js';
import { drawPacket } from './packet.js';
import { createWindows } from './windows.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 움직이는 SVG의 움직임 만들기. 한 바퀴 시계 하나를 모든 요소가 나눠 쓴다.
 * @param timeline 시간표({ segs, total, growMs })
 * @returns { css, decorate, packet, windows, chart }
 */
export function createAnimator({ segs, total, growMs }) {
  const clock = createClock(total);
  const css = [];
  const { windows, fadeFrames } = createWindows(clock, segs, css);
  const lit = (j) => segs.map((s) => s.edgesOn.includes(j));
  const cardState = (n, test) => segs.map((s) => ({ before: test(s.cardsBefore[n]), after: test(s.cards[n]), at: s.cardsAt[n] ?? 0 }));
  const toggle = (states, on, off) => windows(states, { on, off });

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 박자 수
  // basis: estimate
  function decorate(kind, i, extra, scene) {
    const id = kind === 'group' ? scene?.groups[i]?.id : scene?.items[i]?.id;
    const c = tokens.color;
    switch (kind) {
      case 'node':
      case 'group':
        return toggle(segs.map((s) => litIds(s, scene.edges).has(id)), `stroke: ${c.accent}`, `stroke: ${c.border}`);
      case 'column':
        return toggle(segs.map((s) => s.columnsOn.includes(extra)), `fill: ${c['card-on']}`, 'fill: transparent');
      case 'edge':
        return toggle(lit(i), `stroke: ${c.accent}; stroke-width: ${tokens.border.strong}; marker-end: url(#fl-arrow-on)`, `stroke: ${c.muted}; stroke-width: ${tokens.border.edge}; marker-end: url(#fl-arrow)`);
      case 'pill':
        return toggle(lit(i), `fill: ${c['accent-fill']}; stroke: ${c['accent-fill']}`, `fill: ${c.bg}; stroke: ${c.border}`);
      case 'pilltext':
        return toggle(lit(i), `fill: ${c['on-accent']}`, `fill: ${c.muted}`);
      case 'quiet':
        return toggle(lit(i), 'opacity: 1', 'opacity: 0');
      case 'card':
        return toggle(cardState(id, (v) => v !== undefined), `stroke: ${c.accent}; fill: ${c['card-on']}`, `stroke: ${c.border}; fill: ${c.surface}`);
      case 'layer':
        return toggle(cardState(id, (v) => v === extra), 'opacity: 1', 'opacity: 0');
      case 'empty':
        return toggle(cardState(id, (v) => v === undefined), 'opacity: 1', 'opacity: 0');
      default:
        return '';
    }
  }

  const chart = (figure, drawn) => animateChart({ clock, segs, growMs, css, windows, fadeFrames }, chartSeriesIds(figure), drawn);
  const packet = (move, glyphs) => drawPacket(clock, move, glyphs);
  return { css, decorate, packet, windows, chart };
}
