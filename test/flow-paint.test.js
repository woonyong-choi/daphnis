// 색 이름(tone=)이 정한 흐름 점의 면, 글 상자 글자, 외곽선이 HTML 재생기와 움직이는 SVG의 실제 재생 화면에서 같고 정본 토큰과 같다.
// 색 이름은 일곱 계열과 gray다(src/tone.js). Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { contrast } from '../src/contrast.js';
import { TONES, toneColors } from '../src/tone.js';
import { launchChrome } from './chrome.js';
import { colorRoleOf, themeColor } from './helpers.js';

const SOURCE = `daphnis 2\nbox a "출발"\nbox b "도착"\na -> b\n${TONES.map((tone) => `scene "${tone}" mode=once for=2s\n  track a -> b "${tone}" time=1s tone=${tone}`).join('\n')}\n`;
const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];

// cost: time O(t), heap O(t), stack O(1), io 1
// vars: t = 글자 요소 수
// basis: estimate
// 흐름 글 상자 글자 하나를 찾아 면, 글자색, 윤곽, 점 면, 점 윤곽의 계산된 색을 읽는다.
async function paintOf(page, tone) {
  return page.evaluate((name) => {
    const text = [...document.querySelectorAll('.chip')].find((el) => el.textContent === name);
    const rect = text.parentElement.querySelector('rect');
    let group = text.parentElement;
    while (!group.querySelector(':scope > circle')) group = group.parentElement;
    const dot = [...group.querySelectorAll(':scope > circle')].at(-1);
    const hex = (css) => {
      const numbers = css.match(/[\d.]+/g);
      return `#${(css.startsWith('color(srgb') ? numbers.slice(-3).map((n) => Math.round(Number(n) * 255)) : numbers.slice(0, 3).map(Number)).map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    };
    return { face: hex(getComputedStyle(rect).fill), ink: hex(getComputedStyle(text).fill), outline: getComputedStyle(rect).stroke === 'none' ? 'none' : hex(getComputedStyle(rect).stroke), dot: hex(getComputedStyle(dot).fill), dotOutline: getComputedStyle(dot).stroke, strokeWidth: parseFloat(getComputedStyle(dot).strokeWidth) };
  }, tone);
}

function assertPaint(paint, tone, theme) {
  const colors = toneColors(tone);
  assert.equal(paint.face, themeColor(theme, colorRoleOf(colors.fill)), `${theme} ${tone} face`);
  assert.equal(paint.dot, paint.face);
  assert.equal(paint.ink, themeColor(theme, colorRoleOf(colors.ink)), `${theme} ${tone} ink`);
  assert.ok(contrast(paint.ink, paint.face) >= 4.5, JSON.stringify(paint));
  if (colors.outline === undefined) return;
  // 윤곽은 같은 계열의 테두리 값이다. 노랑은 라이트에서 바탕과 3에 못 미쳐 점 윤곽과 직접 글자가 뜻을 전하므로 다크에서만 3을 잰다.
  assert.equal(paint.outline, themeColor(theme, colorRoleOf(colors.outline)), `${theme} ${tone} outline`);
  assert.ok(paint.dotOutline !== 'none' && paint.strokeWidth > 0, `${tone}: 점 윤곽`);
  if (tone !== 'yellow' || theme === 'dark') assert.ok(contrast(paint.outline, themeColor(theme, 'bg')) >= 3, `${theme} ${tone} outline on bg`);
}

for (const [name, launch] of ENGINES) {
  // cost: time O(v·t·page), heap O(page), stack O(1), io v·t
  // vars: v = 화면 조건 수, t = 색 이름 수, page = 브라우저 비용
  // basis: estimate
  test(`${name}_tone_faces_text_and_dot_outlines_match_in_html_and_svg`, async () => {
    const result = await buildFigure(SOURCE);
    const html = await toHtml(result, '흐름색');
    const browser = await launch();
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 1280]) {
        const player = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
        await player.clock.install({ time: 0 });
        await player.clock.pauseAt(60_000);
        await player.setContent(html);
        await player.evaluate(() => document.fonts.ready);
        for (const [i, tone] of TONES.entries()) {
          await player.getByRole('tab', { name: tone, exact: true }).click();
          await player.clock.runFor(500);
          const svgPage = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
          await svgPage.setContent(await toSvg(result, { scene: i }));
          await svgPage.evaluate(() => document.fonts.ready);
          await svgPage.evaluate(() => { const svg = document.querySelector('svg'); svg.pauseAnimations(); svg.setCurrentTime(0.5); });
          const paints = [await paintOf(player, tone), await paintOf(svgPage, tone)];
          paints.forEach((paint) => assertPaint(paint, tone, colorScheme));
          assert.deepEqual(paints[0], paints[1], `${colorScheme} ${width}px ${tone}: 재생기와 SVG가 같다`);
          if (tone === 'yellow') assert.throws(() => assertPaint({ ...paints[0], face: '#866800' }, tone, colorScheme));
          await svgPage.close();
        }
        await player.close();
      }
    } finally { await browser.close(); }
  });
}
