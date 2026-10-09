// 근거: 노랑은 둘째 범주 계열의 밝은 색이며 대비를 이유로 갈색 면으로 바꾸지 않는다. 면은 노랑, 경계는 같은 노랑 계열이다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { toHtml } from '../src/html.js';
import { buildFigure } from '../src/build.js';
import { PALETTE } from '../src/chart-palette.js';
import { values } from '../src/tokens.js';
import { contrast } from '../src/contrast.js';
import { launchChrome } from './chrome.js';
import { chartOf, chartSource, themeColor } from './helpers.js';

const TWO = ['series a "A" role=main', 'series b "B" role=compare'];
// 둘째 계열(노랑)을 가진 차트 종류와 그 입력 줄. waterfall은 계열이 없고 줄어드는 막대가 노랑이다.
const KINDS = {
  bar: ['x "v"', ...TWO, 'row "r" a=1 b=2'],
  dumbbell: ['x "v"', ...TWO, 'row "r" a=1 b=2'],
  line: ['x "t"', 'y "v"', ...TWO, 'point x=1 a=1 b=2', 'point x=2 a=2 b=3'],
  area: ['x "t"', 'y "v"', ...TWO, 'point x=1 a=1 b=2', 'point x=2 a=2 b=3'],
  scatter: ['x "가"', 'y "나"', ...TWO, 'point "p" x=1 y=2 series=a', 'point "q" x=3 y=1 series=b'],
  stacked: ['x "v"', ...TWO, 'row "r" a=1 b=2'],
};
const YELLOW = PALETTE.findIndex((entry) => entry.family === 'yellow') + 1;

// cost: time O(n·figure), heap O(figure), stack O(1), io 0
// vars: n = 차트 종류 수, figure = 그림 생성 비용
// basis: estimate
test('comparison_marks_use_yellow_faces_and_yellow_boundaries_across_chart_kinds', async () => {
  assert.equal(YELLOW, 2, 'yellow is the second category');
  assert.equal(values.color.data.compare, values.color.category.yellow.anchor);
  assert.equal(values.color.data['compare-fill'], values.color.data.compare);
  for (const [type, lines] of Object.entries(KINDS)) {
    const { body } = chartOf(await buildFigure(`daphnis 2\n${chartSource(type, lines)}`));
    assert.match(body, new RegExp(`var\\(--color-data-category-${YELLOW}\\)`), `${type} face`);
    assert.match(body, new RegExp(`var\\(--color-data-category-outline-${YELLOW}\\)`), `${type} boundary`);
    assert.doesNotMatch(body, /data-amber|#a27900/i, type);
  }
  const waterfall = chartOf(await buildFigure(`daphnis 2\n${chartSource('waterfall', ['x "ms"', 'row "시작" value=10', 'row "감소" value=-4', 'total "합계"'])}`)).body;
  assert.match(waterfall, /var\(--color-data-compare(?:-fill)?\)/, 'waterfall decrease face');
  assert.match(waterfall, /var\(--color-data-compare-outline\)/, 'waterfall decrease boundary');
  for (const theme of ['light', 'dark']) {
    assert.equal(themeColor(theme, 'data.compare'), themeColor(theme, 'category.yellow.anchor'));
    assert.equal(themeColor(theme, `data.category.${YELLOW}`), themeColor(theme, 'category.yellow.anchor'));
    assert.equal(themeColor(theme, `data.category-outline.${YELLOW}`), themeColor(theme, `category.yellow.${theme}-border`), 'the boundary is the same family');
    assert.notEqual(themeColor(theme, 'data.compare-outline'), themeColor(theme, 'muted'));
    // 노랑 경계는 노란 계열을 지키고, 라이트에서 3에 못 미치는 만큼 직접 라벨이 뜻을 전한다.
    if (theme === 'dark') assert.ok(contrast(themeColor(theme, 'data.compare-outline'), themeColor(theme, 'bg')) >= 3);
    else assert.equal(values.color.data['category-label'][YELLOW], 'required');
  }
});

// 근거: 노란 범례의 경계는 회색이 아닌 같은 노란 계열이며 실제 표시 색이 정본과 같아야 한다.
for (const engine of ['chrome', 'webkit']) {
  test(`comparison_legend_${engine}_uses_the_yellow_boundary_in_both_modes`, async () => {
    const browser = await (engine === 'chrome' ? launchChrome() : webkit.launch());
    const source = `daphnis 2\n${chartSource('scatter', KINDS.scatter)}`;
    const html = await toHtml(await buildFigure(source), '비교 범례');
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
        await page.setContent(html);
        // 점 모양은 범주 번호를 따라 첫째(파랑) 범례 칸은 원, 둘째(노랑)는 사각형이다.
        const legend = await page.evaluate(() => [':scope > circle', ':scope > rect[fill="var(--color-data-category-2)"]'].map((selector) => document.querySelector('.fl-plot').querySelector(selector)).filter(Boolean).map((el) => ({ fill: getComputedStyle(el).fill, stroke: getComputedStyle(el).stroke, width: parseFloat(getComputedStyle(el).strokeWidth) })));
        const rgb = (hex) => `rgb(${hex.slice(1).match(/../g).map((part) => parseInt(part, 16)).join(', ')})`;
        assert.equal(legend.length, 2, `${engine} ${colorScheme} ${width}`);
        assert.equal(legend[1].fill, rgb(themeColor(colorScheme, 'data.compare')), `${engine} ${colorScheme} ${width} yellow face`);
        assert.equal(legend[1].stroke, rgb(themeColor(colorScheme, `category.yellow.${colorScheme}-border`)), `${engine} ${colorScheme} ${width} same-family boundary`);
        assert.ok(legend[1].width > 0, 'the yellow swatch keeps its boundary');
        assert.notEqual(legend[1].stroke, rgb(themeColor(colorScheme, 'muted')), 'never a gray boundary');
        await page.close();
      }
    } finally { await browser.close(); }
  });
}
