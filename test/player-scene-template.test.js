// HTML 내려받기의 정본 템플릿 계약: 문서 머리 칸에 칸이 빈 정본을 base64로 담고, 칸을 다시 채우면 문서와 바이트까지 같다.
// 그리고 재생 조작이 없는 새 마크업, 모든 장면 설정과 글꼴이 정본에 든다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { CANONICAL_NAME, toHtml } from '../src/html.js';
import { MIXED } from './player-compiled.js';

// 장면 설정(mode, speed)은 원본의 `scene "이름" mode= speed=`가 정한다.
const SOURCE = 'daphnis 2\ntitle "</script><!-- 제목 -->"\nbox a "A"\nbox b "B"\nvalue n "Count" on=b\non b n+1\na -> b\nscene "</script> First" mode=loop speed=2\n  a -> b time=300ms\nscene "Last" mode=once\n  a -> b time=300ms\n';
const SLOT = `<meta name="${CANONICAL_NAME}" content="`;

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 문서 글자 수
// basis: estimate
// 원본의 재생기 HTML.
async function build(source = SOURCE) {
  return toHtml(await buildFigure(source), 'scene');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 글자 수
// basis: estimate
// 문서 머리 칸의 base64와 그 앞뒤 글.
function slotOf(html) {
  const at = html.indexOf(SLOT) + SLOT.length;
  const end = html.indexOf('"', at);
  return { at, end, encoded: html.slice(at, end) };
}

// 근거: 내려받기 계약. 정본은 문서에서 칸 내용만 뺀 글이고, 칸을 다시 채우면 문서와 바이트까지 같다
test('template_canonical_is_the_document_without_the_slot_and_refilling_is_byte_identical', async () => {
  const html = await build();
  assert.equal(html.split(SLOT).length, 2, '칸 머리글은 문서에 하나만 있다');
  const { at, end, encoded } = slotOf(html);
  assert.match(encoded, /^[A-Za-z0-9+/]+={0,2}$/);
  const canonical = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(canonical, html.slice(0, at) + html.slice(end));
  assert.equal(canonical.split(SLOT).length, 2);
  const refilled = canonical.slice(0, at) + encoded + canonical.slice(at);
  assert.ok(Buffer.from(refilled).equals(Buffer.from(html)));
});

// 근거: 내려받기 계약. 같은 입력은 같은 바이트이고, 정본 안에 정본이 겹쳐 쌓이지 않는다
test('template_is_deterministic_and_does_not_nest_serialized_documents', async () => {
  const [first, second] = [await build(), await build()];
  assert.ok(Buffer.from(first).equals(Buffer.from(second)));
  const canonical = Buffer.from(slotOf(first).encoded, 'base64').toString('utf8');
  assert.equal(canonical.includes('content="' + slotOf(first).encoded.slice(0, 40)), false);
  assert.ok(first.length < canonical.length * 2.5, `${first.length} / ${canonical.length}`);
});

// 근거: 내려받기 계약. 제목과 장면 이름에 스크립트 끝 표시나 주석 시작이 있어도 정본이 스크립트로 새지 않는다
test('template_never_places_unescaped_title_or_labels_inside_script_or_markup', async () => {
  const html = await build();
  const canonical = Buffer.from(slotOf(html).encoded, 'base64').toString('utf8');
  for (const text of [html, canonical]) {
    assert.equal(text.match(/<script\b/g).length, text.match(/<\/script>/g).length);
    assert.equal(text.includes('<!-- 제목'), false);
    assert.equal(text.includes('</script> First'), false);
    assert.equal(text.includes('<\\/script>') || text.includes('\\u003c/script>'), true);
  }
  assert.ok(html.includes('<title>&lt;/script&gt;'));
});

// 근거: 내려받기 계약. 모든 장면 설정(mode, speed), 글꼴, 아이콘이 정본에 들어 있고 바깥 자원을 부르지 않는다
test('template_carries_all_scene_settings_fonts_icons_and_references_nothing_external', async () => {
  const html = await build();
  const canonical = Buffer.from(slotOf(html).encoded, 'base64').toString('utf8');
  // 문서 글이 아주 커서, 실패하면 어느 조건인지만 알린다.
  const has = (pattern, label) => assert.ok(pattern.test(canonical), label);
  has(/"mode":"loop","speed":2/, 'loop 장면 설정');
  has(/"mode":"once"/, 'once 장면 설정');
  has(/@font-face/, '글꼴');
  has(/class="fl-round fl-download"/, '내려받기 단추');
  has(/"download":"\\u003cpath/, '내려받기 아이콘');
  assert.ok(!/(?:src|href)\s*=\s*["']?(?:https?:)?\/\/(?!www\.w3\.org)/.test(canonical), '바깥 주소를 부른다');
  assert.ok(!/url\(\s*["']?https?:|@import|\bfetch\(|XMLHttpRequest|\bimport\(/.test(canonical), '바깥 자원을 부르는 코드가 있다');
});

// 근거: 장면 계약. 재생·배속·반복·진행선·단계 번호·아래 설명 글 마크업이 없고 도구 막대는 내려받기와 전체 화면 순서다
test('template_has_no_playback_controls_and_orders_the_toolbar_download_then_fullscreen', async () => {
  const html = await build();
  for (const gone of ['fl-pause', 'fl-rate', 'fl-repeat', 'fl-ring', 'fl-position', 'fl-caption', 'fl-transport', 'fl-context', 'fl-bar', 'aria-live']) assert.equal(html.includes(gone), false, gone);
  assert.ok(html.indexOf('fl-download') < html.indexOf('fl-round fl-full'));
  assert.ok(html.includes('<div class="fl-view-tools" role="toolbar" aria-label="그림 도구">'));
  assert.ok(html.includes('<figcaption class="fl-foot">\n<div class="fl-tabs" role="tablist" aria-label="장면 선택"></div>\n</figcaption>'));
});

// 근거: 내려받기 계약. 판이 여럿이고 차트와 값이 있는 혼합 그림도 정본이 모든 판, 차트 틀, 장면 설정, 글꼴을 담고 칸을 다시 채우면 바이트까지 같다
test('template_of_the_mixed_document_carries_every_panel_chart_frame_scene_and_font', async () => {
  const html = await build(MIXED);
  const { at, end, encoded } = slotOf(html);
  const canonical = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(canonical, html.slice(0, at) + html.slice(end));
  assert.ok(Buffer.from(canonical.slice(0, at) + encoded + canonical.slice(at)).equals(Buffer.from(html)));
  // 넓은 배치의 세 판과, 좁은 배치(`<template class="fl-narrow">`)의 세 판이다. 두 배치가 같은 정본 문서에 실린다.
  const [wide, narrow] = canonical.split('<template class="fl-narrow">');
  assert.equal((wide.match(/<section class="dp-panel"/g) ?? []).length, 3, '세 판 모두');
  assert.equal((narrow.match(/<section class="dp-panel"/g) ?? []).length, 3, '좁은 배치도 세 판 모두');
  for (const view of ['main', 'calls', 'chart']) assert.ok(canonical.includes(`data-view="${view}"`), view);
  assert.ok(canonical.includes('"chartFrames":{"load"'), '차트 틀');
  assert.ok(canonical.includes('"charts":{"load"'), '차트 시간표');
  for (const mode of ['once', 'loop', 'static']) assert.ok(canonical.includes(`"mode":"${mode}"`), mode);
  assert.ok(/@font-face/.test(canonical), '글꼴');
  assert.ok(/class="fl-round fl-download"/.test(canonical), '내려받기 단추');
  assert.ok(!/(?:src|href)\s*=\s*["']?(?:https?:)?\/\/(?!www\.w3\.org)/.test(canonical), '바깥 주소를 부른다');
});
