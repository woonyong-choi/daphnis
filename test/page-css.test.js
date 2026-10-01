// 페이지 UI 규칙: 그림 표시 폭이 문서 미리보기, 목록 카드, 재생기에서 같다. 분할 조작이 한 모양이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { values } from '../src/tokens.js';

const css = (name) => readFileSync(new URL(`../src/styles/${name}.css`, import.meta.url), 'utf8');
const [PLAYER, GALLERY, DOCUMENT] = [css('player'), css('gallery'), css('document')];

// cost: time O(n), heap O(n), stack O(1)
// vars: n = CSS 글자 수
// basis: estimate
// 선택자가 정확히 같은 규칙 블록의 선언 표. 같은 선택자 블록이 여럿이면 뒤의 선언이 앞을 덮는다.
function declarationsOf(sheet, selector) {
  const block = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  const found = {};
  for (const match of sheet.matchAll(block)) {
    for (const line of match[1].split(';')) {
      const [name, ...rest] = line.split(':');
      if (rest.length) found[name.trim()] = rest.join(':').trim();
    }
  }
  return found;
}

test('size_document_column_and_gallery_column_equal_the_figure_canvas_so_nothing_shrinks_the_figure', () => {
  assert.equal(values.size['document-column'], values.size['figure-canvas']);
  assert.equal(values.size['gallery-column'], values.size['figure-canvas']);
});

test('displayWidthRule_all_three_pages_use_one_gutter_and_the_canvas_as_the_container_maximum', () => {
  const gutter = (sheet) => declarationsOf(sheet, 'body').padding.split(' ').at(-1);

  // 컨테이너 폭 = 화면 폭 - 좌우 바깥 여백. 세 쪽의 좌우 바깥 여백이 같다.
  assert.deepEqual([gutter(PLAYER), gutter(GALLERY), gutter(DOCUMENT)], ['var(--space-16)', 'var(--space-16)', 'var(--space-16)']);
  // 그림 폭은 min(표준 캔버스 폭, 컨테이너 폭)이다.
  assert.equal(declarationsOf(PLAYER, '.fl-figure')['max-width'], 'var(--size-figure-canvas)');
  assert.equal(declarationsOf(DOCUMENT, 'article')['max-width'], 'var(--size-document-column)');
  assert.match(GALLERY, /minmax\(min\(100%, var\(--size-gallery-column\)\), 1fr\)/);
});

test('displayWidthRule_containers_take_no_horizontal_padding_or_layout_border_around_the_figure', () => {
  assert.match(declarationsOf(PLAYER, '.fl-canvas').padding, /^var\(--space-6\) 0$/);
  for (const [sheet, selector] of [[PLAYER, '.fl-figure'], [GALLERY, 'section']]) {
    const rules = declarationsOf(sheet, selector);
    assert.equal(rules.border, undefined, `${selector} border`);
    assert.match(rules['box-shadow'], /^0 0 0 var\(--border-thin\) var\(--color-frame\)$/);
  }
  assert.equal(declarationsOf(PLAYER, 'html.embedded body').padding, '0');
});

test('displayWidthRule_images_and_svgs_shrink_to_the_container_and_are_centered', () => {
  assert.equal(declarationsOf(DOCUMENT, 'img')['max-width'], '100%');
  assert.equal(declarationsOf(PLAYER, '.fl-canvas svg')['max-width'], '100%');
  assert.equal(declarationsOf(PLAYER, '.fl-canvas svg').margin, '0 auto');
});

test('splitControls_theme_group_player_tabs_and_round_buttons_share_radius_and_height', () => {
  const groups = [declarationsOf(DOCUMENT, '.theme'), declarationsOf(GALLERY, '.theme'), declarationsOf(PLAYER, '.fl-tabs')];
  const buttons = [declarationsOf(DOCUMENT, '.theme button'), declarationsOf(GALLERY, '.theme button'), declarationsOf(PLAYER, '.fl-tabs button')];
  const round = declarationsOf(PLAYER, '.fl-round');

  for (const group of groups) {
    assert.equal(group['border-radius'], 'var(--radius-full)');
    assert.equal(group['min-height'], 'var(--size-control)');
    assert.equal(group.padding, 'var(--space-1-5)');
  }
  for (const button of buttons) {
    assert.equal(button['border-radius'], 'var(--radius-full)');
    assert.equal(button['min-height'], 'var(--size-control-inner)');
  }
  assert.equal(round['border-radius'], 'var(--radius-full)');
  assert.equal(round.height, 'var(--size-control)');
  assert.equal(values.size['control-inner'], values.size.control - 2 * (values.space['1-5'] + values.border.thin));
});

test('playerBody_sets_the_text_color_token_so_inherited_text_is_not_default_black', () => {
  assert.equal(declarationsOf(PLAYER, 'body').color, 'var(--color-fg)');
});
