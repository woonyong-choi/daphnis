// 켜짐과 꺼짐 상태를 CSS keyframes class로 바꾼다. 같은 켜짐 순서는 class 하나를 나눠 쓴다(docs/design/playback.md).
// 정지(static) 시계는 keyframes 없이 마지막 상태의 선언을 class에 그대로 적는다.
// 켜짐과 꺼짐은 논리 경계 시각에 바로 바뀐다. HTML 재생기는 시각마다 정한 값을 그 시각에 쓰므로(상태에 CSS 전환을 걸지 않는다) 움직이는 SVG도 같은 시각에 같은 모습이어야 한다.
// 서서히 가는 시간은 저작된 움직임(고정 알약의 활성 색 꼬리)만 `fade`로 직접 적는다.

// 켜짐 구간 끝을 다음 구간 시작보다 이만큼(ms) 앞당긴다. 같은 퍼센트에 두 값이 겹치지 않게 하기 위해서다.
const EPSILON_MS = 0.1;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * keyframes를 만들고 class 이름을 나눠 주는 그릇.
 * @param clock createClock 결과
 * @param segs 시간표 박자 목록
 * @param css keyframes와 class 규칙을 쌓는 목록
 * @param prefix class 이름 앞에 붙이는 글. 한 문서에 움직임 층과 마지막 모습 층이 함께 있을 때 두 층의 class가 겹치지 않게 한다
 * @returns { windows, spanWindows, stack }
 */
export function createWindows(clock, segs, css, prefix = '') {
  const ctx = { clock, css, names: new Map(), prefix };

  /**
   * states[i]는 박자 i의 켜짐이다. { before, after, at }이면 박자 안 at(ms)에서 before가 after로 바뀐다.
   * 켜짐 순서와 켜짐, 꺼짐 CSS가 같으면 같은 class 이름을 돌려준다.
   * @param css { on, off, fade }. 켜짐일 때와 꺼짐일 때의 CSS 선언. 구간 시작에서 바로 바뀐다. fade는 { on, off }(ms)로 저작된 움직임이 켜짐과 꺼짐으로 바뀔 때 서서히 가는 시간을 정한다
   */
  const windows = (states, options) => register(ctx, spansOf(states, segs), options);

  /**
   * 한 바퀴 안의 켜지는 시각 구간(ms)만 켜짐인 class. 박자 경계와 상관없는 짧은 구간(점이 선을 지나는 동안)에 쓴다. 구간이 없으면 undefined다.
   * @param onSpans [시작, 끝][]. 겹치면 하나로 합친다
   */
  const spanWindows = (onSpans, options) => (onSpans.length ? register(ctx, flatOf(onSpans, segs.at(-1).t1), options) : undefined);

  /**
   * 한 요소에 켜짐 class가 둘 이상 걸리면 class마다 `animation` 속성을 적어 뒤의 것이 앞의 것을 덮는다. 그 class들의 애니메이션을 속성 하나에 쌓은 class 이름을 돌려준다.
   * 정지 시계의 class는 속성별 선언이라 덮이지 않으므로 이름만 잇는다.
   * @param names windows, spanWindows가 돌려준 class 이름 목록(undefined는 건너뛴다)
   */
  const stack = (names) => {
    const list = names.filter(Boolean);
    if (list.length < 2 || clock.mode === 'static') return list.join(' ');
    const key = `stack|${list.join('|')}`;
    if (!ctx.names.has(key)) {
      const name = `${prefix}a${ctx.names.size}`;
      ctx.names.set(key, name);
      css.push(`.fl .${name} { animation: ${list.map((own) => `${own} ${clock.duration} ${clock.css} linear`).join(', ')}; }`);
    }
    return ctx.names.get(key);
  };

  return { windows, spanWindows, stack };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
// 구간 [시작, 끝, 켜짐] 목록을 keyframes와 class로 등록한다. 같은 내용이면 같은 class 이름을 돌려준다.
function register({ clock, css, names, prefix }, flat, { on: onCss, off: offCss, fade }) {
  const key = `${fade ? `${fade.on}/${fade.off}|` : ''}${onCss}|${offCss}|${flat.map(([start, , on]) => `${Math.round(start)}${on ? 1 : 0}`).join('')}`;
  if (!names.has(key)) {
    const name = `${prefix}a${names.size}`;
    names.set(key, name);
    if (clock.mode === 'static') {
      css.push(`.fl .${name} { ${flat.at(-1)[2] ? onCss : offCss}; }`);
    } else {
      // 구간마다 그 구간으로 바뀔 때 걸리는 시간: fade가 있으면 켜짐과 꺼짐이 따로이고, 없으면 바로 바뀐다
      const fadeOf = (isOn) => (fade ? fade[isOn ? 'on' : 'off'] : 0);
      const frames = framesOf(flat.map(([start, end, on]) => [start, end, on ? onCss : offCss, fadeOf(on)]), clock.percent);
      css.push(`@keyframes ${name} { ${frames} }\n.fl .${name} { animation: ${name} ${clock.duration} ${clock.css} linear; }`);
    }
  }
  return names.get(key);
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
// 구간 [시작, 끝, CSS, 걸리는 시간] 목록을 keyframes 본문으로. 걸리는 시간이 0이면 구간 시작에서 바로 바뀐다. 0보다 크고 앞 구간과 값이 다르면 구간 시작에서 앞 값을 잡고 그 시간 동안 새 값으로 서서히 간다.
// 한 바퀴의 첫 구간은 이전 값이 없어 바로 시작한다. 마지막 구간은 한 바퀴 끝(100%)까지 이어 마지막 펄스까지 보여 주는 꼬리에서도 마지막 상태를 지킨다.
function framesOf(spans, percent) {
  return spans
    .map(([start, end, value, own], i) => {
      const last = Math.max(start, end - EPSILON_MS);
      const settle = Math.min(start + own, last);
      const stop = i === spans.length - 1 ? '100%' : percent(last);
      if (i === 0 || spans[i - 1][2] === value || settle <= start) return `${percent(start)},${stop} { ${value} }`;
      return `${percent(start)} { ${spans[i - 1][2]} } ${percent(settle)},${stop} { ${value} }`;
    })
    .join(' ');
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
// 박자별 켜짐을 [시작, 끝, 켜짐] 구간으로. 박자 안에서 켜짐이 바뀌면 그 박자는 두 구간이다.
function spansOf(states, segs) {
  return segs.flatMap((s, i) => {
    const st = typeof states[i] === 'object' ? states[i] : { before: states[i], after: states[i], at: 0 };
    const at = s.t0 + st.at;
    return st.at > 0 && st.before !== st.after ? [[s.t0, at, st.before], [at, s.t1, st.after]] : [[s.t0, s.t1, st.after]];
  });
}

// cost: time O(h log h), heap O(h), stack O(1)
// vars: h = 켜지는 구간 수
// basis: estimate
// 켜지는 구간 [시작, 끝] 목록(겹치면 합친다)을 한 바퀴 [0, total]을 덮는 [시작, 끝, 켜짐] 구간으로.
function flatOf(onSpans, total) {
  const merged = [...onSpans].sort((a, b) => a[0] - b[0]).reduce((out, [start, end]) => (out.length && start <= out.at(-1)[1] ? [...out.slice(0, -1), [out.at(-1)[0], Math.max(out.at(-1)[1], end)]] : [...out, [start, end]]), []);
  const flat = merged.flatMap(([start, end], i) => [...(start > (merged[i - 1]?.[1] ?? 0) ? [[merged[i - 1]?.[1] ?? 0, start, false]] : []), [start, end, true]]);
  const tail = merged.at(-1)[1];
  return tail < total ? [...flat, [tail, total, false]] : flat;
}
