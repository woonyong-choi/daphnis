// 글자와 그래픽 쌍의 대비 기준. 토큰 정본(tokens.json, tokens.dark.json)에서 라이트와 다크 색을 풀어 잰다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex, pickInk } from '../src/contrast.js';

const TEXT = 4.5;
const BORDER = 2;
const SUBTLE = 1.5;
const GRAPHIC = 3;
const PLATE = 1.3;
const THEMES = ['light', 'dark'];

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본 파일의 `color.*` 토큰을 점 이름 경로 → 값 표로 편다.
function flatten(node, path, out) {
  if (node && typeof node === 'object' && '$value' in node) out.set(path.join('.'), node.$value);
  else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) if (!key.startsWith('$')) flatten(child, [...path, key], out);
  return out;
}

const read = (name) => JSON.parse(readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'));
const LIGHT = flatten(read('tokens.json'), [], new Map());
const DARK = new Map([...LIGHT, ...flatten(read('tokens.dark.json'), [], new Map())]);

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 참조 사슬 길이
// basis: estimate
// 의미 토큰 이름의 라이트 또는 다크 `#rrggbb`. 참조 `{...}`를 끝까지 따라간다.
function color(theme, name) {
  const table = theme === 'dark' ? DARK : LIGHT;
  let value = table.get(`color.${name}`);
  while (typeof value === 'string' && value.startsWith('{')) value = table.get(value.slice(1, -1));
  assert.match(value ?? '', /^#[0-9a-f]{6}$/, `color.${name} (${theme})`);
  return value;
}

const opacity = (name) => LIGHT.get(`opacity.${name}`);

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 쌍 수
// basis: estimate
function expectAtLeast(theme, minimum, pairs) {
  for (const [a, b] of pairs) {
    const ratio = contrast(color(theme, a), color(theme, b));
    assert.ok(ratio >= minimum, `${theme} ${a} on ${b}: ${ratio.toFixed(2)} < ${minimum}`);
  }
}

for (const theme of THEMES) {
  test(`contrast_${theme}_body_and_muted_text_reach_4_5_on_every_face`, () => {
    const faces = ['bg', 'node', 'surface', 'card-on', 'group', 'page', 'gallery'];
    expectAtLeast(theme, TEXT, faces.flatMap((face) => [['fg', face], ['muted', face]]));
  });

  test(`contrast_${theme}_accent_text_and_links_reach_4_5_on_their_faces`, () => {
    // 링크(열기, SVG, 목록으로), 카드 표시 ✓(내용이 찬 카드 바탕), 열 표시 PK. 빈 카드 바탕(surface)에는 표시가 없다.
    expectAtLeast(theme, TEXT, [['accent', 'bg'], ['accent', 'node'], ['accent', 'card-on'], ['accent', 'page'], ['accent', 'gallery']]);
  });

  test(`contrast_${theme}_text_on_accent_fill_reaches_4_5`, () => {
    // 켜진 선 라벨 알약, 이동 글 상자, 켜진 테마 단추, 카드 안 켜진 이름 알약
    expectAtLeast(theme, TEXT, [['on-accent', 'accent-fill']]);
  });

  test(`contrast_${theme}_card_tag_text_reaches_4_5_on_every_tone_band`, () => {
    for (const face of ['node', 'surface', 'card-on']) {
      for (const tone of ['blue', 'purple', 'green', 'orange', 'gray']) {
        const band = mixHex(color(theme, face), color(theme, `tag.${tone}`), opacity('tag'));
        const ratio = contrast(color(theme, 'fg'), band);
        assert.ok(ratio >= TEXT, `${theme} tag ${tone} on ${face}: ${ratio.toFixed(2)}`);
      }
    }
  });

  test(`contrast_${theme}_borders_reach_2_on_every_face_they_separate`, () => {
    const faces = ['bg', 'node', 'group'];
    expectAtLeast(theme, BORDER, faces.flatMap((face) => [['border', face], ['group-border', face]]));
  });

  test(`contrast_${theme}_node_face_is_brighter_than_the_figure_ground`, () => {
    assert.ok(contrast(color(theme, 'node'), color(theme, 'bg')) > 1.05);
  });

  test(`contrast_${theme}_subsidiary_graphics_reach_1_5_on_the_figure_ground`, () => {
    expectAtLeast(theme, SUBTLE, [['grid', 'bg'], ['heat-low', 'bg']]);
    for (const series of ['series-1', 'series-2']) {
      const band = mixHex(color(theme, 'bg'), color(theme, series), opacity('range'));
      const ratio = contrast(band, color(theme, 'bg'));
      assert.ok(ratio >= SUBTLE, `${theme} range band ${series}: ${ratio.toFixed(2)}`);
    }
  });

  test(`contrast_${theme}_series_marks_reach_3_on_the_figure_ground`, () => {
    expectAtLeast(theme, GRAPHIC, [['series-1', 'bg'], ['series-2', 'bg']]);
  });

  test(`contrast_${theme}_heat_text_reaches_4_5_on_every_cell_strength`, () => {
    const [low, high] = [color(theme, 'heat-low'), color(theme, 'heat-high')];
    const [dark, light] = [color(theme, 'heat-ink'), color(theme, 'heat-ink-on')];
    for (let step = 0; step <= 1000; step += 1) {
      const cell = mixHex(low, high, step / 1000);
      const ratio = contrast(pickInk(cell, dark, light), cell);
      assert.ok(ratio >= TEXT, `${theme} heat strength ${step / 1000} (${cell}): ${ratio.toFixed(2)}`);
    }
  });

  test(`contrast_${theme}_figure_plate_edge_reaches_1_3_on_the_document_ground`, () => {
    expectAtLeast(theme, PLATE, [['plate-border', 'page']]);
  });
}

test('contrast_dark_heat_inks_are_one_color_so_the_build_time_light_pick_is_right_in_dark', () => {
  assert.equal(color('dark', 'heat-ink'), color('dark', 'heat-ink-on'));
});

test('buildFigure_heatmap_cells_pick_the_ink_with_the_larger_contrast', async () => {
  const source = 'chart heatmap\ncell "a" "x" 1\ncell "a" "y" 50\ncell "b" "x" 100\ncell "b" "y" 0\n';
  const { chart } = await buildFigure(source);
  const [low, high] = [color('light', 'heat-low'), color('light', 'heat-high')];
  const picked = [...chart.body.matchAll(/class="chart-heat" style="--s:([\d.]+)"[^]*?class="chart-cell( on)?"/g)];

  assert.equal(picked.length, 4);
  for (const [, strength, on] of picked) {
    const cell = mixHex(low, high, Number(strength));
    const expected = pickInk(cell, color('light', 'heat-ink'), color('light', 'heat-ink-on')) === color('light', 'heat-ink-on');
    assert.equal(Boolean(on), expected, `strength ${strength}`);
  }
});
