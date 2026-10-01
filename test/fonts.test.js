import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import { createGlyphSet, embedFonts, findMissingGlyph, measure, wrap } from '../src/measure/fonts.js';

const require = createRequire(import.meta.url);

// cost: time O(f), heap O(f), stack O(1), io 1
// vars: f = 글꼴 파일 크기
// basis: estimate
/** 글꼴 파일의 글 폭(px). 테스트가 기대값을 파일에서 직접 구하려고 쓴다. */
function widthIn(file, text, size) {
  const font = fontkit.create(readFileSync(require.resolve(file)));
  return (font.layout(text).advanceWidth / font.unitsPerEm) * size;
}

/** 부동소수점 합 순서 차이만 허용한다. */
function assertNear(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

const INTER = '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
const NOTO = '@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf';

test('measure_latin_uses_inter_width', () => {
  assertNear(measure('Hello, world', 12, 'regular'), widthIn(INTER, 'Hello, world', 12));
  assert.notEqual(measure('Hello', 12, 'semibold'), measure('Hello', 12, 'regular'));
});

test('measure_hangul_uses_noto_sans_kr_width', () => {
  assertNear(measure('요청 처리', 12, 'regular'), widthIn(NOTO, '요청', 12) + widthIn(INTER, ' ', 12) + widthIn(NOTO, '처리', 12));
});

test('measure_mixed_text_sums_runs_by_font', () => {
  const mixed = measure('API 요청', 12, 'regular');
  assertNear(mixed, widthIn(INTER, 'API ', 12) + widthIn(NOTO, '요청', 12));
});

test('measure_mono_hangul_uses_noto_sans_kr_width', () => {
  const hangul = measure('요청', 11, 'mono');
  assertNear(hangul, measure('요청', 11, 'regular'));
  assertNear(hangul, widthIn(NOTO, '요청', 11));
  const mixed = measure('app-server 요청', 11, 'mono');
  assertNear(mixed, measure('app-server ', 11, 'mono') + hangul);
  assert.equal(measure('abc', 10, 'mono'), 18);
});

test('measure_and_wrap_are_deterministic', () => {
  assert.equal(measure('app-server 요청', 11, 'mono'), measure('app-server 요청', 11, 'mono'));
  assert.deepEqual(wrap('app-server 요청 보내기', 60, 11, 'mono'), wrap('app-server 요청 보내기', 60, 11, 'mono'));
});

test('findMissingGlyph_follows_fallback_chain', () => {
  assert.equal(findMissingGlyph('요청', 'mono'), undefined);
  assert.equal(findMissingGlyph('a😀', 'mono'), '😀');
});

test('embedFonts_mono_text_with_hangul_embeds_both_faces', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('ab 요청', 'mono');
  const css = await embedFonts(glyphs.used);
  assert.match(css, /font-family:FigMono/);
  assert.match(css, /font-family:FigSansKo/);
  assert.doesNotMatch(css, /font-family:FigSans[^K]/);
  assert.equal(css, await embedFonts(glyphs.used));
});

test('tokens_mono_font_chain_falls_back_to_sans_face', async () => {
  const { values } = await import('../src/tokens.js');
  assert.match(values.font.mono, /^FigMono, FigSans, FigSansKo, /);
  assert.match(values.font.sans, /^FigSans, FigSansKo, /);
});

test('embedFonts_body_text_splits_inter_and_noto_pieces', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('API 요청', 'semibold');
  const css = await embedFonts(glyphs.used);
  assert.match(css, /font-family:FigSans;font-weight:600/);
  assert.match(css, /font-family:FigSansKo;font-weight:600/);
});

test('pages_use_inter_and_noto_chain_and_name_tag', async () => {
  const { toDocument, toGallery } = await import('../src/html.js');
  const figures = [{ name: 'bar', title: '막대 차트', href: 'bar' }];
  for (const page of [toDocument(figures, '예제'), toGallery(figures, '예제')]) {
    assert.match(page, /--font-sans: [^;]*Inter[^;]*Noto Sans KR/);
    assert.match(page, /font-family: var\(--font-sans\)/);
    assert.doesNotMatch(page, /h2 \{[^}]*font-mono/);
    assert.match(page, /<h2>막대 차트<span class="name">bar<\/span><\/h2>/);
  }
});
