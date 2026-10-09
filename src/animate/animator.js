// 박자별 상태를 CSS keyframes class와 SMIL 점으로 바꾼다. 시계, 켜짐 keyframes, 점, 차트는 이 폴더의 파일이 나눠 맡는다.
import { litIds } from '../timeline.js';
import { PULSE, PULSE_MS } from '../pulse.js';
import { tokens } from '../tokens.js';
import { animateChart } from './chart.js';
import { drawStatusPills } from '../draw/status.js';
import { drawFlashes, drawValues } from '../draw/values.js';
import { discreteWindows } from './discrete.js';
import { hopLegs } from './legs.js';
import { paintOf } from '../draw/paint.js';
import { drawPacket } from './packet.js';
import { pulseAnimate } from './pulse.js';
import { createWindows } from './windows.js';

// 고정 알약의 활성 색은 점이 올라 오는 데 올라감 시간, 떠난 뒤 중립으로 돌아오는 데 펄스 전체 시간(올라감, 머묾, 내려감의 합)이 걸린다. 재생기와 같다.
const PILL_FADE = Object.freeze({ on: PULSE.rise, off: PULSE_MS });

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 움직이는 SVG의 움직임 만들기. 한 바퀴 시계 하나를 모든 요소가 나눠 쓴다. 정지(static) 시계는 마지막 상태만 정한다: 점과 펄스가 없고 값과 상태 알약이 마지막 모습으로 놓인다.
 * @param timeline 장면 하나로 자른 시간표({ segs, total, growMs, pulses })
 * @param clock createClock 결과
 * @returns { css, decorate, packet, windows, chart, values, flashes, status, isStatic }. values(scene, timeline, glyphs)는 값 글자와 큐 찬 칸 요소, flashes(scene, timeline)는 값이 바뀔 때 켜지는 배경 면, status(scene, timeline, glyphs)는 장면별 도형 상태 알약 층이다. decorate(scene)은 (kind, i, extra)로 요소의 켜짐 class를 돌려주는 함수를 만든다
 */
export function createAnimator({ segs, growMs, pulses = [], marks = {} }, clock, { prefix = '', root = '.fl' } = {}) {
  const css = [];
  const isStatic = clock.mode === 'static';
  const { windows, spanWindows, stack } = createWindows(clock, segs, css, prefix);
  // 값 글자와 상태 알약은 장면이 끝난 뒤에도 마지막 모습으로 남는다.
  // holdEnd를 끄면 장면 끝까지 이어지는 구간도 그 끝에서 꺼진다. 같은 자리에서 다음 글이 이어받는 값 글자의 앞 글이 쓴다(끝에서 바뀐 값의 앞 글이 남아 겹치면 안 된다).
  const discrete = (spans, { holdEnd = true } = {}) => (isStatic ? '' : discreteWindows(clock, spans, { holdEnd }));
  const motion = {
    segs,
    toggle: (states, on, off) => windows(states, { on, off }),
    // 조용한 선이 보이는 구간(시간표의 marks `quiet:번호`). 지나간 적이 없으면 늘 숨는다.
    quiet: (j, options) => spanWindows(marks[`quiet:${j}`] ?? [], options) ?? windows(segs.map(() => false), options),
    // 점이 이 선을 지나는 동안(HTML 재생기의 `is-current`와 같은 구간). 지나간 선은 누적 켜짐이어도 이 구간에만 강조한다.
    moving: (j, options) => spanWindows(segs.flatMap((s) => s.hops.flatMap((hop) => hopLegs(hop).filter((leg) => leg.edge === j).map((leg) => [s.t0 + (hop.at ?? 0) + leg.from, s.t0 + (hop.at ?? 0) + leg.to]))), options),
    // 도형은 `light`가 켠 것만 켜 둔다. 점이 닿은 도형은 테두리 후광(borders)이 맡는다.
    litNode: (id) => segs.map((s) => litIds(s).has(id)),
    cardState: (n, test) => segs.map((s) => ({ before: test(s.cardsBefore[n]), after: test(s.cards[n]), at: s.cardsAt[n] ?? 0 })),
    stack,
  };
  const decorate = (scene) => (kind, i, extra) => decorateElement(kind, { id: (kind.startsWith('group') ? scene?.groups[i] : scene?.items[i])?.id, i, extra, scene }, motion);
  const chart = (card) => animateChart({ clock, segs, growMs, css, windows, root }, card);
  const packet = isStatic ? () => '' : (move, glyphs) => drawPacket(clock, move, glyphs);
  const atsOf = (key) => pulses.filter((p) => p.key === key).map((p) => p.at);
  const valueRows = (scene, timeline, glyphs) => drawValues(scene, timeline, { glyphs, windows: discrete, isStatic });
  // 배경 면은 글이 없고 카드 내용 층 안에 놓이므로 불투명도만 바꾼다(안쪽 visibility는 바깥 층의 hidden을 이긴다).
  const plain = (spans) => (isStatic ? '' : discreteWindows(clock, spans, { holdEnd: true, withVisibility: false }));
  const flashes = (scene, timeline) => (isStatic ? undefined : drawFlashes(scene, timeline, { windows: plain, pulse: (vi) => pulseAnimate(clock, atsOf(`value:${timeline.values[vi].number ?? vi}`)), row: (key) => pulseAnimate(clock, atsOf(key)) }));
  // 점이 도형에 닿을 때의 후광: 도형 윤곽(`.fl-stroke`)과 같은 모양의 겹침 선이 80/80/240 화면 ms 동안 나타났다 사라진다. 면과 선 굵기는 바뀌지 않는다.
  const borders = (scene) => (isStatic ? undefined : (index, shape) => borderPulse(shape, pulseAnimate(clock, atsOf(`node:${scene.items[index].id}`))));
  const status = (scene, timeline, glyphs) => drawStatusPills(scene, timeline, { glyphs, windows: discrete, isStatic, name: (_, item) => item });
  return { css, decorate, packet, windows, chart, values: valueRows, flashes, borders, status, isStatic };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 도형 윤곽 글자 수
// basis: estimate
// 도형을 그린 글에서 윤곽 요소(`class="fl-stroke ..."`)마다 겹침 선을 만든다. 후광이 없는 도형(anim이 빈 글)은 빈 글이다.
function borderPulse(shape, anim) {
  if (!anim) return '';
  return [...shape.matchAll(/<(\w+)\b[^>]*\sclass="(fl-stroke[^"]*)"[^>]*\/>/g)]
    .map(([tag, name, classes]) => {
      // 색을 직접 고른 도형(`ps-이름`)의 후광은 그 계열의 effect 단계로 칠한다. 색을 고르지 않은 도형은 상태 파랑이다.
      const chosen = classes.split(/\s+/).filter((cls) => cls.startsWith('ps-'));
      return `${tag.replace(/\sclass="[^"]*"/, ` class="${['fl-pulse', ...chosen].join(' ')}" opacity="0" aria-hidden="true"`).replace(/\s*\/>$/, '>')}${anim}</${name}>`;
    })
    .join('');
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 박자 수
// basis: estimate
// 요소 종류별 켜짐과 꺼짐 스타일. 강조 그룹은 평소 그 색의 진한 단계(ink) 1.5px 테두리이고, 색을 고른 도형은 그 색의 outline 단계 1px이다. target은 { id, i, extra, scene }(i는 요소 번호, extra는 열 이름이나 카드 층)다.
function decorateElement(kind, { id, i, extra, scene }, { segs, toggle, quiet, moving, litNode, cardState, stack }) {
  const c = tokens.color;
  switch (kind) {
    case 'node': {
      // `light`가 켠 도형은 윤곽을 그대로 두고 옅은 면만 바꾼다(명시한 상태). 색을 직접 고른 도형은 상태로 바꾸지 않는다.
      const box = scene.items[i];
      return paintOf(box ?? {}) ? '' : toggle(litNode(id), `fill: color-mix(in srgb, ${tokens.simple2['hover-fill']} 70%, ${c.node})`, `fill: ${c.node}`);
    }
    case 'group':
      // 그룹은 가장 뒤의 조직 정보라 장면에 따라 바뀌지 않는다.
      return '';
    case 'cell':
      return toggle(segs.map((s) => s.partsOn.includes(extra)), `fill: ${tokens.simple2['row-selection']}`, `fill: ${c.node}`);
    case 'part':
      return toggle(segs.map((s) => s.partsOn.includes(extra)), `fill: ${c['card-on']}`, 'fill: transparent');
    // 조용한 선은 보임(불투명도)과 강조(색)가 한 요소에서 따로 움직이므로 한 class에 쌓는다. 따로 걸면 뒤의 `animation`이 앞의 것을 덮는다.
    case 'edge':
      return stack([scene.edges[i]?.quiet ? quiet(i, { on: 'opacity: 1', off: 'opacity: 0' }) : undefined, moving(i, { on: `color: ${c.state.active}`, off: `color: ${scene.edges[i]?.isMark ? c.fg : c.line}` })]);
    // 고정 라벨 알약은 늘 보인다. 점이 선 위에 있는 동안 테두리와 글자만 활성 색이고(알약과 글 전체의 불투명도는 그대로), 점이 떠나면 중립 색으로 PILL_FADE 동안 돌아온다.
    case 'pill':
      return moving(i, { on: `stroke: ${c.state.active}`, off: `stroke: ${tokens.simple2.separator}`, fade: PILL_FADE }) ?? '';
    case 'pilltext':
      return moving(i, { on: `fill: ${c.state.active}`, off: `fill: ${c.muted}`, fade: PILL_FADE }) ?? '';
    // 조용한 선의 라벨 알약 묶음(l-번호)은 선 요소(e-번호)와 다른 요소라 같은 보임 구간을 따로 건다. 알약과 글자의 활성 색은 안쪽 요소의 'pill', 'pilltext'가 맡아 이 묶음의 `animation`과 겹치지 않는다.
    case 'quiet':
      return quiet(i, { on: 'opacity: 1', off: 'opacity: 0' }) ?? '';
    case 'card':
      return toggle(cardState(id, (v) => v !== undefined), `opacity: 1`, `opacity: 0`);
    // 카드 내용 층은 글을 담으므로 안 보일 때 접근성 트리에서도 빠지게 visibility를 함께 바꾼다. 켜짐과 꺼짐이 경계 시각에 바로 바뀌므로 두 층이 함께 보이는 구간이 없다.
    case 'layer':
      return toggle(cardState(id, (v) => v === extra), 'opacity: 1; visibility: visible', 'opacity: 0; visibility: hidden');
    default:
      return '';
  }
}
