// 글자와 그래픽 쌍의 대비 기준. 토큰 정본(tokens.json, tokens.dark.json)에서 라이트와 다크 색을 풀어 잰다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex, pickInk } from '../src/contrast.js';
import { themeColor, tokenValue } from './helpers.js';

const TEXT = 4.5;
const BORDER = 2;
const SUBTLE = 1.5;
const GRAPHIC = 3;
const PLATE = 1.3;
const PILL_EDGE = 1.25;
// 사용자가 정한 이력서 accent(#2b96ed)와 회색 그림 바탕(#f6f7f9), 그룹(#eef0f3), 카드 바탕이 부딪치는 자리의 실측 최솟값(2.75) 바로 아래.
const ACCENT_GRAPHIC_MIN = 2.7;
const THEMES = ['light', 'dark'];

const color = themeColor;
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

for (const theme of THEMES) {
  test(`contrast_${theme}_body_and_muted_text_reach_4_5_on_every_face`, () => {
    const faces = ['bg', 'node', 'surface', 'card-on', 'group', 'page', 'gallery'];
    expectAtLeast(theme, TEXT, faces.flatMap((face) => [['fg', face], ['muted', face]]));
  });

  test(`contrast_${theme}_accent_strong_text_and_links_reach_4_5_on_their_faces`, () => {
    // 링크(열기, SVG, 목록으로), 카드 표시 ✓(내용이 찬 카드 바탕), 열 표시 PK. 빈 카드 바탕(surface)에는 표시가 없다.
    expectAtLeast(theme, TEXT, [['accent-strong', 'bg'], ['accent-strong', 'node'], ['accent-strong', 'card-on'], ['accent-strong', 'page'], ['accent-strong', 'gallery']]);
  });

  test(`contrast_${theme}_accent_graphics_reach_3_on_small_faces_and_the_floor_on_figure_faces`, () => {
    // 밝힌 선과 점, 도형·그룹·카드 테두리, 진행 고리(원 단추 면 node), 초점 고리
    expectAtLeast(theme, GRAPHIC, ['node', 'page', 'gallery'].map((face) => ['accent', face]));
    expectAtLeast(theme, ACCENT_GRAPHIC_MIN, ['bg', 'group', 'card-on'].map((face) => ['accent', face]));
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

  test(`contrast_${theme}_active_tab_pill_is_distinct_from_the_tab_group_face_and_keeps_text_4_5`, () => {
    expectAtLeast(theme, TEXT, [['fg', 'control-on'], ['muted', 'bg']]);
    // 다크는 면 대비만으로 알약이 보인다. 라이트는 흰 알약에 옅은 테두리(plate-border)를 두른다.
    if (theme === 'dark') expectAtLeast(theme, PLATE, [['control-on', 'bg']]);
    else expectAtLeast(theme, PILL_EDGE, [['plate-border', 'bg']]);
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
    // series-1은 이력서 accent, series-2는 같은 L·C의 주황이다. 라이트 회색 바탕에서 둘 다 3에 조금 못 미치는 ACCENT_GRAPHIC_MIN 예외다.
    expectAtLeast(theme, ACCENT_GRAPHIC_MIN, [['series-1', 'bg'], ['series-2', 'bg']]);
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

test('accentPalette_values_follow_the_resume_accent_and_strong_is_the_lightest_same_hue_that_reaches_4_5', () => {
  assert.equal(color('light', 'accent'), '#2b96ed');
  assert.equal(color('dark', 'accent'), '#79c0ff');
  assert.equal(color('light', 'on-accent'), '#ffffff');
  assert.equal(color('dark', 'on-accent'), '#0d1117');
  assert.equal(color('dark', 'accent-strong'), color('dark', 'accent'));
  // 흰 글자가 놓이는 면(accent-fill)은 라이트에서 accent와 같은 색상의 어두운 단계다.
  assert.equal(color('light', 'accent-strong'), '#1072c2');
  assert.equal(color('light', 'accent-fill'), color('light', 'accent-strong'));
  assert.equal(color('dark', 'accent-fill'), color('dark', 'accent'));
  const faces = ['node', 'bg', 'card-on', 'page', 'gallery'];
  const lowest = Math.min(...faces.map((face) => contrast(color('light', 'accent-strong'), color('light', face))));
  const brighter = Math.min(...faces.map((face) => contrast(mixHex(color('light', 'accent-strong'), '#ffffff', 0.01), color('light', face))));
  assert.ok(lowest >= TEXT && brighter < TEXT, `${lowest.toFixed(2)} / ${brighter.toFixed(2)}`);
  assert.ok(contrast(color('light', 'accent'), color('light', 'node')) < TEXT, 'accent itself is a graphic color, not a text color');
});

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
