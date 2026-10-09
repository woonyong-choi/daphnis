// 시각 수정: 갱신 효과는 칠한 대상의 같은 계열을 더 밝힌 색(effect 단계)이다. 노랑은 노랑이고 갈색, 회색, 파랑이 되지 않는다. 색을 고르지 않은 카드만 상태 파랑이다.
// 대비는 기록하고 문턱으로 쓰지 않는다. 이 시험은 계열 안에 머무는지(색상각, 밝기, 채도)를 실제 Chrome의 계산 색으로 잰다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { categoryPaint } from '../src/chart-palette.js';
import { launchChrome, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';

// 계산 색 `rgb(r, g, b)`의 OKLCH
function oklchOfRgb(css) {
  const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const [L, a, c] = [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  return { L, C: Math.hypot(a, c), h: ((Math.atan2(c, a) * 180) / Math.PI + 360) % 360 };
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
// 반투명한 effect 면(불투명도 a)을 바탕 위에 올린 합성색(sRGB 0~255)
const composite = (over, under, a) => `rgb(${over.match(/[\d.]+/g).slice(0, 3).map((v, i) => Number(v) * a + Number(under.match(/[\d.]+/g)[i]) * (1 - a)).join(', ')})`;

const HEAD = 'daphnis 2\nvalue q "q" on=db from=0\n';
const CARDS = (paint) => `daphnis 2\nbox a "A"\nbox b "B"${paint}\na -> b\nscene "s" mode=once\n  a -> b time=500ms\n`;
const YELLOW_BAR = `${HEAD}box a "A"\nstore db "DB"\nchart c "노랑" bar {\n  series s0 "하나"\n  series s1 "둘"\n  row "R" s0=2 s1=q\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+7"\n`;
const YELLOW_LINE = `${HEAD}box a "A"\nstore db "DB"\nchart c "노랑 선" line {\n  series s0 "하나"\n  series s1 "둘"\n  point x=1 s0=2 s1=q\n  point x=2 s0=3 s1=4\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+7"\n`;

describe('effect role in Chrome', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  // 근거: 카드 도착 후광. 칠한 카드는 자기 계열의 effect 색이고 색을 고르지 않은 카드는 상태 파랑이다
  for (const scheme of ['light', 'dark']) {
    test(`${scheme}: a card arrival uses the family effect for a painted card and the state blue for a default card`, async () => {
      const read = (page) =>
        page.evaluate(() => {
          const resolve = (value) => {
            const probe = document.createElement('i');
            probe.style.color = value;
            document.body.appendChild(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          };
          const overlay = document.querySelector('.fl-node[data-id="b"] .fl-pulse');
          const outline = document.querySelector('.fl-node[data-id="b"] > .fl-stroke:not(.fl-pulse)');
          return { level: Number(overlay.getAttribute('opacity')), stroke: getComputedStyle(overlay).stroke, outline: getComputedStyle(outline).stroke, width: getComputedStyle(overlay).strokeWidth, outlineWidth: getComputedStyle(outline).strokeWidth, active: resolve('var(--color-state-active)'), yellowEffect: resolve('var(--color-paint-yellow-effect)'), yellowOutline: resolve('var(--color-paint-yellow-outline)'), blueEffect: resolve('var(--color-paint-blue-effect)'), blueOutline: resolve('var(--color-paint-blue-outline)') };
        });
      const peak = async (source) => {
        const { html } = await playerHtml(source);
        let out;
        await withPage(browser, html, { colorScheme: scheme }, async (page) => {
          // 가짜 시계는 문서가 열리는 동안 한 프레임쯤 늦는다. 도착(500) 뒤 올라감 80ms와 머묾 80ms 안에 든다.
          await page.clock.runFor(500 + 150);
          out = await read(page);
        });
        return out;
      };
      const yellow = await peak(CARDS(' stroke=yellow'));
      assert.ok(yellow.level > 0.95);
      assert.equal(yellow.stroke, yellow.yellowEffect, '노랑 카드의 후광은 노랑 effect');
      assert.notEqual(yellow.stroke, yellow.active, '상태 파랑이 아니다');
      assert.equal(yellow.width, yellow.outlineWidth, '굵기는 자라지 않는다');
      const [border, effect] = [oklchOfRgb(yellow.yellowOutline), oklchOfRgb(yellow.stroke)];
      assert.ok(hueGap(border.h, effect.h) <= 8 && effect.L > border.L && effect.C > 0.04, `${JSON.stringify({ border, effect })}`);
      const blue = await peak(CARDS(' stroke=blue'));
      assert.equal(blue.stroke, blue.blueEffect);
      assert.notEqual(blue.stroke, blue.blueOutline, '파랑 카드의 효과는 윤곽과 달라 깜빡임이 보인다');
      const plain = await peak(CARDS(''));
      assert.equal(plain.stroke, plain.active, '색을 고르지 않은 카드는 상태 파랑이다');
    });
  }

  // 근거: 차트 표식 효과. 노랑 막대와 선의 겹침은 노랑 effect이고 그 계열에 머문다. 다크에서 면이 밝아지며 올리브로 어두워지지 않는다
  // 표식은 모양이 아니라 의미 ID(`s1:0`)로 찾는다. 범주 표식은 파랑 원, 노랑 네모여서 노랑 선 점은 rect다. 채운 면 검사는 막대에만 건다.
  for (const scheme of ['light', 'dark']) {
    for (const [name, source, mark, shape] of [['bar', YELLOW_BAR, 's1:0', 'rect'], ['line point', YELLOW_LINE, 's1:0', 'rect']]) {
      test(`${scheme}: a yellow ${name} effect stays yellow, brighter than its border, never gray, brown or blue`, async () => {
        const yellow = categoryPaint(1);
        const { html } = await playerHtml(source);
        await withPage(browser, html, { colorScheme: scheme }, async (page) => {
          await page.clock.runFor(500 + 130);
          const read = await page.evaluate(
            ({ mark: m }) => {
              const resolve = (value) => {
                const probe = document.createElement('i');
                probe.style.color = value;
                document.body.appendChild(probe);
                const color = getComputedStyle(probe).color;
                probe.remove();
                return color;
              };
              const root = document.querySelector('[data-chart="c"]');
              const base = root.querySelector(`[data-mark="${m}"]`);
              const overlay = root.querySelector(`[data-pulse-of="${m}"]`);
              if (!base || !overlay) return { missing: { base: !base, overlay: !overlay } };
              const css = getComputedStyle(overlay);
              return { baseShape: base.tagName.toLowerCase(), overlayShape: overlay.tagName.toLowerCase(), level: Number(overlay.getAttribute('opacity')), stroke: css.stroke, fill: css.fill, fillOpacity: Number(css.fillOpacity), baseFill: getComputedStyle(base).fill, baseStroke: getComputedStyle(base).stroke, border: resolve('var(--color-data-category-outline-2)'), effect: resolve('var(--color-data-category-effect-2)'), active: resolve('var(--color-state-active)'), surface: resolve('var(--color-node)') };
            },
            { mark },
          );
          assert.equal(read.missing, undefined, `표식 ${mark}와 그 겹침이 있다: ${JSON.stringify(read)}`);
          assert.equal(read.baseShape, shape, `표식 모양: ${JSON.stringify(read)}`);
          assert.equal(read.overlayShape, shape, `겹침은 표식과 같은 모양: ${JSON.stringify(read)}`);
          assert.ok(read.level > 0.9, JSON.stringify(read));
          assert.equal(read.stroke, read.effect, '고리나 선은 노랑 effect');
          assert.notEqual(read.stroke, read.active);
          const [border, effect] = [oklchOfRgb(read.border), oklchOfRgb(read.stroke)];
          assert.ok(hueGap(border.h, effect.h) <= 8, `색상각 ${border.h} -> ${effect.h}`);
          assert.ok(effect.L > border.L + 0.05, `밝기 ${border.L} -> ${effect.L}`);
          assert.ok(effect.C > 0.04, `회색이 아니다: 채도 ${effect.C}`);
          assert.ok(effect.L >= 0.78, `갈색이 아니다: 밝기 ${effect.L}`);
          assert.equal(read.baseStroke, read.border, '표식 자신의 테두리는 그대로');
          if (name === 'bar') {
            assert.equal(read.fill, read.effect);
            assert.ok(read.fillOpacity >= 0.2 && read.fillOpacity <= 0.35, `면은 옅다(${read.fillOpacity})`);
            const rest = oklchOfRgb(read.baseFill);
            const lit = oklchOfRgb(composite(read.fill, read.baseFill, read.fillOpacity));
            // 다크에서는 면이 밝아진다. 라이트의 노랑 앵커 면(밝기 0.861)은 이미 effect(0.860)만큼 밝아 면 합성은 거의 같고, 효과는 고리가 맡는다. 어두워지지는 않는다.
            if (scheme === 'dark') assert.ok(lit.L > rest.L, `${scheme}: 효과 면이 어두워지지 않고 밝아진다 ${rest.L} -> ${lit.L}`);
            else assert.ok(lit.L >= rest.L - 0.005, `${scheme}: 효과 면이 어두워지지 않는다 ${rest.L} -> ${lit.L}`);
            assert.ok(hueGap(lit.h, rest.h) <= 12 && lit.C > 0.04, `${scheme}: 합성색이 노랑 계열에 머문다`);
          }
          assert.equal(yellow.effect.startsWith('var(--color-data-category-effect-'), true);
        });
      });
    }
  }

  // 근거: 효과는 값 글자와 라벨의 변화도 말해야 해서 색만이 아니다(차트 표식 겹침은 보조 신호다). SVG도 같은 effect를 쓴다
  test('the animated svg effect uses the same effect token as the player', async () => {
    const svg = await toSvg(await buildFigure(YELLOW_BAR), { scene: 0 });
    assert.match(svg, /data-pulse-of="s1:0"[^>]*>/);
    const overlay = svg.match(/<rect[^>]*style="([^"]*)"[^>]*data-pulse-of="s1:0"/)[1];
    assert.match(overlay, /fill:var\(--color-data-category-effect-2\);fill-opacity:0\.2;stroke:var\(--color-data-category-effect-2\)/);
  });

  // 근거: 점이나 값 글자가 아직 나타나지 않았으면 그 자리에 효과가 먼저 번쩍이지 않는다(겹침이 표식과 같은 나타남을 곱해 받는다)
  test('an overlay of a dot that has not appeared yet is not visible', async () => {
    const { html } = await playerHtml(YELLOW_LINE);
    await withPage(browser, html, {}, async (page) => {
      const wrapped = await page.evaluate(() => [...document.querySelectorAll('[data-chart="c"] .fl-mark-pulse-wrap')].map((el) => ({ classes: el.getAttribute('class'), at: el.dataset.at, inner: el.firstElementChild?.dataset.pulseOf })));
      assert.ok(wrapped.length > 0 && wrapped.every((w) => /\b(dot|pop|late)\b/.test(w.classes) && w.inner), JSON.stringify(wrapped));
      assert.ok(wrapped.some((w) => w.at !== undefined), '점 겹침은 점과 같은 data-at를 갖는다');
    });
  });
});
