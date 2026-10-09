import { verifyTheme } from '../scripts/theme-snapshot.mjs';
// 색과 대비: 글자 4.5, 그래픽 3, 꾸밈 요소 1.5와 1.3(docs/design/docs-integration.md 대비 기준 표). 토큰 정본(tokens.json, tokens.dark.json)에서 라이트와 다크 색을 풀어 잰다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { heatLook } from '../src/chart/heatmap.js';
import { mixOklab } from '../src/chart/oklab.js';
import { contrast, mixHex, pickInk } from '../src/contrast.js';
import { toSvg } from '../src/svg.js';
import { TONES, toneColors } from '../src/tone.js';
import { values } from '../src/tokens.js';
import { VISION } from '../scripts/lib/color-vision.mjs';
import { oklchToHex } from '../scripts/lib/oklch.mjs';
import { valueNames } from '../src/source/grammar.js';
import { chartOf, chartSource, colorRoleOf, linearChannelsOf as channelsOf, linearToOklab, oklchOf, themeColor, tokenValue } from './helpers.js';

const roleOf = colorRoleOf;
const TEXT = 4.5;
const GRAPHIC = 3;
// 꾸밈 요소는 WCAG 적용 대상 밖이다. 값이나 상태를 전하지 않고 구조만 돕는다.
const DECORATIVE_LINE = 1.5;
const DECORATIVE_PLATE_EDGE = 1.3;
const FIGURE_FACES = ['bg', 'node', 'group-1', 'group-2', 'group-3', 'card-on'];
const DOCUMENT_FACES = ['page'];
const ALL_FACES = [...FIGURE_FACES, ...DOCUMENT_FACES];
const BORDER_FACES = [...FIGURE_FACES, 'surface', ...DOCUMENT_FACES];
// 강조 글자는 그룹 바탕 위에 놓이지 않는다. 카드 표시는 내용이 찬 카드 바탕(card-on)에, 링크는 문서 면에 놓인다.
const TEXT_FACES = ['bg', 'node', 'card-on', ...DOCUMENT_FACES];
const TEXT_ROLES = ['state.active-text', 'ui.link'];
// 색 이름(tone, fill, stroke)이 쓰는 색은 범주 색 도우미의 계열 일곱과 무채색 gray다(src/tone.js). 시험은 도우미가 실제로 돌려주는 토큰 참조를 읽는다.
// 이동 점은 원색 면이고 그래픽 대비는 윤곽이 맡는다. 노랑 경계는 라이트에서 3에 못 미쳐 직접 라벨을 요구하므로(범주 팔레트) 다크에서만 3을 잰다.
const OUTLINED_TONES = TONES.filter((name) => toneColors(name).outline !== undefined);
const YELLOW_OUTLINES = ['data.compare-outline', 'data.category-outline.2'];
const GRAPHIC_ROLES = ['state.active', 'ui.focus', 'ui.progress', 'data.main', 'figure.icon', ...OUTLINED_TONES.filter((name) => name !== 'yellow').map((name) => roleOf(toneColors(name).outline))];
const THEMES = ['light', 'dark'];
// 가장 가까운 단계를 확인하는 간격. 생성기는 이 시험이 나열하지 않은 면(카드 바탕, 옅은 면의 한계)도 지키므로 이 면들만의 최소보다 몇 걸음 더 갈 수 있다.
const STROKE_STEP = 0.016;
// 노랑으로 읽히는 OKLCH 색상각 범위. 정확한 면 색은 별도 단언한다.
const YELLOW_HUE = [85, 110];
const CVD_MIN_DISTANCE = 0.1;
const MIN_TAG_HUE_GAP = 40;
const NEUTRAL_CHROMA = 0.03;
const FPS = 60;
const MS_PER_SECOND = 1000;
// 히트맵 시험 그림의 칸 수(HEAT_FIGURE)
const HEAT_CELLS = 6;
const PERCENT = 100;
const HEAT_STEPS = 1000;
// 한 단계 위나 아래 색을 만드는 섞음 비율. 이보다 작은 차이는 같은 단계로 본다.
const STEP_MIX = 0.01;
// 글자 크기 이웃 단계의 최소 비율. 1px 차이 단계는 크기로 구분되지 않아 굵기와 색에만 기댄다.
const MIN_STEP_RATIO = 1.15;

const color = themeColor;
// 색의 원색은 design-tokens가 기록한 값이다. 다크에서도 옮기지 않으므로 두 모드가 같다.
const ANCHORS = Object.fromEntries(['blue', 'orange'].map((hue) => [hue, { light: tokenValue(`color.category.${hue}.anchor`), dark: tokenValue(`color.category.${hue}.anchor`) }]));
const opacity = (name) => tokenValue(`opacity.${name}`);

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 쌍 수
// basis: estimate
function expectAtLeast(theme, minimum, pairs) {
  for (const [a, b] of pairs) {
    const ratio = contrast(color(theme, a), color(theme, b));
    assert.ok(ratio >= minimum, `${theme} ${a} on ${b}: ${ratio.toFixed(2)} < ${minimum}`);
  }
}

const SRC = new URL('../src/', import.meta.url);
const GENERATED_OR_SOURCE = new Set(['tokens.js', 'tokens.css', 'tokens.json', 'tokens.dark.json']);
// 원색 층(color.palette.*)을 가리키는 꼴: 토큰 경로, 중괄호 참조, CSS 변수, 대괄호 접근. 낱말 palette만으로는 걸리지 않는다(chart-palette.js 가져오기와 설명 글은 허용).
const PRIMITIVE_ACCESS = /\bcolor\.palette\b|\{color\.palette\.|--color-palette-|\bcolor\[\s*['"`]palette['"`]\s*\]|\.palette\.(?:[a-z]+)\.\d/;
const HEX_VALUE = /^#[0-9a-f]{6}$/;
// 줄 주석과 블록 주석을 걷어 낸다. `https://`처럼 글 안의 `//`는 건드리지 않으려고 줄 처음이나 공백 뒤의 `//`만 주석으로 본다.
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = src 아래 파일 수
// basis: estimate
// src 아래 코드와 CSS 파일. 토큰 정본과 생성물은 뺀다.
function codeFiles() {
  verifyTheme();
  return readdirSync(SRC, { recursive: true })
    .filter((name) => /\.(js|css)$/.test(name) && !GENERATED_OR_SOURCE.has(name) && !name.startsWith('design-theme/'))
    .map((name) => ({ name, text: readFileSync(new URL(name, SRC), 'utf8') }));
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본의 토큰을 [점 이름 경로, 값] 목록으로 편다.
function listTokens(node, path = []) {
  if (node && typeof node === 'object' && '$value' in node) return [[path.join('.'), node.$value]];
  return Object.entries(node).flatMap(([key, child]) => (key.startsWith('$') || typeof child !== 'object' ? [] : listTokens(child, [...path, key])));
}


// 근거: 규칙 docs-integration.md 대비 기준 표: 본문·보조·강조·태그 글자, 켜진 면 위 글자, 켜진 탭 글자는 모든 면에서 4.5 이상
test('contrast_text_pairs_reach_4_5_in_both_themes', () => {
  for (const theme of THEMES) {
    expectAtLeast(theme, TEXT, ['bg', 'node', 'surface', 'card-on', 'group-1', 'group-2', 'group-3', 'page'].flatMap((face) => [['fg', face], ['muted', face]]));
    expectAtLeast(theme, TEXT, TEXT_FACES.flatMap((face) => TEXT_ROLES.map((role) => [role, face])));
    expectAtLeast(theme, TEXT, [['state.on-active', 'state.active-fill'], ['fg', 'ui.control-on'], ['muted', 'bg']]);
    for (const face of ['node', 'surface', 'card-on']) {
      // 태그 띠는 색 이름의 면색을 opacity.tag로 카드 바탕 위에 깐 것이고, 그 위 글자는 본문색이다.
      for (const tone of TONES) {
        const band = mixHex(color(theme, face), color(theme, roleOf(toneColors(tone).fill)), opacity('tag'));
        const ratio = contrast(color(theme, 'fg'), band);
        assert.ok(ratio >= TEXT, `${theme} tag ${tone} on ${face}: ${ratio.toFixed(2)}`);
      }
    }
  }
});

// 근거: 규칙 docs-integration.md 대비 기준 표: 강조 그래픽, 계열 막대와 점, 도형 외곽선(color.outline), 켜진 탭 고리, 신뢰구간 선은 3 이상(WCAG 그래픽, 예외 없음). 머리카락 테두리(border)는 꾸밈 요소라 이 표가 아니라 아래 꾸밈 기준을 따른다
test('contrast_graphic_pairs_reach_3_in_both_themes', () => {
  for (const theme of THEMES) {
    expectAtLeast(theme, GRAPHIC, ALL_FACES.flatMap((face) => GRAPHIC_ROLES.map((role) => [role, face])));
    if (theme === 'dark') expectAtLeast(theme, GRAPHIC, ALL_FACES.flatMap((face) => YELLOW_OUTLINES.map((role) => [role, face])));
    else assert.equal(values.color.data['category-label'][2], 'required', 'the light yellow boundary needs a direct label');
    expectAtLeast(theme, GRAPHIC, BORDER_FACES.flatMap((face) => [['outline', face]]));
    expectAtLeast(theme, GRAPHIC, [['fg', 'bg'], ['node', 'figure.icon']]);
  }
});

// 근거: 흐름 점과 태그 위 글자는 색 이름의 면과 대비 4.5 이상이다. 밝은 노랑은 전용 어두운 글자 역할(category-on)을 쓴다. 색 이름은 일곱 계열과 gray이고 시험은 도우미가 돌려주는 참조를 읽는다.
test('contrast_tone_faces_carry_the_text_on_them_at_4_5_in_both_themes', () => {
  assert.deepEqual(TONES, ['blue', 'yellow', 'red', 'green', 'orange', 'purple', 'cyan', 'gray']);
  for (const theme of THEMES) expectAtLeast(theme, TEXT, TONES.map((tone) => [roleOf(toneColors(tone).ink), roleOf(toneColors(tone).fill)]));
});

// 근거: 규칙 docs-integration.md 대비 기준 표 "꾸밈 요소": 격자, 히트맵 값 0 칸, 신뢰구간 띠 1.5 이상, 문서용 판 테두리 1.3 이상
test('contrast_decorative_pairs_reach_their_lower_floors', () => {
  for (const theme of THEMES) {
    expectAtLeast(theme, DECORATIVE_LINE, [['data.grid', 'bg'], ['data.heat-low', 'bg']]);
    for (const series of ['data.main']) {
      const ratio = contrast(mixHex(color(theme, 'bg'), color(theme, series), opacity('range')), color(theme, 'bg'));
      assert.ok(ratio >= DECORATIVE_LINE, `${theme} range band ${series}: ${ratio.toFixed(2)}`);
    }
    expectAtLeast(theme, DECORATIVE_PLATE_EDGE, [['plate-border', 'page']]);
  }
});

// 근거: 규칙 docs-integration.md 대비 기준 표 "히트맵 칸 숫자와 그 칸 색은 어느 강도에서나 4.5 이상"(평소와 흐림). 버그: 히트맵 대비
test('contrast_heat_cell_text_reaches_4_5_on_every_strength_lit_and_dimmed', () => {
  for (const theme of THEMES) {
    const heat = { low: color(theme, 'data.heat-low'), high: color(theme, 'data.heat-high'), ink: color(theme, 'data.heat-ink'), inkOn: color(theme, 'data.heat-ink-on') };
    const bg = color(theme, 'bg');
    for (let step = 0; step <= HEAT_STEPS; step++) {
      const look = heatLook(step / HEAT_STEPS, heat);
      const lit = contrast(pickInk(look.fill, heat.ink, heat.inkOn), look.fill);
      const face = mixHex(bg, look.fill, opacity('dim'));
      const dimmed = contrast(mixHex(face, heat.ink, opacity('dim-ink')), face);
      assert.ok(lit >= TEXT, `${theme} lit strength ${step / HEAT_STEPS} (${look.fill}): ${lit.toFixed(2)}`);
      assert.ok(dimmed >= TEXT, `${theme} dimmed strength ${step / HEAT_STEPS}: ${dimmed.toFixed(2)}`);
    }
  }
  assert.equal(color('dark', 'data.heat-ink'), color('dark', 'data.heat-ink-on'), '다크는 글자색이 하나라 빌드 때 라이트로 고른 글자색이 다크에서도 맞다');
});

// 근거: 규칙 docs-integration.md 대비 기준 표 "글자 4.5 예외 없음": 밝히지 않은 행의 값 글자(fg)와 보조 글자(muted)는 흐린 상태에서도 4.5 이상. 버그: dim-ink 0.65에서 muted가 라이트 3.18, 다크 3.51
test('contrast_dimmed_row_text_keeps_value_and_helper_text_at_4_5', () => {
  for (const theme of THEMES) {
    const bg = color(theme, 'bg');
    for (const role of ['fg', 'muted']) {
      const ratio = contrast(mixHex(bg, color(theme, role), opacity('dim-ink')), bg);
      assert.ok(ratio >= TEXT, `${theme} dimmed ${role}: ${ratio.toFixed(2)} < ${TEXT}`);
    }
  }
});

// 근거: 결정 #14 "라이트 그림 바탕 #f6f7f9, 그룹 바탕은 그보다 아주 약간 진하게(깊이 1 group-1, 단계 간격을 넓혀 차이 33 이하), 카드는 흰색으로 바탕보다 한 톤 위"
test('figureGround_light_bg_is_gray_group_is_slightly_darker_and_node_face_is_brighter_in_both_themes', () => {
  const sum = (hex) => Number.parseInt(hex.slice(1, 3), 16) + Number.parseInt(hex.slice(3, 5), 16) + Number.parseInt(hex.slice(5, 7), 16);
  const [bg, group, node] = ['bg', 'group-1', 'node'].map((name) => color('light', name));

  assert.equal(node, '#ffffff');
  assert.ok(sum(bg) <= sum('#f8f9fb') && sum(bg) < sum(node), bg);
  assert.ok(sum(group) < sum(bg) && sum(bg) - sum(group) <= 33, group);
  for (const theme of THEMES) assert.ok(contrast(color(theme, 'node'), color(theme, 'bg')) > 1.05, `${theme} node on bg`);
  // 그룹과 그 안 노드는 두 테마 모두 다른 면이다(다크 그룹이 노드와 같은 색이던 문제)
  for (const theme of THEMES) assert.notEqual(color(theme, 'group-1'), color(theme, 'node'), `${theme} group face equals node face`);
});

// 근거: 결정 docs-integration.md "대비 규칙이 색 선택보다 우선: 원색이 기준을 넘으면 원색, 못 넘으면 같은 색상에서 기준을 넘는 가장 가까운 단계를 쓴다". 새 규칙(NHN 색 역할)에서도 파랑과 주황의 선(stroke)은 원색이거나 기준을 넘는 가장 가까운 단계이고, 글자 단계(ink)는 글자가 놓이는 면 위 4.5를 넘는 가장 가까운 단계이며, 외곽선(outline)은 면 위 3을 넘는 가장 어두운(다크는 밝은) 값이다
test('palette_graphic_text_and_outline_colors_are_the_closest_step_that_reaches_their_floor', () => {
  const graphicFaces = ['bg', 'group-1', 'group-2', 'group-3', 'card-on', 'node', 'page'];
  const lowest = (value, faces, theme = 'light') => Math.min(...faces.map((face) => contrast(value, color(theme, face))));
  for (const hue of ['blue', 'orange']) {
    for (const theme of THEMES) {
      const stroke = color(theme, `${hue}.${theme}-stroke`);
      const [L, C, h] = oklchOf(stroke);
      const back = oklchToHex(L + (theme === 'light' ? STROKE_STEP : -STROKE_STEP), C, h);
      const reachesFloor = (value) => lowest(value, graphicFaces, theme) >= GRAPHIC;

      assert.ok(reachesFloor(stroke), `${theme} ${hue} stroke reaches 3`);
      assert.ok(stroke === ANCHORS[hue][theme] || !reachesFloor(back), `${theme} ${hue} stroke is the anchor or the closest step`);
    }
  }
  // 글자 단계(ink)는 그림 면(판, 도형, 그룹 셋, 카드 바탕)과 자기 면, 켜진 글 상자 글자 위에서 4.5를 맞추는 가장 가까운 단계다.
  for (const theme of THEMES) {
    const textFaces = ['bg', 'node', 'group-1', 'group-2', 'group-3', 'card', 'card-on'].map((face) => color(theme, face));
    const strong = color(theme, 'state.active-text');
    const [strongL, strongC, strongH] = oklchOf(strong);
    const back = oklchToHex(strongL + (theme === 'light' ? STROKE_STEP : -STROKE_STEP), strongC, strongH);
    assert.ok(Math.min(...textFaces.map((face) => contrast(strong, face))) >= TEXT && Math.min(...textFaces.map((face) => contrast(back, face))) < TEXT, `${theme} active text step`);
  }
  assert.ok(contrast(color('light', 'state.active'), color('light', 'group-3')) < TEXT, 'state.active itself is a graphic color, not a text color');
  // 외곽선은 바탕 쪽으로 한 단계 가면(라이트는 흰색, 다크는 검정 반대인 흰색 쪽이 아니라 면 쪽) 3 아래로 떨어져야 최소 값이다.
  for (const [theme, toward] of [['light', '#ffffff'], ['dark', '#000000']]) {
    const outline = color(theme, 'outline');
    const outlineFaces = ['bg', 'node', 'group-1', 'group-2', 'group-3', 'card', ...['sky', 'purple'].flatMap((hue) => [1, 2, 3].map((level) => `paint.${hue}.group-${level}`))];

    assert.ok(lowest(outline, outlineFaces, theme) >= GRAPHIC && lowest(mixHex(outline, theme === 'light' ? '#ffffff' : '#000000', STEP_MIX), outlineFaces, theme) < GRAPHIC, `${theme} outline step`);
  }
});

// 근거: simple2의 파란 강조를 쓰고, 비교 계열은 요청한 밝은 노랑이고 밝은 바탕과의 대비는 중립 경계가 맡는다. 주황은 주의(state.warning)에만 남고 청록은 성공과 흐름 색(flow.green)으로 따로 남는다.
test('palette_blue_uses_simple2_anchor_and_compare_series_uses_yellow_with_a_yellow_boundary', () => {
  const SIMPLE2_BLUE = tokenValue('color.category.blue.anchor');
  const [, , blueHue] = oklchOf(SIMPLE2_BLUE);
  const orange = color('light', 'orange.light-stroke');

  assert.equal(color('light', 'state.active'), SIMPLE2_BLUE);
  assert.equal(color('light', 'data.main'), SIMPLE2_BLUE);
  for (const theme of THEMES) {
    assert.equal(color(theme, 'data.compare'), tokenValue('color.category.yellow.anchor'));
    assert.equal(color(theme, 'data.compare'), color(theme, 'data.compare-fill'));
    const [, chroma, hue] = oklchOf(color(theme, 'data.compare-outline'));
    assert.ok(chroma > NEUTRAL_CHROMA);
    assert.ok(hue >= YELLOW_HUE[0] && hue <= YELLOW_HUE[1]);
    const [, compareChroma, compareHue] = oklchOf(color(theme, 'data.compare'));
    assert.ok(compareHue >= YELLOW_HUE[0] && compareHue <= YELLOW_HUE[1], `${theme} compare hue ${compareHue.toFixed(0)}`);
    assert.ok(compareChroma >= NEUTRAL_CHROMA, `${theme} compare is a hue`);
    assert.notEqual(color(theme, 'data.compare'), color(theme, 'data.category.4'), 'yellow is not the green family');
  }
  assert.ok(Math.abs(oklchOf(color('light', 'data.compare'))[2] - blueHue) >= MIN_TAG_HUE_GAP);
  assert.notEqual(color('light', 'data.compare'), orange);
  assert.equal(color('light', 'state.warning'), color('light', 'category.yellow.light-border'), '주의는 노랑 경계다');
  assert.equal(color('dark', 'state.active'), color('dark', 'blue.dark-stroke'));
});

// 색각 이상 시뮬레이션(Machado 2009, 심한 정도 1.0). 선형 sRGB에 곱한다.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const distanceOf = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 색각 이상 눈에 비친 OKLab 좌표.
const seenBy = (matrix, hex) => linearToOklab(matrix.map((row) => row.reduce((sum, weight, i) => sum + weight * channelsOf(hex)[i], 0)));


// 근거: 규칙 docs-integration.md "파랑과 주황은 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서도 OKLab 거리 0.1 이상"
test('palette_blue_and_orange_stay_apart_for_protanopia_and_deuteranopia_in_both_themes', () => {
  for (const theme of THEMES) {
    const [blue, orange] = [`blue.${theme}-stroke`, `orange.${theme}-stroke`];
    for (const [name, matrix] of Object.entries(CVD)) {
      const distance = distanceOf(seenBy(matrix, color(theme, blue)), seenBy(matrix, color(theme, orange)));

      assert.ok(distance >= CVD_MIN_DISTANCE, `${theme} ${name}: ${distance.toFixed(3)}`);
    }
  }
});

// 근거: 규칙 docs-integration.md 갈래색: 흐름 점과 태그의 색 이름(일곱 계열과 gray)은 서로 OKLab 거리 0.1 이상 떨어진다. 적록 색각 이상 눈에서는 파랑과 보라, 빨강과 초록처럼 가까워지는 쌍이 있으므로 그때는
// 팔레트 이웃 기준(distance.neighbor-cvd)만 요구한다(첫 판 안에도 있는 약한 쌍은 직접 라벨과 모양, 글 상자의 글자가 구분을 맡는다). 시험은 도우미가 실제로 돌려주는 면색을 잰다.
test('tone_colors_stay_apart_from_each_other_for_normal_protan_and_deutan_sight', () => {
  for (const theme of THEMES) {
    const faces = TONES.map((tone) => [tone, color(theme, roleOf(toneColors(tone).fill))]);
    assert.equal(new Set(faces.map(([, hex]) => hex)).size, TONES.length, `${theme}: 색 이름마다 다른 색이다`);
    for (const kind of Object.keys(VISION)) {
      for (const [i, [a, hexA]] of faces.entries()) {
        for (const [b, hexB] of faces.slice(i + 1)) {
          const distance = distanceOf(seenBy(VISION[kind], hexA), seenBy(VISION[kind], hexB));
          const floor = kind === 'normal' ? CVD_MIN_DISTANCE : values.distance['neighbor-cvd'];

          assert.ok(distance >= floor, `${theme} ${kind} ${a} vs ${b}: ${distance.toFixed(3)}`);
        }
      }
    }
  }
});

// 근거: 규칙 docs-integration.md "카드 태그 색상이 state.active와 40도 이상 떨어진다". 첫 계열(blue)은 강조 파랑과 같은 색이 자리의 뜻이라 빼고, 나머지 색 이름은 40도 이상 떨어지며 gray는 무채색이다.
test('tone_colors_keep_their_hue_away_from_the_active_blue_except_the_blue_family_itself', () => {
  for (const theme of THEMES) {
    const [, , activeHue] = oklchOf(color(theme, 'state.active'));
    assert.equal(color(theme, roleOf(toneColors('blue').fill)), color(theme, 'category.blue.anchor'), 'blue is the active blue by design');
    for (const tone of TONES.filter((name) => name !== 'blue')) {
      const [, chroma, hue] = oklchOf(color(theme, roleOf(toneColors(tone).fill)));
      const gap = Math.min(Math.abs(hue - activeHue), 360 - Math.abs(hue - activeHue));

      assert.ok(chroma < NEUTRAL_CHROMA || gap >= MIN_TAG_HUE_GAP, `${theme} ${tone} vs state.active: ${gap.toFixed(0)} degrees`);
    }
    assert.ok(oklchOf(color(theme, roleOf(toneColors('gray').fill)))[1] < NEUTRAL_CHROMA, 'gray is a neutral, not a hue that can read as blue');
  }
});

// 근거: 규칙 docs-integration.md 색의 두 층 "코드와 CSS는 역할 토큰만 쓰고 원색을 직접 쓰지 않는다". 막아야 할 것은 원색 층 접근이고, 범주 색 도우미(chart-palette.js)를 가져다 쓰는 것은 허용이다
test('tokens_color_literals_live_only_in_the_palette_layer_and_code_never_reads_the_primitive_layer', () => {
  const colors = listTokens(JSON.parse(readFileSync(new URL('tokens.json', SRC), 'utf8')).color);
  const dark = listTokens(JSON.parse(readFileSync(new URL('tokens.dark.json', SRC), 'utf8')).color);
  const literals = colors.filter(([, value]) => HEX_VALUE.test(value)).map(([name]) => name);
  const files = codeFiles();
  const importsHelper = files.filter(({ name, text }) => name !== 'chart-palette.js' && /from '\.{1,2}\/(?:chart\/)?chart-palette\.js'/.test(text));

  assert.deepEqual(files.filter(({ text }) => PRIMITIVE_ACCESS.test(withoutComments(text))).map(({ name }) => name), []);
  assert.ok(importsHelper.length >= 3, '범주 색은 공통 도우미를 거쳐 읽는다');
  assert.ok(files.some(({ name, text }) => name === 'chart-palette.js' && /export function categoryPaint/.test(text)));
  // 검사 자체가 걸러 내는지: 원색 접근 꼴은 걸리고 도우미 가져오기와 낱말은 걸리지 않는다.
  for (const bad of ['tokens.color.palette.blue.500', "const x = 'var(--color-palette-sky-light-fill)'", "values.color['palette']", '{color.palette.sky.light-fill}']) assert.match(bad, PRIMITIVE_ACCESS, bad);
  for (const ok of ["import { categoryPaint } from './chart-palette.js';", 'const palette = readPalette();', '// color.palette.blue.850 is a primitive', '/* color.palette.red.300 */ const a = 1;']) assert.doesNotMatch(withoutComments(ok), PRIMITIVE_ACCESS, ok);
  assert.ok(literals.length > 0);
  assert.deepEqual(literals.filter((name) => !name.startsWith('palette.')), []);
  assert.deepEqual(dark.filter(([, value]) => HEX_VALUE.test(value)), []);
});

// 근거: 설계 layout.md 글자 크기 "토큰 size.text의 다섯 단계(9, 11, 13, 15, 22)뿐이고 이웃 단계 비율이 1.15 이상이다"
test('textScale_has_five_steps_each_at_least_15_percent_above_the_last', () => {
  const sizes = Object.values(values.size.text);

  assert.deepEqual(sizes, [9, 11, 13, 15, 22]);
  assert.ok(sizes.every((a, i) => i === 0 || a / sizes[i - 1] >= MIN_STEP_RATIO));
});

// 근거: 규칙 대비 "히트맵 칸 색과 글자색은 빌드 때 같은 강도 한 값에서 고른다". 문서 대비 표의 칸 숫자 대비를 SVG가 지킨다
test('buildFigure_heatmap_cells_draw_fill_and_ink_from_the_strength_written_in_the_style', async () => {
  // 칸 색(--s와 fill 속성)과 글자색(on class)이 같은 강도에서 나온다. 0~100을 1씩 훑는다.
  const rows = Array.from({ length: 101 }, (_, v) => `cell "r${v}" "c" ${v}`);
  const chart = chartOf(await buildFigure(`daphnis 2\n${chartSource('heatmap', rows)}`));
  const cells = [...chart.body.matchAll(/class="chart-heat" style="--s:([\d.]+)" fill="(#[0-9a-f]{6})"[^]*?class="cr-\d+ ink chart-cell( on)?"/g)];
  const heat = { low: color('light', 'data.heat-low'), high: color('light', 'data.heat-high'), ink: color('light', 'data.heat-ink'), inkOn: color('light', 'data.heat-ink-on') };

  assert.equal(cells.length, 101);
  for (const [, strength, fill, on] of cells) {
    const look = heatLook(Number(strength), heat);

    assert.equal(fill, look.fill, `strength ${strength}`);
    assert.equal(Boolean(on), look.isOn, `strength ${strength}`);
    assert.equal(look.strength, Number(strength));
  }
});

const HEAT_FIGURE = [
  'daphnis 2',
  'chart c "차트" heatmap {',
  '  cell "a" "x" 10',
  '  cell "a" "y" 8',
  '  cell "a" "z" 6',
  '  cell "b" "x" 4',
  '  cell "b" "y" 2',
  '  cell "b" "z" 0.5',
  '}',
  'scene "one" mode=once',
  '  light c "a" "x"',
  'scene "two" mode=once',
  '  light c "b" "y"',
  'scene "three" mode=once',
  '  light c "a" "z"',
  '',
].join('\n');

// cost: time O(k), heap O(k), stack O(1)
// vars: k = keyframes 본문 글자 수
// basis: estimate
// keyframes 이름 하나의 [{ at(0~100), props: Map }] 목록. 같은 줄에 퍼센트 여럿이면 같은 값을 모두에 건다.
function stopsOf(css, name) {
  const body = new RegExp(`@keyframes ${name} \\{((?:[^{}]|\\{[^}]*\\})*)\\}`).exec(css)[1];
  const stops = [...body.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)].flatMap(([, ats, decls]) => {
    const props = new Map(decls.split(';').map((d) => d.split(':').map((s) => s.trim())).filter(([k]) => k));
    return ats.split(',').map((at) => ({ at: parseFloat(at), props }));
  });
  return stops.sort((a, b) => a.at - b.at);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 정지점 수
// basis: estimate
// 이름 있는 애니메이션 하나가 시각 at(0~100)에 내는 속성 값. 값이 서로 다른 정지점 사이는 선형으로 보간한다(animation linear).
function sample(stops, at, resolve) {
  const before = stops.findLastIndex((s) => s.at <= at);
  if (before < 0) return new Map();
  const [from, to] = [stops[before], stops[before + 1]];
  const out = new Map();
  for (const [prop, value] of from.props) {
    const next = to?.props.get(prop);
    if (prop === 'animation-timing-function' || next === undefined || next === value) {
      out.set(prop, value);
      continue;
    }
    const p = (at - from.at) / (to.at - from.at);
    out.set(prop, prop === 'opacity' ? String(Number(value) + (Number(next) - Number(value)) * p) : mixHex(resolve(value), resolve(next), p));
  }
  return out;
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 규칙 수
// basis: estimate
// `.fl .fl-motion [data-chart="c"] .cr-K.ink { animation: aN 3.2s 1 forwards linear; }`에서 애니메이션 이름들과 한 바퀴 길이(ms). 선택자는 차트 카드 id로 한정된다.
function animationsOf(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const decl = new RegExp(`${escaped} \\{ animation: ([^;]*);`).exec(css)[1];
  return { names: [...decl.matchAll(/(a\d+) [\d.]+s/g)].map((m) => m[1]), total: parseFloat(/[\d.]+(?=s )/.exec(decl)[0]) * MS_PER_SECOND };
}


// 근거: 규칙 docs-integration.md 대비 기준 표 "히트맵 칸 숫자와 그 칸 색 4.5 이상". 히트맵은 강조(light)가 바뀌어도 칸 면과 글자 색, 불투명도를 바꾸지 않으므로(값과 색 강도의 대응 보존)
// 모든 단계에서 대비가 고정이다. 움직이는 SVG의 칸 면에는 움직임이 없고, 글자에는 굵기만 건다.
test('toSvg_heat_cells_keep_contrast_4_5_in_every_step_because_only_the_text_weight_changes', async () => {
  const svg = await toSvg(await buildFigure(HEAT_FIGURE));
  const css = /<style>([^]*?)<\/style>/.exec(svg)[1];
  const cells = [...svg.matchAll(/class="chart-heat" style="--s:([\d.]+)"[^]*?class="cr-(\d+) ink chart-cell( on)?"/g)];
  // 차트는 넓은 배치와 좁은 배치를 모두 담으므로 같은 칸이 배치마다 한 번씩 나온다
  assert.ok(cells.length > 0 && cells.length % HEAT_CELLS === 0, `칸 ${cells.length}개`);

  for (const theme of ['light', 'dark']) {
    const color = (name) => themeColor(theme, name);
    for (const [, strength, k, on] of cells) {
      // 칸 색은 OKLab 보간이다(CSS color-mix와 같은 계산).
      const fill = mixOklab(color('data.heat-low'), color('data.heat-high'), Number(strength));
      const ratio = contrast(on ? color('data.heat-ink-on') : color('data.heat-ink'), fill);
      assert.ok(ratio >= TEXT, `${theme} cell ${k} strength ${strength}: ${ratio.toFixed(2)}`);
    }
  }
  for (const [, , k] of cells) {
    assert.ok(!new RegExp(`\\.cr-${k} \\{ animation`).test(css), `cell ${k} face is never animated`);
    const text = animationsOf(css, `.fl .fl-motion [data-chart="c"] .cr-${k}.ink`);
    const props = text.names.flatMap((name) => stopsOf(css, name).flatMap((stop) => [...stop.props.keys()])).filter((prop) => prop !== 'animation-timing-function');
    assert.deepEqual([...new Set(props)], ['font-weight'], `cell ${k} text only changes weight`);
  }
});


// 근거: 사용자 결정 "NHN 아키텍처 자료처럼 간다": NHN 컬러 아이콘은 브랜드 파랑이라 figure.icon은 지금(state.active)과 같은 파랑 계열이다(색상각 차이 1도 이내). 지금은 굵은 테두리와 후광으로 알린다. 이전 규칙은 아이콘 색상각이 지금과 8도 이상 달라야 했다
test('palette_figure_icon_is_the_brand_blue_of_the_active_blue_in_both_themes', () => {
  const ICON_HUE_TOLERANCE = 1;

  for (const theme of THEMES) {
    const [, , iconHue] = oklchOf(color(theme, 'figure.icon'));
    const [, , activeHue] = oklchOf(color(theme, 'state.active'));

    assert.ok(Math.abs(iconHue - activeHue) <= ICON_HUE_TOLERANCE, `${theme} icon ${iconHue.toFixed(1)} / active ${activeHue.toFixed(1)}`);
  }
});
