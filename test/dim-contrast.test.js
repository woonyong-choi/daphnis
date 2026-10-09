// 흐린 행의 대비: 흐려진 글자는 바탕과 대비 4.5 이상이고, 막대의 테두리는 같은 계열의 테두리 값이라 따로 덧그리는 테두리(rim)가 없다(docs/design/charts.md 흐림, docs-integration.md 대비 기준 표).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex } from '../src/contrast.js';
import { PALETTE } from '../src/chart-palette.js';
import { toSvg } from '../src/svg.js';
import { chartOf, chartSource, themeColor, tokenValue } from './helpers.js';

const TEXT = 4.5;
const THEMES = ['light', 'dark'];
const BAR = ['x "값(ms)"', 'series a "A" role=main', 'series b "B" role=compare', 'row "r" a=5 b=3', 'row "s" a=4 b=2'];
const HEATMAP = ['cell "a" "x" 1', 'cell "a" "y" 2', 'cell "b" "x" 3', 'cell "b" "y" 4'];

// cost: time O(page), heap O(out), stack O(1)
// vars: page = 차트 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 장면에서 첫 행만 밝혀 나머지 행이 흐려지는 차트의 움직이는 SVG와 그림 조각.
async function dimmed(type, lines, light) {
  const result = await buildFigure(`daphnis 2\n${chartSource(type, lines)}scene "밝히기" mode=once\n  light c ${light}\n`, { strict: true });
  return { svg: await toSvg(result), body: chartOf(result).body };
}

// `fill="var(--color-data-category-2)"`에서 범주 번호 2를
const categoryOf = (cssColor) => Number(/var\(--color-data-category-(?:outline-)?(\d+)\)/.exec(cssColor)?.[1]);

// 근거: 글자는 면보다 덜 흐려(opacity.dim-ink) 흐린 행에서도 바탕과 대비 4.5 이상이다. 행의 글자(본문색과 보조색)가 두 모드에서 지킨다
test('contrast_dimmed_chart_text_keeps_4_5_in_both_themes', async () => {
  for (const theme of THEMES) {
    const bg = themeColor(theme, 'bg');
    for (const role of ['fg', 'muted']) {
      const ratio = contrast(mixHex(bg, themeColor(theme, role), Number(tokenValue('opacity.dim-ink'))), bg);

      assert.ok(ratio >= TEXT, `${theme} ${role} 흐린 글자 ${ratio.toFixed(2)}`);
    }
  }
  const { svg, body } = await dimmed('bar', BAR, '"r"');

  assert.match(body, /<g class="cr-\d+ ink">/, '행 글자는 ink 묶음이라 면과 따로 흐려진다');
  assert.match(svg, /\.fl \.ink\.dim \{\s*opacity: var\(--opacity-dim-ink\);/);
});

// 근거: 이슈 #63 이후 설계 변경: 막대, 조각, 점의 테두리는 처음부터 같은 계열의 테두리 값(color.data.category-outline)이고 흐림은 면과 테두리가 함께 받는다. 중립 rim이 없다
test('dimmed_bars_have_no_rim_and_the_same_family_border_dims_together_with_the_face', async () => {
  const { svg, body } = await dimmed('bar', BAR, '"r"');
  const faces = body.match(/<rect [^>]*class="grow"[^>]*>/g);

  assert.equal(faces.length, 4);
  assert.doesNotMatch(svg, /\brim\b|rimRect/);
  for (const face of faces) {
    const fill = categoryOf(/ fill="([^"]+)"/.exec(face)?.[1]);
    const stroke = categoryOf(/ stroke="([^"]+)"/.exec(face)?.[1]);

    assert.ok(fill >= 1, face);
    assert.equal(stroke, fill, `면과 같은 계열의 테두리: ${face}`);
  }
  // 면과 테두리는 한 요소라 같은 묶음(cr-행)의 불투명도로 함께 흐려진다.
  assert.match(svg, /\.fl \.dim \{\s*opacity: var\(--opacity-dim\);/);
  assert.equal(Number(tokenValue('opacity.dim')), 0.3);
});

// 근거: 같은 계열의 테두리가 바탕에서 읽힌다(그래픽 3). 노랑은 라이트에서 3에 못 미쳐 직접 라벨이 뜻을 전한다(범주 팔레트 needsLabel)
test('contrast_same_family_borders_reach_3_on_the_background_except_the_labelled_yellow_in_light', () => {
  for (const theme of THEMES) {
    const bg = themeColor(theme, 'bg');
    PALETTE.forEach(({ family, needsLabel }, index) => {
      const ratio = contrast(themeColor(theme, `data.category-outline.${index + 1}`), bg);

      if (theme === 'light' && needsLabel) assert.ok(ratio < 3, `${family} 라이트 테두리는 직접 라벨이 필요한 값이다: ${ratio.toFixed(2)}`);
      else assert.ok(ratio >= 3, `${theme} ${family} 테두리 ${ratio.toFixed(2)}`);
    });
  }
});

// 근거: 사용자 지적 "히트맵의 흐림 보완 테두리가 선택 테두리처럼 보인다". 히트맵은 어느 장면에서도 칸을 흐리거나 테두리를 덧그리지 않는다.
test('heatmap_cells_are_never_dimmed_and_never_get_a_rim', async () => {
  const { svg } = await dimmed('heatmap', HEATMAP, '"a" "x"');

  assert.equal([...svg.matchAll(/class="cr-\d+ rim"/g)].length, 0);
  assert.doesNotMatch(svg, /\.fl \.cr-\d+\.rim \{ animation/);
  assert.doesNotMatch(svg, /\.fl \.cr-\d+ \{ animation/, '칸 면의 불투명도를 바꾸는 움직임이 없다');
});
