// 팔레트와 도형 색 선택(fill, stroke, card). 근거: docs/design/docs-integration.md 색 역할과 대비 기준, docs/design/figure-syntax.md 도형 색.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tintOf } from '../src/draw/paint.js';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex } from '../src/contrast.js';
import { readCommonTokens } from '../scripts/lib/design-tokens.mjs';
import { generatePalette } from '../scripts/lib/palette.mjs';
import { VISION, closestDistance, distanceOf, seenBy } from '../scripts/lib/color-vision.mjs';
import { readJson } from '../scripts/lib/read-json.mjs';
import { valueNames } from '../src/source/grammar.js';
import { toSvg } from '../src/svg.js';
import { toHtml } from '../src/html.js';
import { errorsOf, themeColor, tokenValue } from './helpers.js';
import { isLabelRequired } from './label-required.js';

const TEXT = 4.5;
const GRAPHIC = 3;
const THEMES = ['light', 'dark'];
const NAMES = valueNames('paint');
const SURFACES = ['bg', 'node', 'group-1', 'group-2', 'group-3', 'card', 'card-on', 'page', 'surface'];
const paint = (theme, name, stage) => themeColor(theme, `paint.${name}.${stage}`);
const faces = (theme) => SURFACES.map((s) => themeColor(theme, s));
const fills = (theme) => NAMES.map((n) => paint(theme, n, 'fill'));

// 근거: 대비 기준 표 "글자 4.5, 그래픽 3, 예외 없음". 모든 색, 테마, 단계
test('paint_every_color_stage_reaches_its_contrast_floor_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of NAMES) {
      const [fill, stroke, ink] = ['fill', 'stroke', 'ink'].map((s) => paint(theme, name, s));
      // 노랑 경계는 색상을 지키려고 밝기 하한(갈색 방지)에서 멈춘다. 라이트에서 대비 3에 못 미치는 만큼 직접 라벨이 뜻을 전한다. 글자 4.5는 예외가 없다.
      const isLabeled = isLabelRequired(theme, name);
      for (const text of ['fg', 'muted']) assert.ok(contrast(themeColor(theme, text), fill) >= TEXT, `${theme} ${text} on ${name} fill`);
      if (!isLabeled) assert.ok(contrast(paint(theme, name, 'outline'), fill) >= GRAPHIC, `${theme} outline on ${name} fill`);
      for (const face of ['bg', 'node']) if (!isLabeled) assert.ok(contrast(paint(theme, name, 'outline'), themeColor(theme, face)) >= GRAPHIC, `${theme} ${name} outline on ${face}`);
      for (const face of [...faces(theme), ...fills(theme)]) {
        if (!isLabeled) assert.ok(contrast(stroke, face) >= GRAPHIC, `${theme} ${name} stroke on ${face}`);
        assert.ok(contrast(ink, face) >= TEXT, `${theme} ${name} ink on ${face}`);
      }
      const band = mixHex(fill, stroke, tokenValue('opacity.tag'));
      assert.ok(contrast(themeColor(theme, 'fg'), band) >= TEXT, `${theme} tag band on ${name} fill`);
      assert.ok(distanceOf(seenBy(VISION.normal, fill), seenBy(VISION.normal, themeColor(theme, 'node'))) >= tokenValue('distance.fill'), `${theme} ${name} fill reads as painted`);
    }
    // 주의는 노랑 경계라 라이트에서 3에 못 미친다. 상태는 늘 아이콘과 글자가 함께 간다.
    for (const role of ['error', 'success', 'warning']) for (const face of faces(theme)) if (!(role === 'warning' && theme === 'light')) assert.ok(contrast(themeColor(theme, `state.${role}`), face) >= GRAPHIC, `${theme} state.${role} on ${face}`);
    assert.equal(themeColor(theme, 'state.warning'), themeColor(theme, `category.yellow.${theme}-border`));
  }
});

// 근거: 다크 면은 어두워 판 바탕과 도형 바탕에 묻히기 쉽다. 다크 fill은 그림 바탕, 도형 바탕과 distance.fill-dark 이상 떨어진다
test('paint_dark_fills_stay_visible_against_the_figure_ground_and_the_node_face', () => {
  const look = (name) => seenBy(VISION.normal, themeColor('dark', name));
  for (const name of NAMES) {
    const fill = seenBy(VISION.normal, paint('dark', name, 'fill'));
    assert.ok(distanceOf(fill, look('bg')) >= tokenValue('distance.fill-dark.bg'), `${name} fill vs bg`);
    assert.ok(distanceOf(fill, look('node')) >= tokenValue('distance.fill-dark.node'), `${name} fill vs node`);
  }
});

// 근거: 색 역할 "이웃한 색은 갈린다". 보통 시각과 적록 색각 이상 시뮬레이션의 OKLab 거리, 색상 순서 이웃 쌍
test('paint_hue_neighbors_stay_apart_for_normal_protan_and_deutan_sight', () => {
  // 정본 이름 여덟 중 무채색 gray를 뺀 일곱이 색상 순서로 이어진 고리다
  const order = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
  for (const theme of THEMES) {
    for (const [a, b] of order.map((n, i) => [n, order[(i + 1) % order.length]])) {
      const [x, y] = [a, b].map((n) => paint(theme, n, 'stroke'));
      assert.ok(closestDistance(x, y, ['normal']) >= tokenValue('distance.neighbor'), `${theme} ${a}/${b} normal`);
      assert.ok(closestDistance(x, y, ['protanopia', 'deuteranopia']) >= tokenValue('distance.neighbor-cvd'), `${theme} ${a}/${b} cvd`);
    }
    // 지금(파랑)과 비교(주황)로 읽히지 않는다. blue는 지금 파랑이고 yellow는 비교 노랑과 같은 색이라 자기 계열과는 같아도 된다
    for (const name of order) for (const role of ['state.active', 'data.compare'].filter((r) => !(name === 'blue' && r === 'state.active') && !(name === 'yellow' && r === 'data.compare'))) assert.ok(closestDistance(paint(theme, name, 'stroke'), themeColor(theme, role), ['normal']) >= tokenValue('distance.neighbor'), `${theme} ${name} vs ${role}`);
  }
});

// 근거: 카드 바탕 기본값은 도형 바탕과 OKLab 거리가 distance.card 범위 안(두 테마)
test('card_default_face_sits_within_the_oklab_range_from_the_node_face', () => {
  for (const theme of THEMES) {
    const distance = distanceOf(seenBy(VISION.normal, themeColor(theme, 'card')), seenBy(VISION.normal, themeColor(theme, 'node')));
    assert.ok(distance >= tokenValue('distance.card.min') && distance <= tokenValue('distance.card.max'), `${theme} ${distance.toFixed(4)}`);
  }
});

// 근거: 값의 출처 재현. daphnis가 값을 갖는 팔레트 단계(sky, slate의 면과 외곽선)는 scripts/build-palette.mjs가 같은 정본에서 다시 만든 값과 같다
test('palette_values_in_tokens_equal_the_regenerated_ones', () => {
  const light = readJson(new URL('../src/tokens.json', import.meta.url).pathname);
  const dark = readJson(new URL('../src/tokens.dark.json', import.meta.url).pathname);
  const layer = light.get('color').get('palette');
  const palette = generatePalette(readCommonTokens(), { light, dark });
  assert.deepEqual(Object.keys(palette.sky).length + Object.keys(palette.slate).length, 7);
  for (const [name, steps] of Object.entries(palette)) for (const [step, hex] of Object.entries(steps)) assert.equal(layer.get(name).get(step).get('$value'), hex, `${name}.${step}`);
});

const NAME_LIST = /one of blue, yellow, red, green, orange, purple, cyan, gray/;
// 옛 색 이름. 색 별칭은 받지 않고 정본 이름으로 옮겨야 한다.
const RETIRED_ALIASES = ['amber', 'teal', 'navy', 'pink', 'sky', 'mauve'];

// 근거: 값은 정본 색 이름 여덟뿐이고 hex, 따옴표 글, 옛 별칭, 없는 이름은 오류(docs/design/figure-syntax.md 도형 색). 파랑과 주황도 이제 고를 수 있다
test('parseFigure_accepts_the_eight_canonical_names_and_rejects_hex_quoted_text_and_the_retired_aliases', () => {
  for (const name of NAMES) assert.deepEqual(errorsOf(`daphnis 2\nbox a "A" fill=${name} stroke=${name}\n`), [], name);
  for (const value of ['"red"', ...RETIRED_ALIASES]) assert.match(errorsOf(`daphnis 2\nbox a "A" fill=${value}\n`)[0], NAME_LIST, value);
  for (const key of ['fill', 'stroke']) assert.match(errorsOf(`daphnis 2\nbox a "A" ${key}=#ff0000\n`)[0], /not hex/, key);
  // 설명 판 색도 같은 이름 목록을 쓴다
  assert.deepEqual(errorsOf('daphnis 2\nbox a "A" fill=red stroke=gray\nscene "s" mode=once\n  light a\n  show a "x" card=cyan\n'), []);
  assert.match(errorsOf('daphnis 2\nbox a "A"\nscene "s" mode=once\n  light a\n  show a "x" card=teal\n')[0], NAME_LIST);
});

const SOURCE = 'daphnis 2\nbox a "A" "sub" fill=red stroke=yellow\nbox b "B"\ngroup g "G" stroke=green fill=cyan {\n  box c "C" stroke=purple\n}\na -> b\nb -> c\nscene "s" mode=once\n  light a\n  show a "x" card=purple\n';

// 근거: #164의 단일 윤곽 규칙. 색을 고른 도형은 색 역할을 유지하고 재생 강조가 두 번째 외곽선을 만들지 않는다.
test('toSvg_lit_shape_keeps_its_stroke_color_without_duplicate_outlines', async () => {
  const svg = await toSvg(await buildFigure(SOURCE));
  assert.ok(!/stroke: var\(--color-paint-yellow-stroke\); stroke-width/.test(svg), 'lit state does not restyle a painted shape');
  assert.ok(!svg.includes('fl-halo'), 'no duplicate silhouette');
  assert.ok(svg.includes('fill="var(--color-paint-red-fill)"'), 'red fill');
  assert.ok(svg.includes('fill="var(--color-paint-purple-fill)"'), 'purple card');
  const plain = await toSvg(await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "s" mode=once\n  light a\n'));
  assert.ok(!/fl-halo|class="[^"]*\bps-|ph-/.test(plain), 'unpainted shapes have one outline');
});

// 근거: HTML도 SVG와 같이 색 역할을 유지하고 중복 윤곽이 없다.
test('toHtml_painted_stroke_rules_keep_the_role_without_duplicate_outlines', async () => {
  const html = await toHtml(await buildFigure(SOURCE), 'x');
  assert.ok(html.includes('.fl .fl-node .fl-stroke.ps-yellow'));
  assert.ok(!html.includes('fl-halo'));
  assert.ok(!html.includes('.fl-node.on .fl-stroke.ps-') && !html.includes('.fl-group.on .fl-stroke.ps-'), 'state never overrides a chosen color');
  assert.ok(html.includes('.fl .fl-group .frame-box.ps-green'));
});

// 근거: 사용자 결정 "강조 그룹 안의 중첩 그룹은 같은 색상각 틴트를 깊이마다 한 단계씩 진하게, 강조 밖은 회색 위계 그대로". 강조 그룹이 틴트 1, 그 안은 2, 3에서 멈추고 밖의 그룹은 틴트가 없다
test('tintOf_gives_the_emphasized_group_tint_1_its_nested_groups_steps_up_to_3_and_none_outside', async () => {
  const source = 'daphnis 2\ngroup a "A" fill=blue {\n  group b "B" {\n    group c "C" {\n      group d "D" {\n        box x "X"\n      }\n    }\n  }\n}\ngroup e "E" {\n  box y "Y"\n}\n';
  const { scene } = await buildFigure(source);

  assert.deepEqual(Object.fromEntries(scene.groups.map((g) => [g.id, tintOf(g, scene)?.level])), { a: 1, b: 2, c: 3, d: 3, e: undefined });
});
