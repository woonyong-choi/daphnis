// SMIL 값 풀기: 움직이는 SVG의 점 요소에서 속성을 읽고 한 바퀴 비율 x에서 값을 푼다. 움직임 시험이 시간표와 견줄 때 쓴다.

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 점 요소 하나씩 읽은 속성. 박자 순서와 이동 순서가 같아 시간표의 이동과 차례로 짝이 된다.
export function packetsOf(svg) {
  return svg
    .split('<g class="p')
    .slice(1)
    .map((chunk) => {
      // 점 보임 창은 calcMode="discrete"인 불투명도(같은 시각에 visibility도 이산으로 바뀌므로 속성 이름으로 가른다), 글 상자 흐려짐은 linear다. 모두 animate 요소라 모양으로 가른다.
      const attr = (tag, name, mode = '') => chunk.match(new RegExp(`<${tag}(?=[^>]*${mode})[^>]*?\\b${name}="([^"]*)"`))?.[1];
      const list = (tag, name, mode = '', sep = ';') => attr(tag, name, mode)?.split(sep).map((v) => (name === 'keySplines' ? v.split(' ').map(Number) : Number(v)));
      const shown = 'attributeName="opacity"[^>]*discrete';
      return {
        opacity: { dur: attr('animate', 'dur', shown), times: list('animate', 'keyTimes', shown), values: list('animate', 'values', shown) },
        motion: { dur: attr('animateMotion', 'dur'), times: list('animateMotion', 'keyTimes'), splines: list('animateMotion', 'keySplines'), points: list('animateMotion', 'keyPoints') },
        slide: { dur: attr('animateTransform', 'dur'), times: list('animateTransform', 'keyTimes'), values: attr('animateTransform', 'values')?.split(';') },
        href: attr('mpath', 'href'),
      };
    });
}

export function bezier(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 3차 곡선에서 시간 비율 x의 진행 비율. SMIL keySplines와 같은 정의다.
export function ease([x1, y1, x2, y2], x) {
  let [low, high] = [0, 1];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < x) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

// SMIL calcMode=spline(곡선) 또는 linear(단계 끝에서 잘리는 점, keySplines 없음) keyPoints의 경로 비율을 한 바퀴 비율 x에서 푼다.
export function pathFractionAt({ times, splines, points }, x) {
  const i = Math.min(times.length - 2, times.findLastIndex((time) => time <= x));
  const u = (x - times[i]) / (times[i + 1] - times[i]);
  return points[i] + (points[i + 1] - points[i]) * (splines ? ease(splines[i], u) : u);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 키 수
// basis: estimate
// 글 상자 옮김(animateTransform translate, linear) 값 [dx, dy]를 한 바퀴 비율 x에서 푼다.
export function slideAt({ times, values: levels }, x) {
  const i = Math.min(times.length - 2, times.findLastIndex((time) => time <= x));
  const u = times[i + 1] > times[i] ? (x - times[i]) / (times[i + 1] - times[i]) : 1;
  const [a, b] = [levels[i], levels[i + 1]].map((pair) => pair.split(' ').map(Number));
  return a.map((v, k) => v + (b[k] - v) * u);
}

// SMIL calcMode=discrete 값을 한 바퀴 비율 x에서 푼다.
export function discreteAt({ times, values }, x) {
  return values[times.findLastIndex((time) => time <= x)];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
/**
 * 움직이는 SVG의 값 요소마다 { kind: 'text' | 'flash', vi, text, dur(ms), times, values, linear }. 값 줄 번호 vi(그 장면의 값 줄 안 순서)는 요소의 속성이고,
 * 값 글자 요소(`data-v`)는 글(data-t)과 이산 불투명도를, 갱신 펄스 요소(`data-vf`)는 꺾은선 불투명도를 가진다.
 */
export function valueElementsOf(whole) {
  // 움직이는 SVG는 움직임 층(.fl-motion)과 스크립트 없는 마지막 모습 층(.fl-still)을 함께 싣는다. 마지막 모습 층은 움직임 줄이기에서만 보이므로 움직임 층만 푼다.
  const motionAt = whole.indexOf('<g class="fl-motion"');
  const svg = motionAt < 0 ? whole : whole.slice(motionAt, whole.indexOf('<g class="fl-still"', motionAt) < 0 ? undefined : whole.indexOf('<g class="fl-still"', motionAt));
  const pattern =/<(text|g|rect|path)\b([^>]*?\bdata-(v|vf)="(\d+)"[^>]*?)>((?:(?!<\/(?:g|text|rect|path)>)[\s\S])*?)<\/\1>/g;
  return [...svg.matchAll(pattern)].map(([, , opening, kind, vi, inner]) => {
    // 글자 요소는 visibility와 opacity 두 움직임을 갖는다. 보임은 opacity 움직임으로 읽는다. 움직임이 없으면 시작 불투명도가 그대로다.
    const animate = [...inner.matchAll(/<animate ([^>]*?)\/>/g)].map((m) => m[1]).find((tag) => /attributeName="opacity"/.test(tag));
    const text = opening.match(/\bdata-t="([^"]*)"/)?.[1];
    if (!animate) return { kind: kind === 'v' ? 'text' : 'flash', vi: Number(vi), text, dur: Infinity, times: [0], values: [Number(opening.match(/\bopacity="([^"]*)"/)?.[1] ?? 1)], linear: false };
    const attr = (name) => animate.match(new RegExp(`\\b${name}="([^"]*)"`))[1];
    return { kind: kind === 'v' ? 'text' : 'flash', vi: Number(vi), text, dur: Number.parseFloat(attr('dur')) * 1000, times: attr('keyTimes').split(';').map(Number), values: attr('values').split(';').map(Number), linear: attr('calcMode') === 'linear' };
  });
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 꼭짓점 수
// basis: estimate
/** SMIL 값을 한 바퀴 비율 x에서 푼다. discrete는 구간의 값 그대로, linear는 꼭짓점 사이를 직선으로 잇는다. */
export function animatedAt({ times, values: stops, linear }, x) {
  const at = times.findLastIndex((time) => time <= x);
  if (!linear || at === times.length - 1) return stops[at];
  return stops[at] + ((stops[at + 1] - stops[at]) * (x - times[at])) / (times[at + 1] - times[at]);
}

// cost: time O(r·e), heap O(r), stack O(1)
// vars: r = 값 줄 수, e = 줄마다 요소 수
// basis: estimate
/**
 * 시각 t(ms, 장면 처음부터)에 SMIL이 보이는 값 요소를 풀어 값 줄마다 { text, texts, flash(펄스 세기) }로. 글자가 안 보이는 줄은 text가 없다(undefined).
 * texts는 그 시각에 보이는 글자 요소의 글 목록이다. keyTimes가 소수 5자리라 값 구간의 경계에서는 두 요소가 잠깐 함께 보일 수 있으므로 하나뿐이어야 하는 검사는 경계 밖에서 부르는 쪽이 한다.
 */
export function smilStateAt(elements, rows, t) {
  return rows.map((row, vi) => {
    const mine = elements.filter((el) => el.vi === vi);
    const shown = mine.filter((el) => el.kind === 'text' && animatedAt(el, t / el.dur) === 1);
    const flash = Math.max(0, ...mine.filter((el) => el.kind === 'flash').map((el) => animatedAt(el, t / el.dur)));
    return { text: shown[0]?.text, texts: shown.map((el) => el.text), flash };
  });
}
