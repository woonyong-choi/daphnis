// 켜짐과 꺼짐 상태를 CSS keyframes class로 바꾼다. 같은 켜짐 순서는 class 하나를 나눠 쓴다(docs/design/playback.md).
import { values } from '../tokens.js';

// 켜짐 구간 끝을 다음 구간 시작보다 이만큼(ms) 앞당긴다. 같은 퍼센트에 두 값이 겹치지 않게 하기 위해서다.
const EPSILON_MS = 0.1;
// 켜짐과 꺼짐이 바뀔 때 새 값으로 서서히 가는 시간(ms). HTML 재생기의 CSS transition(duration.fast)과 같다.
const FADE_MS = values.duration.fast;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * keyframes를 만들고 class 이름을 나눠 주는 그릇.
 * @param clock createClock 결과
 * @param segs 시간표 박자 목록
 * @param css keyframes와 class 규칙을 쌓는 목록
 * @returns { windows, fadeFrames }
 */
export function createWindows(clock, segs, css) {
  const names = new Map();

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 구간 수
  // basis: estimate
  // 구간 [시작, 끝, CSS] 목록을 keyframes 본문으로. 앞 구간과 값이 다르면 구간 시작에서 앞 값을 잡고 FADE_MS 동안 새 값으로 서서히 간다(재생기의 transition과 같다).
  // 한 바퀴의 첫 구간은 이전 값이 없어 바로 시작한다.
  function fadeFrames(spans) {
    const { percent } = clock;
    return spans
      .map(([start, end, value], i) => {
        const last = Math.max(start, end - EPSILON_MS);
        const settle = Math.min(start + FADE_MS, last);
        if (i === 0 || spans[i - 1][2] === value || settle <= start) return `${percent(start)},${percent(last)} { ${value} }`;
        return `${percent(start)} { ${spans[i - 1][2]} } ${percent(settle)},${percent(last)} { ${value} }`;
      })
      .join(' ');
  }

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 박자 수
  // basis: estimate
  /**
   * states[i]는 박자 i의 켜짐이다. { before, after, at }이면 박자 안 at(ms)에서 before가 after로 바뀐다.
   * 켜짐 순서와 켜짐, 꺼짐 CSS가 같으면 같은 class 이름을 돌려준다.
   * @param css { on, off }. 켜짐일 때와 꺼짐일 때의 CSS 선언
   */
  function windows(states, { on: onCss, off: offCss }) {
    const spans = segs.flatMap((s, i) => {
      const st = typeof states[i] === 'object' ? states[i] : { before: states[i], after: states[i], at: 0 };
      const at = s.t0 + st.at;
      return st.at > 0 && st.before !== st.after ? [[s.t0, at, st.before], [at, s.t1, st.after]] : [[s.t0, s.t1, st.after]];
    });
    const key = `${onCss}|${offCss}|${spans.map(([start, , on]) => `${Math.round(start)}${on ? 1 : 0}`).join('')}`;
    if (!names.has(key)) {
      const name = `a${names.size}`;
      names.set(key, name);
      const frames = fadeFrames(spans.map(([start, end, on]) => [start, end, on ? onCss : offCss]));
      css.push(`@keyframes ${name} { ${frames} }\n.fl .${name} { animation: ${name} ${clock.duration} infinite linear; }`);
    }
    return names.get(key);
  }

  return { windows, fadeFrames };
}
