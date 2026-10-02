// 파랑 accent와 주황의 짝. 주황은 파랑과 같은 L·C에서 색상만 돌린 값이고, 색각 이상에서도 둘이 구분된다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { themeColor as color } from './helpers.js';

const THEMES = ['light', 'dark'];
const ORANGE_HUE = 50;
const HUE_TOLERANCE = 1;
const LIGHTNESS_TOLERANCE = 0.01;
const CHROMA_TOLERANCE = 0.01;
const CVD_MIN_DISTANCE = 0.1;
// 색각 이상 시뮬레이션(Machado 2009, 심한 정도 1.0). 선형 sRGB에 곱한다.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const channelsOf = (hex) => [1, 3, 5].map((i) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선형 sRGB를 OKLab [L, a, b]로 바꾼다.
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `#rrggbb`의 OKLCH [L, C, h(도)].
function oklchOf(hex) {
  const [L, a, b] = linearToOklab(channelsOf(hex));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const distanceOf = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 색각 이상 눈에 비친 OKLab 좌표.
const seenBy = (matrix, hex) => linearToOklab(matrix.map((row) => row.reduce((sum, weight, i) => sum + weight * channelsOf(hex)[i], 0)));

test('palette_light_and_dark_orange_keep_the_blue_lightness_and_chroma_and_only_turn_the_hue', () => {
  for (const [theme, blue, orange] of [['light', 'palette.blue.500', 'palette.orange.500'], ['dark', 'palette.blue.400', 'palette.orange.400']]) {
    const [blueL, blueC] = oklchOf(color(theme, blue));
    const [orangeL, orangeC, orangeHue] = oklchOf(color(theme, orange));

    assert.ok(Math.abs(blueL - orangeL) <= LIGHTNESS_TOLERANCE, `${theme} L ${blueL.toFixed(3)} / ${orangeL.toFixed(3)}`);
    assert.ok(Math.abs(blueC - orangeC) <= CHROMA_TOLERANCE, `${theme} C ${blueC.toFixed(3)} / ${orangeC.toFixed(3)}`);
    assert.ok(Math.abs(orangeHue - ORANGE_HUE) <= HUE_TOLERANCE, `${theme} h ${orangeHue.toFixed(1)}`);
  }
});

test('palette_orange_series_color_follows_the_theme_orange', () => {
  assert.equal(color('light', 'series-2'), color('light', 'palette.orange.500'));
  assert.equal(color('dark', 'series-2'), color('dark', 'palette.orange.400'));
  assert.equal(color('light', 'tag.orange'), color('light', 'palette.orange.500'));
});

for (const theme of THEMES) {
  for (const [name, matrix] of Object.entries(CVD)) {
    test(`palette_${theme}_blue_and_orange_stay_apart_for_${name}`, () => {
      const [blue, orange] = theme === 'light' ? ['palette.blue.500', 'palette.orange.500'] : ['palette.blue.400', 'palette.orange.400'];
      const distance = distanceOf(seenBy(matrix, color(theme, blue)), seenBy(matrix, color(theme, orange)));

      assert.ok(distance >= CVD_MIN_DISTANCE, `${theme} ${name}: ${distance.toFixed(3)}`);
    });
  }
}
