// 같은 톤 팔레트 계산. 색마다 사람이 정한 원색(ANCHORS)에서 테마별 fill, stroke, ink를 대비 규칙으로 찾는다.
// fill은 옅은 면, stroke는 그래픽(3 이상), ink는 글자(4.5 이상)다. 원색이 규칙을 넘으면 원색 그대로, 못 넘으면 같은 색상과 채도에서 밝기만 옮긴다. sRGB 밖이면 채도만 줄인다(oklch.mjs).
// 대비 기준 수치는 WCAG 규칙값이고 색 취향이 아니라 토큰이 아닌 상수다. 면의 값은 토큰 정본에서 읽은 것을 받는다.
import * as carbon from '@carbon/colors';
import { contrast } from '../../src/contrast.js';
import { valueNames } from '../../src/source/grammar.js';
import { VISION, distanceOf, seenBy } from './color-vision.mjs';
import { oklchOf, oklchToHex } from './oklch.mjs';

// 실험: 색 제안안. 대비 규칙으로 계산하지 않고 견본의 값을 그대로 쓴다. 범주색은 가장 가까운 역할 색으로 잇는다.
const PROPOSAL = true;
const ROLE = {
  blue: { 'light-fill': '#eaf2fd', 'light-stroke': '#3a7bd5', 'light-ink': '#3a7bd5', 'light-heat-low': '#c7dbf7', 'light-heat-high': '#2563b8', 'light-icon': '#3a7bd5', 'dark-fill': '#1b2a45', 'dark-stroke': '#6aa1ff', 'dark-ink': '#6aa1ff', 'dark-heat-low': '#223a5c', 'dark-heat-high': '#3f74c8', 'dark-icon': '#8fb6ff' },
  orange: { 'light-fill': '#fff1e8', 'light-stroke': '#e65200', 'light-ink': '#e65200', 'dark-fill': '#3a2417', 'dark-stroke': '#ff8a3d', 'dark-ink': '#ff8a3d' },
  red: { 'light-fill': '#ffeef0', 'light-stroke': '#f04452', 'light-ink': '#f04452', 'dark-fill': '#3d1e24', 'dark-stroke': '#ff6b77', 'dark-ink': '#ff6b77' },
  green: { 'light-fill': '#e8f7ef', 'light-stroke': '#03a564', 'light-ink': '#03a564', 'dark-fill': '#13302a', 'dark-stroke': '#3ed598', 'dark-ink': '#3ed598' },
  gray: { 'light-fill': '#e0e8f0', 'light-stroke': '#6b7684', 'light-ink': '#6b7684', 'dark-fill': '#23252a', 'dark-stroke': '#9aa1ab', 'dark-ink': '#9aa1ab' },
};
// 세 번째 이후 흐름 점은 진한 회색이다.
const FLOW_DOT = { 'light-dot': '#4e5968', 'dark-dot': '#c3c8cf' };
const PROPOSAL_TABLE = {
  blue: ROLE.blue, orange: ROLE.orange, red: ROLE.red,
  amber: ROLE.orange, pink: ROLE.orange,
  green: { ...ROLE.green, ...FLOW_DOT }, teal: { ...ROLE.green, ...FLOW_DOT },
  navy: { ...ROLE.blue }, purple: { ...ROLE.blue, ...FLOW_DOT },
  slate: { ...ROLE.gray, ...FLOW_DOT },
};
for (const name of ['navy', 'purple']) for (const k of ['light-heat-low', 'light-heat-high', 'light-icon', 'dark-heat-low', 'dark-heat-high', 'dark-icon']) delete PROPOSAL_TABLE[name][k];

const TEXT = 4.5;
const GRAPHIC = 3;
const STEP = 0.002;
const MAX_STEPS = 400;
/**
 * 원색 표. 팔레트 값에서 사람이 정한 입력은 이 표(파랑, 주황, 그리고 색마다 Carbon 색 이름)뿐이고 나머지는 모두 계산이다. 라이트와 다크 한 쌍이다.
 * 참고 이력서(hyunseob.github.io/resume)의 파랑 #3a7bd5(라이트)와 #6aa1ff(다크)가 축이다. 주황은 비교(data.compare) 전용이다.
 * 색상 50도는 red(25도 근처)와 yellow(85도 근처)의 가운데이고, 밝기와 채도(L 0.685, C 0.148)는 파랑(C 0.153) 수준이라 톤이 어긋나지 않는다.
 * 나머지 색은 IBM Carbon 색 체계(@carbon/colors, Apache-2.0)에서 가져온다. 색마다 Carbon 색 계열의 10~100 단계 가운데 OKLCH 밝기가 우리 파랑에 가장 가까운 단계를 쓴다. 계열 대응은 CARBON_FAMILY다.
 * 뽑힌 단계(라이트, 다크): red 60 #da1e28, 40 #ff8389 / yellow(amber) 60 #8e6a00, 40 #d2a106 / green 50 #24a148, 40 #42be65 / teal 50 #009d9a, 40 #08bdba / purple 50 #a56eff(60 #8a3ffc에서 이웃 단계로, STEP_OVERRIDE), 40 #be95ff / magenta(pink) 60 #d02670, 40 #ff7eb6 / coolGray(slate) 60 #697077, 40 #a2a9b0.
 * 대비 규칙에 모자란 원색은 같은 색상과 채도에서 밝기만 옮긴다. 이 이동은 build()가 한다.
 */
const BLUE = { light: '#3a7bd5', dark: '#6aa1ff' };
const ORANGE = { light: '#e65200', dark: '#ff8a3d' };
const RED = { light: '#f04452', dark: '#ff6b77' };
const GREEN = { light: '#03a564', dark: '#3ed598' };
// 팔레트 색 이름 → Carbon 색 계열. teal은 cyan(파랑과 너무 가깝다)을 쓰지 않는다. slate는 gray 색의 팔레트 이름이다.
const CARBON_FAMILY = { red: 'red', amber: 'yellow', green: 'green', teal: 'teal', purple: 'purple', pink: 'magenta', slate: 'coolGray' };
// navy는 지금 파랑과 구별되는 것이 먼저라 밝기가 가장 가까운 단계 대신 Carbon blue 계열에서 파랑과 OKLab 거리가 0.1 이상 떨어진 가장 가까운 단계를 쓴다. 라이트 blue 70 #0043ce, 다크 blue 60 #0f62fe.
const NAVY_STEP = { light: 70, dark: 60 };
// 가장 가까운 단계가 구별 규칙을 못 지켜 같은 계열의 이웃 단계로 옮긴 곳. 체계 밖 값은 쓰지 않는다. purple 라이트 60은 색상각이 295도라 카드 태그 색이 파랑(257도)과 40도 안에 든다. 50은 298도다.
const STEP_OVERRIDE = { purple: { light: 50 } };

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 계열 단계 수
// basis: estimate
// Carbon 계열에서 OKLCH 밝기가 target에 가장 가까운 단계의 `#rrggbb`.
function nearestStep(family, target) {
  const targetL = oklchOf(target)[0];
  return Object.values(carbon[family]).reduce((best, hex) => (Math.abs(oklchOf(hex)[0] - targetL) < Math.abs(oklchOf(best)[0] - targetL) ? hex : best));
}

export const ANCHORS = {
  blue: BLUE,
  orange: ORANGE,
  red: RED,
  green: GREEN,
  ...Object.fromEntries(Object.entries(CARBON_FAMILY).filter(([name]) => name !== 'red' && name !== 'green').map(([name, family]) => [name, { light: carbon[family][STEP_OVERRIDE[name]?.light] ?? nearestStep(family, BLUE.light), dark: nearestStep(family, BLUE.dark) }])),
  navy: { light: carbon.blue[NAVY_STEP.light], dark: carbon.blue[NAVY_STEP.dark] },
};
// 면 단계의 목표 밝기와 채도 상한. 다크는 옅은 면이 판 바탕과 도형 바탕에서 보이도록 distance.fill-dark 이상 떨어져야 하고, 대비 기준에 걸리면 밝기를 낮추다가 거리를 못 지키면 오류다.
//  원색 채도가 이보다 낮으면 원색 채도를 쓴다. 대비 기준에 걸리면 밝기를 옮긴다.
const FILL = { light: { L: 0.965, C: 0.025, step: STEP }, dark: { L: 0.36, C: 0.06, step: -STEP } };
// 파랑의 히트맵 두 끝. low는 그림 바탕과 대비 1.5(꾸밈 요소 기준)가 되는 가장 옅은 값이고 채도 상한은 HEAT_LOW_C다. high는 흰 글자와의 대비가 라이트 7(옛 #1d5d91 값), 다크 4.5 이상인 가장 밝은 값이다.
const HEAT_LOW_C = { light: 0.06, dark: 0.05 };
const HEAT_LOW_FLOOR = 1.5;
const HEAT_HIGH_FLOOR = { light: 7, dark: 4.5 };
const HEAT_LOW_START = { light: 0.95, dark: 0.25 };
// 구성도 아이콘 파랑(figure.icon). 밝기와 채도는 NHN Cloud 아이콘 파랑(라이트 #125de6)과 지금까지의 다크 아이콘 파랑(#6f9cf5)에서 읽고, 색상은 지금 파랑(blue 원색)보다 ICON_HUE_GAP도 보랏빛으로 돌려 아이콘이 지금 일어나는 것으로 읽히지 않게 한다.
const ICON = { light: '#125de6', dark: '#6f9cf5' };
const ICON_HUE_GAP = 10;
// 갈래색 이름(grammar의 tone 값 목록) → 팔레트 색. gray만 원색 층 이름이 slate다.
const PALETTE_OF = { gray: 'slate' };
// 점 단계가 고르는 밝기의 간격과 범위
const DOT_STEP = 0.02;
const DOT_RANGE = { light: [0.3, 0.62], dark: [0.55, 0.97] };

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 찾는 걸음 수
// basis: estimate
// 원색 그대로가 ok면 원색, 아니면 start에서 step씩 밝기를 옮기며 처음으로 ok를 만족하는 `#rrggbb`. 걸음이 MAX_STEPS를 넘으면 오류다.
function search({ anchor, start, step, chroma, hue }, ok) {
  if (anchor && ok(anchor)) return anchor;
  for (let i = 0; i < MAX_STEPS; i++) {
    const hex = oklchToHex(start + step * i, chroma, hue);
    if (ok(hex)) return hex;
  }
  throw new Error(`no lightness reaches the floor (hue ${hue}, chroma ${chroma})`);
}

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 면 수
// basis: estimate
const reaches = (hex, faces, floor) => faces.every((face) => contrast(hex, face) >= floor);

// cost: time O(h·f·s), heap O(h), stack O(1)
// vars: h = 색 수, f = 면 수, s = 찾는 걸음 수
// basis: estimate
/**
 * 한 테마의 색마다 { fill, stroke, ink }를 만든다. blue는 히트맵 두 끝 heat-low, heat-high와 구성도 아이콘 icon도 만든다.
 * @param theme 'light' | 'dark'
 * @param faces { surfaces, fg, muted, border, onActive, white, bg }. surfaces는 그림 면 `#rrggbb` 목록(카드 바탕은 blue fill이라 여기 없다), white는 히트맵 글자색이다
 * @returns { 색이름: { fill, stroke, ink, dot? } }. dot은 갈래색 이름에만 있다
 */
export function generateTheme(theme, faces) {
  const { surfaces, fg, muted, border, onActive, white, bg, node, darkFill } = faces;
  const anchors = Object.fromEntries(Object.entries(ANCHORS).map(([name, pair]) => [name, { hex: pair[theme], lch: oklchOf(pair[theme]) }]));
  const fills = {};
  for (const [name, { lch: [, C, hue] }] of Object.entries(anchors)) {
    const spec = { start: FILL[theme].L, step: FILL[theme].step, chroma: Math.min(FILL[theme].C, C), hue };
    fills[name] = search(spec, (hex) => reaches(hex, [fg, muted], TEXT) && contrast(hex, border) >= GRAPHIC);
    if (theme === 'dark' && !(distanceOf(seenBy(VISION.normal, fills[name]), seenBy(VISION.normal, bg)) >= darkFill.bg && distanceOf(seenBy(VISION.normal, fills[name]), seenBy(VISION.normal, node)) >= darkFill.node)) throw new Error(`the dark fill of ${name} is too close to the figure ground or the node face`);
  }
  const allFills = Object.values(fills);
  const down = theme === 'light' ? -STEP : STEP;
  const out = {};
  for (const [name, { hex, lch: [L, C, hue] }] of Object.entries(anchors)) {
    const stroke = search({ anchor: hex, start: L, step: down, chroma: C, hue }, (value) => reaches(value, [...surfaces, ...allFills], GRAPHIC));
    const ink = search({ anchor: stroke, start: oklchOf(stroke)[0], step: down, chroma: C, hue }, (value) => reaches(value, [...surfaces, ...allFills, onActive], TEXT));
    out[name] = { fill: fills[name], stroke, ink };
  }
  const [, blueC, blueHue] = anchors.blue.lch;
  out.blue['heat-low'] = search({ start: HEAT_LOW_START[theme], step: down, chroma: Math.min(HEAT_LOW_C[theme], blueC), hue: blueHue }, (value) => contrast(value, bg) >= HEAT_LOW_FLOOR);
  out.blue['heat-high'] = search({ start: anchors.blue.lch[0], step: -STEP, chroma: blueC, hue: blueHue }, (value) => contrast(value, white) >= HEAT_HIGH_FLOOR[theme]);
  const [iconL, iconC] = oklchOf(ICON[theme]);
  const iconHue = blueHue + ICON_HUE_GAP;
  out.blue.icon = search({ anchor: oklchToHex(iconL, iconC, iconHue), start: iconL, step: down, chroma: iconC, hue: iconHue }, (value) => reaches(value, [...surfaces, ...allFills], GRAPHIC));
  return addDots(out, theme, { surfaces, fills: allFills, onActive, anchors, flowMin: faces.flowMin });
}

// cost: time O(c^k·k²·v), heap O(c·k), stack O(k)
// vars: c = 후보 밝기 수, k = 갈래색 수, v = 시각 수
// basis: estimate
/**
 * 갈래색(tone) 이름마다 점 단계(dot)를 더한다. 원색과 같은 색상과 채도이고 밝기만 다르다.
 * 이름끼리, 그리고 지금(blue stroke)과 비교(orange stroke)와 가장 가까울 때의 OKLab 거리가 flowMin 이상인 조합 가운데 ink 밝기에서 가장 덜 벗어난 조합을 고른다.
 * 후보는 ink 자신과 밝기 격자 가운데 그림 면 위 3, 이동 글 상자 글자(onActive)와 4.5 이상인 것이다. 같은 값이면 먼저 찾은 조합이다.
 */
function addDots(out, theme, { surfaces, fills, onActive, anchors, flowMin }) {
  const names = valueNames('tone').map((tone) => PALETTE_OF[tone] ?? tone);
  const [low, high] = DOT_RANGE[theme];
  const options = names.map((name) => {
    const [, chroma, hue] = anchors[name].lch;
    const inkL = oklchOf(out[name].ink)[0];
    const lightness = [inkL];
    for (let L = low; L <= high + 1e-9; L += DOT_STEP) lightness.push(L);
    const found = [];
    for (const L of lightness) {
      const hex = L === inkL ? out[name].ink : oklchToHex(L, chroma, hue);
      if (reaches(hex, [...surfaces, ...fills], GRAPHIC) && contrast(hex, onActive) >= TEXT) found.push({ hex, shift: Math.abs(L - inkL), coords: Object.values(VISION).map((matrix) => seenBy(matrix, hex)) });
    }
    return found;
  });
  const reference = [out.blue.stroke, out.orange.stroke].map((hex) => seenBy(VISION.normal, hex));
  let best = { shift: Infinity, picks: [] };
  const choose = (k, picks, shift) => {
    if (shift >= best.shift) return;
    if (k === names.length) {
      const pairs = picks.flatMap((p, i) => picks.slice(i + 1).map((q) => Math.min(...p.coords.map((c, v) => distanceOf(c, q.coords[v])))));
      const nearest = Math.min(...pairs, ...picks.flatMap((p) => reference.map((r) => distanceOf(p.coords[0], r))));
      if (nearest >= flowMin) best = { shift, picks };
      return;
    }
    for (const option of options[k]) choose(k + 1, [...picks, option], shift + option.shift);
  };
  choose(0, [], 0);
  if (!best.picks.length) throw new Error(`no lightness set keeps the flow colors ${flowMin} apart (${theme})`);
  names.forEach((name, k) => {
    out[name].dot = best.picks[k].hex;
  });
  return out;
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본(Map)의 토큰을 점 이름 경로 → $value 표로 편다.
function flatten(node, path, out) {
  if (node instanceof Map && node.has('$value')) out.set(path.join('.'), node.get('$value'));
  else if (node instanceof Map) for (const [key, child] of node) if (!key.startsWith('$')) flatten(child, [...path, key], out);
  return out;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 참조 사슬 길이
// basis: estimate
// 이름 `color.x`의 `#rrggbb`. 참조 `{...}`를 끝까지 따라간다.
function resolve(table, name) {
  let value = table.get(name);
  while (typeof value === 'string' && value.startsWith('{')) value = table.get(value.slice(1, -1));
  if (!/^#[0-9a-f]{6}$/.test(value ?? '')) throw new Error(`${name} is not a color: ${value}`);
  return value;
}

// 그림 면. 그래픽 3과 글자 4.5를 이 면들 위에서 맞춘다. 카드 바탕(card-on)은 blue fill이라 따로 넣지 않고 모든 fill 목록이 맡는다.
const SURFACES = ['bg', 'node', 'group', 'card', 'page', 'surface'];

// cost: time O(h·f·s), heap O(h), stack O(1)
// vars: h = 색 수, f = 면 수, s = 찾는 걸음 수
// basis: estimate
/**
 * 토큰 정본(tokens.json, tokens.dark.json을 읽은 Map)에서 테마별 색 단계를 만든다.
 * 다크 표는 라이트 표 위에 덮어 쓴 것이다. 색마다 원색은 ANCHORS에서 온다.
 * @returns { 색이름: { 'light-fill', 'light-stroke', 'light-ink', 'dark-fill', 'dark-stroke', 'dark-ink' } }. blue는 heat-low, heat-high 단계가 더 있다
 */
export function generatePalette(light, dark) {
  if (PROPOSAL) return structuredClone(PROPOSAL_TABLE);
  const lightTable = flatten(light, [], new Map());
  const darkTable = new Map([...lightTable, ...flatten(dark, [], new Map())]);
  const result = Object.fromEntries(Object.keys(ANCHORS).map((name) => [name, {}]));
  for (const [theme, table] of [['light', lightTable], ['dark', darkTable]]) {
    const faces = {
      surfaces: SURFACES.map((name) => resolve(table, `color.${name}`)),
      fg: resolve(table, 'color.fg'),
      muted: resolve(table, 'color.muted'),
      border: resolve(table, 'color.border'),
      bg: resolve(table, 'color.bg'),
      node: resolve(table, 'color.node'),
      darkFill: { bg: table.get('distance.fill-dark.bg'), node: table.get('distance.fill-dark.node') },
      onActive: resolve(table, 'color.state.on-active'),
      white: resolve(table, 'color.data.heat-ink-on'),
      flowMin: table.get('distance.flow'),
    };
    for (const [name, steps] of Object.entries(generateTheme(theme, faces))) {
      for (const [stage, hex] of Object.entries(steps)) result[name][`${theme}-${stage}`] = hex;
    }
  }
  return result;
}
