import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlyphSet, embedFonts, findMissingGlyph, measure, wrap } from '../src/measure/fonts.js';

test('measure_mono_hangul_uses_body_font_width', () => {
  const hangul = measure('요청', 11, 'mono');
  assert.equal(hangul, measure('요청', 11, 'regular'));
  const mixed = measure('app-server 요청', 11, 'mono');
  assert.equal(mixed, measure('app-server ', 11, 'mono') + hangul);
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
  assert.match(css, /font-family:FigSans/);
  assert.equal(css, await embedFonts(glyphs.used));
});

test('tokens_mono_font_chain_falls_back_to_sans_face', async () => {
  const { values } = await import('../src/tokens.js');
  assert.match(values.font.mono, /^FigMono, FigSans, /);
});
