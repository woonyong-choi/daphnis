// 캔버스: 모든 그림이 같은 표준 캔버스 폭으로 보이고, 좁은 내용은 가운데에 두며, 넓은 내용은 표시만 줄인다(docs/design/layout.md 그림 크기).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { STYLES } from '../src/styles.js';
import { buildFigure } from '../src/build.js';
import { canvasOf } from '../src/canvas.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { chartOf, chartSource } from './helpers.js';

const CANVAS = values.size['figure-canvas'];
const CANVAS_WIDE = values.size['figure-canvas-wide'];
const EXAMPLES = new URL('../examples/', import.meta.url);

// 루트 svg 태그의 너비, 높이, viewBox
function rootOf(svg) {
  const m = /<svg [^>]*width="([\d.]+)" height="([\d.]+)"[^>]*viewBox="([-\d.]+) 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return { width: Number(m[1]), height: Number(m[2]), x: Number(m[3]), viewWidth: Number(m[4]), viewHeight: Number(m[5]) };
}

const CHARTS = {
  bar: chartSource('bar', ['x "정확도(%)"', 'series a "A"', 'row "항목" a=3', 'row "둘째" a=5']),
  box: chartSource('box', ['x "시간(ms)"', 'row "a" min=1 q1=2 median=3 q3=4 max=5']),
  heatmap: chartSource('heatmap', ['cell "a" "x" 10', 'cell "a" "y" 5']),
  scatter: chartSource('scatter', ['x "가(%)"', 'y "나(%)"', 'point "p" x=1 y=2', 'point "q" x=3 y=1']),
  line: chartSource('line', ['x "주차"', 'y "점수(%)"', 'series a "A"', 'point x=1 a=1', 'point x=2 a=2']),
  dumbbell: chartSource('dumbbell', ['x "값(%)"', 'series a "전" role=compare', 'series b "후" role=main', 'row "항목" a=1 b=3']),
};
const WIDE_SEQUENCE = `daphnis 2\n${Array.from({ length: 9 }, (_, i) => `box p${i} "참여자 ${i}"`).join('\n')}\nview calls sequence "호출" {\n  ${Array.from({ length: 9 }, (_, i) => `p${i}`).join(' ')}\n}\nscene "전달"\n${Array.from({ length: 8 }, (_, i) => `  p${i} -> p${i + 1} "메시지 ${i}"`).join('\n')}\n`;
const NARROW = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nview main graph down\n';

// 근거: 설계 docs-integration.md "모든 그림 같은 캔버스 폭 960", playback.md "표시 폭은 문서 미리보기, 목록 카드, 재생기에서 같다". 차트의 논리 폭은 본문 폭에서 글자가 줄지 않게 캔버스보다 좁다.
test('sizeTokens_gallery_and_document_widths_equal_the_figure_canvas_and_the_chart_is_narrower', () => {
  assert.ok(values.size.chart.width < CANVAS && values.size.chart.width >= 640, `차트 논리 폭 ${values.size.chart.width}`);
  assert.equal(values.size.document.column, CANVAS);
  assert.equal(values.size.gallery.column, CANVAS);
});

// 근거: 설계 docs-integration.md "모든 그림의 SVG width는 같은 표준 캔버스 폭이다"(모든 예제와 차트 종류). 차트 내용은 논리 폭이 더 좁아 캔버스 안에 가운데 놓인다.
test('toSvg_every_example_and_chart_type_is_canvas_wide_and_inside_its_viewbox', async () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.dap'));
  assert.ok(files.length > 0);
  for (const file of files) {
    // 사용자 아이콘 세트(`icons custom "icons"`)는 원본이 있는 폴더 기준으로 읽는다
    const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: fileURLToPath(EXAMPLES) });
    const root = rootOf(await toSvg(result));

    assert.equal(root.width, canvasOf(result.figure), file);
  }
  for (const [type, source] of Object.entries(CHARTS)) {
    const result = await buildFigure(`daphnis 2\n${source}`);
    const svg = await toSvg(result, { isStatic: true });

    assert.equal(chartOf(result).width, values.size.chart.width, type);
    assert.deepEqual([rootOf(svg).width, rootOf(svg).viewWidth], [CANVAS, CANVAS], type);
    for (const m of svg.matchAll(/ x="([\d.]+)"/g)) assert.ok(Number(m[1]) <= CANVAS, `${type} x=${m[1]}`);
  }
});

// 근거: 설계 layout.md 그림 크기 "내용이 캔버스보다 좁으면 판만 넓히고 내용은 가운데에 둔다"(SVG와 재생기 모두)
test('toSvg_and_toHtml_narrow_figure_has_canvas_width_and_centered_content', async () => {
  const result = await buildFigure(NARROW);
  const svg = await toSvg(result, { isStatic: true });
  const html = await toHtml(result, 'a');

  assert.ok(result.scene.width < CANVAS);
  assert.deepEqual([rootOf(svg).width, rootOf(svg).viewWidth], [CANVAS, CANVAS]);
  assert.match(svg, new RegExp(`<g transform="translate\\(${(CANVAS - result.scene.width) / 2} 0\\)">`));
  // 재생기는 판마다 SVG 하나다. 판은 자기 상자 그대로 그리고, 보기 폭(--view-w)이 캔버스 폭이라 좁은 판은 캔버스 가운데에 같은 비율로 놓인다.
  assert.match(html, new RegExp(`class="dp-panels" style="--view-w: ${CANVAS}"`));
  assert.match(html, new RegExp(`style="--panel-w: ${result.scene.width};`));
  assert.match(html, new RegExp(`viewBox="0 0 ${result.scene.width} ${result.scene.height}"`));
});

// 근거: 설계 layout.md 그림 크기 "내용이 캔버스보다 넓으면 viewBox는 내용 폭 그대로 두고 표시 폭만 캔버스로 줄인다"
test('toSvg_content_wider_than_the_canvas_keeps_the_view_and_shrinks_the_display_to_the_canvas', async () => {
  const result = await buildFigure(WIDE_SEQUENCE);
  const root = rootOf(await toSvg(result, { isStatic: true }));

  assert.ok(result.scene.width > CANVAS);
  assert.equal(root.width, CANVAS);
  assert.equal(root.viewWidth, result.scene.width);
  assert.ok(Math.abs(root.height - (root.viewHeight * CANVAS) / root.viewWidth) < 0.1);
});

// 근거: 설계 layout.md 그림 크기 "그림 머리 `width wide`는 캔버스를 넓은 폭으로 하고, 생략하면 표준 폭이다. 최소 글자 검사도 그 폭 기준이다"
test('buildFigure_width_wide_keeps_a_row_between_standard_and_wide_canvas_and_sets_the_svg_and_player_width', async () => {
  const row = (header) => `daphnis 2\n${header}${Array.from({ length: 6 }, (_, i) => `box n${i} "아주 긴 이름의 상자 ${i}"`).join('\n')}\n${Array.from({ length: 5 }, (_, i) => `n${i} -> n${i + 1}`).join('\n')}`;
  const standard = await buildFigure(row(''));
  const wide = await buildFigure(row('width wide\n'), { strict: true });

  assert.ok(standard.scene.width <= CANVAS && wide.scene.width > CANVAS && wide.scene.width <= CANVAS_WIDE, `${standard.scene.width} / ${wide.scene.width}`);
  assert.equal(rootOf(await toSvg(wide, { isStatic: true })).width, CANVAS_WIDE);
  assert.equal(rootOf(await toSvg(standard, { isStatic: true })).width, CANVAS);
  assert.match(await toHtml(wide, 'a'), new RegExp(`--figure-canvas: ${CANVAS_WIDE}px`));
});

// 근거: 사용자 요구 "단독 SVG 호환". tokens, figure, chart, status CSS 글이 움직이는 SVG 안 `<style>`에 그대로 들어가므로 `<`나 `&`가 있으면 XML이 깨져 이미지로 열리지 않는다(CSS 주석 속 글자도 해당).
test('styles_embedded_in_the_svg_never_contain_xml_markup_characters', () => {
  for (const name of ['tokens', 'figure', 'chart', 'status']) assert.doesNotMatch(STYLES[name], /[<&]/, `${name} CSS에 XML 특수 문자가 있다`);
});
