// 마지막 회귀 감사의 수용된 결함들(브라우저가 필요 없는 부분). 각 시험은 고치기 전에 실패하던 동작을 직접 읽는다.
// 근거 문서: docs/design/playback.md(멈춘 SVG와 장면 없는 문서), layout.md(순서 그림 판 이동), figure-check.md(2번과 5번), charts.md(산점도 이름 상자, 원·도넛 강조). 브라우저로 잰 부분은 runtime-regressions-final-browser.test.js다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClock } from '../src/animate/clock.js';
import { discreteWindows } from '../src/animate/discrete.js';
import { buildFigure } from '../src/build.js';
import { checkCrowding } from '../src/check/edges.js';
import { isCoVisible } from '../src/check/geometry.js';
import { NAME_STEP, placeNames } from '../src/chart/scatter-names.js';
import { toHtml } from '../src/html.js';
import { STYLES } from '../src/styles.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { createProblems } from '../src/source/problems.js';
import { chartSource, errorsOf } from './helpers.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styleOf = (svg) => svg.match(/<style>([\s\S]*?)<\/style>/)[1];
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- 순서 보기 구획과 장면 사이 선 ----

// 근거: 판을 쌓는 shiftScene이 구획 틀(x, y)만 옮기고 안쪽 제목과 대안 경계의 y는 옮기지 않아, 그래프 보기가 먼저일 때 제목이 판 위로 올라갔다.
test('sequence_fragment_header_and_branch_rows_follow_the_panel_origin_in_every_view_order', async () => {
  const body = 'box a "A"\nbox b "B"\na -> b\n';
  const fragment = 'scene "s" mode=once\nfragment alt "x" choose="yes" {\n  branch "yes" {\n    a -> b "m" time=400ms\n  }\n  branch "no" {\n    b -> a "n" time=400ms\n  }\n}\n';
  for (const order of ['view s sequence {\n  a b\n}\nview g graph {\n  a b\n}\n', 'view g graph {\n  a b\n}\nview s sequence {\n  a b\n}\n']) {
    const { scene } = await buildFigure(`daphnis 2\n${body}${order}${fragment}`);
    const panel = scene.panels.find((p) => p.view === 's');
    const [frame] = scene.fragments;
    assert.ok(frame.y >= panel.box.y, '틀은 판 안에 있다');
    assert.equal(frame.header.y, frame.y, '제목은 틀의 맨 위에서 시작한다');
    assert.deepEqual(frame.branches.map((b) => b.y > frame.header.y && b.y < frame.y + frame.h), [true, true], '대안 경계는 틀 안에 있다');
    assert.ok(frame.branches[0].y < frame.branches[1].y);
    assert.match(await toSvg(await buildFigure(`daphnis 2\n${body}${order}${fragment}`), { isStatic: true }), /fl-fragment/);
  }
});

// 근거: 5번(선이 붙음)은 서로 다른 장면에서만 보이는 메시지 쌍까지 비교해, 장면마다 같은 행에 놓이는 csapp 순서 그림 둘이 만들어지지 않았다.
test('check_5_compares_only_edges_that_can_be_seen_together_and_the_two_csapp_sequences_build', async () => {
  const vertical = (x, si, from, to) => ({ from, to, line: si + 1, si, points: [{ x, y: 0 }, { x, y: 60 }] });
  const crowd = (edges) => {
    const problems = createProblems('');
    checkCrowding({ edges, family: { hint: 'change the declaration order' } }, problems);
    return problems.errors.length;
  };
  assert.equal(crowd([vertical(100, 0, 'p', 'q'), vertical(102, 0, 'r', 's')]), 1, '같은 장면의 붙은 선은 그대로 오류다');
  assert.equal(crowd([vertical(100, 0, 'p', 'q'), vertical(102, 1, 'r', 's')]), 0, '다른 장면의 선은 함께 보이지 않는다');
  assert.equal(crowd([vertical(100, undefined, 'p', 'q'), vertical(102, 1, 'r', 's')]), 1, '그래프의 선(장면 번호 없음)은 모든 선과 함께 본다');
  assert.deepEqual([[0, 0], [0, 1], [undefined, 1], [1, undefined], [undefined, undefined]].map(([a, b]) => isCoVisible({ si: a }, { si: b })), [true, false, true, true, true]);
  for (const name of ['exception-sequence', 'thread-race']) {
    const result = await buildFigure(read(`./fixtures/csapp/${name}.dap`), { baseDir: new URL('./fixtures/csapp/', import.meta.url).pathname });
    assert.ok(result.timeline.steps.length >= 2, `${name}: 장면이 둘 이상이다`);
  }
});

// ---- 산점도 이름 ----

// 근거: 브라우저는 이름의 모든 줄을 NAME_STEP 높이의 줄 상자로 그린다. 이름 상자의 높이 모형이 11 + (줄 수 - 1) × 13이라 이름마다 2px를 덜 잡아 두 이름이 한 문단처럼 붙었다.
test('scatter_name_boxes_reserve_one_name_step_per_line', () => {
  const points = [
    { p: { label: '아주 긴 이름이 좁은 폭에서 여러 줄로 나뉘어야 한다' }, text: '아주 긴 이름이 좁은 폭에서 여러 줄로 나뉘어야 한다', x: 90, y: 100 },
    { p: { label: '짧은' }, text: '짧은', x: 90, y: 300 },
  ];
  const { names } = placeNames(points, 200, { left: 0, top: 0, bottom: 400 });
  assert.ok(names[0].lines.length > 1, '긴 이름은 여러 줄이다');
  assert.equal(names[1].lines.length, 1);
  for (const name of names) assert.equal(name.box.y1 - name.box.y0, name.lines.length * NAME_STEP, name.p.label);
});

// ---- 원, 도넛의 행 흐림 ----

// 근거: 흐림은 모든 차트의 행 규칙(행 묶음 `cr-k`)이다. 원 조각과 범례 색 견본이 묶음에 없고 `dimsInkColor: true`로 히트맵의 굵기 길로 가서 밝히지 않은 조각이 흐려지지 않았다.
test('pie_and_donut_slices_and_swatches_sit_in_the_row_group_and_use_the_common_dimming', async () => {
  for (const type of ['pie', 'donut']) {
    const source = `daphnis 2\n${chartSource(type, ['row "메일" value=12', 'row "리포트" value=7', 'row "이미지" value=20'])}scene "s" mode=once\n  light c "이미지"\n  wait 300ms\n`;
    const result = await buildFigure(source, { strict: true });
    const svg = await toSvg(result, { isStatic: true });
    for (const k of [0, 1, 2]) {
      assert.match(svg, new RegExp(`<g class="cr-${k}"><path d="[^"]*" fill="[^"]*"[^>]* class="chart-part dot"`), `${type} 조각 ${k}은 행 묶음 안`);
      assert.match(svg, new RegExp(`<g class="cr-${k}"><rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" rx="[^"]*" fill="`), `${type} 범례 견본 ${k}은 행 묶음 안`);
      assert.doesNotMatch(svg, new RegExp(`class="chart-part dot[^"]*cr-${k}`), '묶음 대신 조각에 cr 클래스를 직접 달면 나타남 애니메이션과 겹친다');
    }
    const css = styleOf(svg);
    assert.match(css, new RegExp(`\\.fl \\[data-chart="c"\\] \\.cr-0 \\{ opacity: ${values.opacity.dim}; \\}`));
    assert.match(css, new RegExp(`\\.fl \\[data-chart="c"\\] \\.cr-0\\.ink \\{ opacity: ${values.opacity['dim-ink']}; \\}`));
    assert.doesNotMatch(css, /\.cr-2 \{ opacity/, '밝힌 행은 흐리지 않는다');
    assert.doesNotMatch(css, /\.cr-\d+\.ink \{ font-weight/, '굵기 길(히트맵)을 쓰지 않는다');
    assert.match(svg, /aria-label="1\. 메일: 12/, '표식 설명은 그대로다');
  }
});

// ---- 선 차트 점 나타남 시각 ----

// 근거: HTML의 점 나타남 규칙(.dot[data-at])이 넓은 배치의 시각만 가져 좁은 배치의 점은 지연 0으로 선보다 먼저 나타났다.
test('html_motion_css_has_a_dot_rule_for_every_wide_and_narrow_data_at', async () => {
  const series = ['x "주차"', 'y "처리량(건)"', 'series ours "우리" role=main', 'series base "기준" role=compare', 'point x=1 ours=12 base=10', 'point x=2 ours=18 base=11', 'point x=3 ours=15 base=12', 'point x=4 ours=21 base=12'];
  const result = await buildFigure(`daphnis 2\n${chartSource('line', series, { title: '주차별 처리량' })}scene "비교" mode=once\n  reveal c.base\n  reveal c.ours\n`, { strict: true });
  const html = await toHtml(result, 'line');
  const narrow = html.slice(html.indexOf('<template class="fl-narrow">'));
  const wide = html.slice(0, html.indexOf('<template class="fl-narrow">'));
  const atsOf = (markup) => new Set([...markup.matchAll(/class="[^"]*\bdot\b[^"]*" data-at="([^"]+)"/g)].map(([, at]) => at));
  const [wideAts, narrowAts] = [atsOf(wide), atsOf(narrow)];
  assert.ok([...narrowAts].some((at) => !wideAts.has(at)), '좁은 배치에는 넓은 배치에 없는 시각이 있다');
  const ruled = new Set([...html.matchAll(/\.fl \.play \.dot\[data-at="([^"]+)"\] \{ animation-delay: (\d+)ms; \}/g)].map(([, at]) => at));
  for (const at of [...wideAts, ...narrowAts]) assert.ok(ruled.has(at), `data-at=${at}의 지연 규칙`);
  for (const [, at, delay] of html.matchAll(/\.fl \.play \.dot\[data-at="([^"]+)"\] \{ animation-delay: (\d+)ms; \}/g)) assert.equal(Number(delay), Math.round(Number(at) * result.timeline.growMs));
});

// ---- 진단 문구 ----

// 근거: 없는 참여자 오류의 선언 목록이 보기, 그룹, 값 이름까지 담았다.
test('unknown_participant_lists_only_declared_shapes', async () => {
  const head = 'daphnis 2\nbox client "C"\nbox worker "W"\nvalue counter "N" on=client\ngroup tier "T" {\n  worker\n}\nview flow graph {\n  client tier\n}\nview calls sequence {\n  client worker\n}\nscene "s" mode=once\n  client -> worker "work"\n';
  const message = (await errorsOf(`${head}  activate nobody\n`)).join('\n');
  assert.match(message, /unknown participant "nobody"/);
  const declared = message.match(/Declared: (.*)$/m)[1].split(', ');
  assert.deepEqual(declared, ['client', 'worker']);
});

// ---- 차트 light의 마지막 모습 ----

const BARS = ['x "대기(건)"', 'series a "A"', 'row "메일" a=12', 'row "리포트" a=7', 'row "이미지" a=20'];
const HEAT = ['cell "메일" "월" 1', 'cell "메일" "화" 2', 'cell "이미지" "월" 3', 'cell "이미지" "화" 4'];
const BAR_SCENES = [
  ['none', 'scene "none" mode=once\n  wait 300ms\n', []],
  ['subset', 'scene "subset" mode=once\n  light c "이미지"\n  wait 300ms\n', [0, 1]],
  ['all', 'scene "all" mode=loop\n  light c "메일"\n  light c "리포트"\n  light c "이미지"\n  wait 300ms\n', []],
  ['zero', 'scene "zero" mode=once\n  light c "메일"\n', [1, 2]],
  ['static', 'scene "static" mode=static\n  wait 300ms\n  light c "리포트"\n', [0, 2]],
];
const HEAT_SCENES = [
  ['none', 'scene "none" mode=once\n  wait 300ms\n', []],
  ['subset', 'scene "subset" mode=once\n  light c "이미지" "화"\n  wait 300ms\n', [3]],
  ['all', 'scene "all" mode=once\n  light c "메일" "월"\n  light c "메일" "화"\n  light c "이미지" "월"\n  light c "이미지" "화"\n  wait 300ms\n', []],
  ['zero', 'scene "zero" mode=once\n  light c "메일" "월"\n', [0]],
];

// 장면 하나의 정지 SVG(정지 시계)와 움직이는 SVG의 마지막 모습 층에서 규칙이 걸린 행 번호. root는 층의 선택자다.
const rowsWhere = (css, root, declaration, ink) => [...css.matchAll(new RegExp(`${escaped(root)} \\[data-chart="c"\\] \\.cr-(\\d+)${ink ? '\\.ink' : ''} \\{ ${escaped(declaration)} \\}`, 'g'))].map(([, k]) => Number(k));

// 근거: 정지 SVG와 움직임 줄이기의 마지막 모습 층이 모든 차트에서 `light`를 버렸다. 정지는 고른 장면의 완성된 상태다(playback.md). HTML 정지와 같은 흐림이 남고 움직임(`animation`)은 없다.
test('static_svg_and_still_layer_write_the_scene_final_bar_light_without_animation', async () => {
  const dim = `opacity: ${values.opacity.dim};`;
  const inkDim = `opacity: ${values.opacity['dim-ink']};`;
  for (const [name, steps, dimmed] of BAR_SCENES) {
    const result = await buildFigure(`daphnis 2\n${chartSource('bar', BARS)}${steps}`, { strict: true });
    const index = 0;
    const still = await toSvg(result, { scene: index, isStatic: true });
    assert.deepEqual(rowsWhere(styleOf(still), '.fl', dim), dimmed, `${name}: 정지 SVG의 면`);
    assert.deepEqual(rowsWhere(styleOf(still), '.fl', inkDim, true), dimmed, `${name}: 정지 SVG의 글자`);
    assert.doesNotMatch(still, /<animate|<set |animation: [^;]*\.?cr-|\.cr-\d+(\.ink)? \{ animation/, `${name}: 정지에는 움직임이 없다`);
    const animated = await toSvg(result, { scene: index });
    const root = result.timeline.steps[index].mode === 'static' || result.timeline.presentation[index] === 0 ? '.fl' : '.fl .fl-still';
    assert.deepEqual(rowsWhere(styleOf(animated), root, dim), dimmed, `${name}: 움직이는 SVG의 마지막 모습 층의 면`);
    assert.deepEqual(rowsWhere(styleOf(animated), root, inkDim, true), dimmed, `${name}: 마지막 모습 층의 글자`);
    if (root !== '.fl') assert.doesNotMatch(styleOf(animated).split('\n').filter((line) => line.startsWith('.fl .fl-still')).join('\n'), /animation/, `${name}: 마지막 모습 층에는 움직임이 없다`);
  }
});

// 근거: 히트맵은 흐리지 않고 밝힌 칸의 숫자만 굵게 한다. HTML은 밝힌 칸이 있고 밝히지 않은 칸도 있을 때만 굵다(모두 밝히면 구별할 칸이 없다). 움직이는 SVG의 "모두 밝힘"은 모든 칸이 굵었다.
test('heatmap_final_weight_marks_only_a_lit_cell_among_unlit_ones_on_every_svg_surface', async () => {
  const bold = 'font-weight: var(--weight-semibold);';
  for (const [name, steps, lit] of HEAT_SCENES) {
    const result = await buildFigure(`daphnis 2\n${chartSource('heatmap', HEAT)}${steps}`, { strict: true });
    const index = 0;
    const still = styleOf(await toSvg(result, { scene: index, isStatic: true }));
    assert.deepEqual(rowsWhere(still, '.fl', bold, true), lit, `${name}: 정지 SVG`);
    assert.doesNotMatch(still, /\.cr-\d+ \{ opacity/, `${name}: 히트맵은 칸 면을 흐리지 않는다`);
    const animated = styleOf(await toSvg(result, { scene: index }));
    const root = result.timeline.presentation[index] === 0 ? '.fl' : '.fl .fl-still';
    assert.deepEqual(rowsWhere(animated, root, bold, true), lit, `${name}: 마지막 모습 층`);
    // 칸을 박자마다 하나씩 밝히는 움직임은 밝힌 칸이 하나일 때 굵지만, 모두 밝힌 마지막 단계(100%)에서는 굵은 칸이 없다.
    if (name === 'all') for (const line of animated.split('\n').filter((row) => row.startsWith('@keyframes') && row.includes('weight-semibold'))) assert.match(line, /100% \{ font-weight: var\(--weight-regular\) \} \}$/, line);
  }
});

// ---- 장면 없는 문서의 선언한 값 ----

const DECLARED = 'daphnis 2\nbox a "A"\nbox b "B"\nqueue q "Q" slots=4 from=2\nvalue n "N" on=b from=5\nvalue len "L" on=b ref=q\nvalue hidden "H" from=9\na -> b\nb -> q\n';

// 근거: 장면이 없으면 값 줄이 만들어지지 않아 선언한 값 카드 줄(from=5)과 큐 찬 칸(from=2)이 어디에도 그려지지 않았다. 카드 크기도 값 줄을 예약하지 않았다.
test('scene_less_document_compiles_the_declared_values_without_a_scene_or_time', async () => {
  const result = await buildFigure(DECLARED, { strict: true });
  const { timeline } = result;
  assert.deepEqual([timeline.steps, timeline.segs, timeline.presentation, timeline.total], [[], [], [], 0], '장면도 시간도 만들지 않는다');
  assert.deepEqual(timeline.values.map((row) => [row.id, row.si, row.t0, row.t1, row.periods, row.changes, row.flashes, row.card !== undefined]), [
    ['q', undefined, 0, 0, [[0, 0, '2']], [], [], false],
    ['n', undefined, 0, 0, [[0, 0, '5']], [], [], true],
    ['len', undefined, 0, 0, [[0, 0, '2']], [], [], true],
    ['hidden', undefined, 0, 0, [[0, 0, '9']], [], [], false],
  ]);
  const [n, len] = timeline.values.filter((row) => row.card !== undefined);
  assert.equal(n.card, len.card, '두 값 줄은 한 카드 내용에 놓인다');
  const card = result.scene.items.find((item) => item.id === 'b').card;
  assert.deepEqual(card.layouts[n.card].rows.map((laid) => laid.row.valueId), ['n', 'len'], '카드 크기가 선언한 값 줄 자리를 갖는다');
  assert.ok(result.scene.items.find((item) => item.id === 'b').h > result.scene.items.find((item) => item.id === 'a').h, '값 줄을 예약한 카드는 이름만 있는 도형보다 크다');
});

// 근거: 위와 같다. 정지 SVG와 HTML 문서가 같은 시간표 값 줄로 선언한 처음 모습을 처음부터 보인다. 재생기는 장면이 없는 문서를 그리지 않는다.
test('scene_less_static_svg_and_html_markup_show_the_declared_values_from_the_start', async () => {
  const result = await buildFigure(DECLARED, { strict: true });
  const svg = await toSvg(result, { isStatic: true });
  const html = await toHtml(result, 'declared');
  for (const [name, markup] of [['정지 SVG', svg], ['HTML', html]]) {
    assert.match(markup, /class="value" opacity="1" data-v="\d+" data-t="5"/, `${name}: 값 5`);
    assert.match(markup, /class="value" opacity="1" data-v="\d+" data-t="2"/, `${name}: 참조 값 2`);
    assert.doesNotMatch(markup, /data-t="9"/, `${name}: on=이 없는 값은 어디에도 없다`);
    const fills = [...markup.matchAll(/<g class="queue-fill" opacity="1" data-v="\d+" data-t="2">((?:<rect [^>]*\/>)*)<\/g>/g)];
    // HTML은 넓은 배치와 좁은 배치가 큐를 한 벌씩 싣는다.
    assert.equal(fills.length, name === 'HTML' ? 2 : 1, `${name}: 보이는 찬 칸 묶음`);
    for (const [, rects] of fills) assert.equal(rects.split('<rect ').length - 1, 2, `${name}: 찬 칸 2`);
    assert.doesNotMatch(markup, /<g class="queue-fill">/, `${name}: 속성 없는 옛 묶음은 없다`);
  }
  assert.match(html, /<g id="n-\d+-c0" opacity="1" class="fl-layer/, 'HTML의 카드 내용 층은 처음부터 보인다');
  assert.match(html, /class="fl-card filled /, 'HTML의 카드 틀이 찬 카드다');
  assert.match(html, /"segs":\[\]/, '재생 구간이 없다');
  assert.doesNotMatch(svg, /<animate/, '꾸민 움직임이 없다');
});

// 장면이 있는 문서의 카드와 값 줄은 이 변경으로 바뀌지 않는다: 장면의 처음 카드가 선언한 값 줄 카드와 같은 번호를 쓴다.
test('declared_value_card_is_the_scene_start_card_so_documents_with_scenes_gain_no_new_card_content', async () => {
  const withScene = await buildFigure(`${DECLARED}scene "s" mode=once\n  a -> b time=300ms\n`, { strict: true });
  const card = withScene.scene.items.find((item) => item.id === 'b').card;
  assert.equal(card.layouts.length, 1, '값 줄만 있는 카드 내용 하나');
  assert.equal(withScene.timeline.values.every((row) => row.si === 0), true);
});

// ---- 한 키 SMIL ----

// 근거: 키가 하나뿐인 이산 애니메이션을 WebKit은 적용하지 않아, 장면 내내 바뀌지 않는 값 글자와 큐 찬 칸이 정적 값(안 보임)에 머물렀다.
test('discrete_smil_never_emits_a_single_key_animation', async () => {
  const clock = createClock(750, { displayMs: 1150, mode: 'once' });
  const held = discreteWindows(clock, [[0, 750]], { holdEnd: true });
  assert.match(held, /attributeName="visibility"[^>]*keyTimes="0;1" values="visible;visible"/);
  assert.match(held, /attributeName="opacity"[^>]*keyTimes="0;1" values="1;1"/);
  const ordinary = discreteWindows(clock, [[0, 300]], { holdEnd: true });
  assert.match(ordinary, /keyTimes="0;[\d.]+" values="visible;hidden"/, '끝이 있는 구간은 그대로다');

  for (const source of [`${DECLARED}scene "plus" mode=once\n  a -> b set="n+2"\nscene "net" mode=once\n  a -> b set="n+1, n-1"\nscene "loop" mode=loop\n  b -> q set="n=7, q+1"\n`]) {
    const result = await buildFigure(source, { strict: true });
    for (let si = 0; si < result.timeline.steps.length; si++) {
      const svg = await toSvg(result, { scene: si });
      const keys = [...svg.matchAll(/<animate [^>]*calcMode="discrete" keyTimes="([^"]*)"/g)].map(([, times]) => times);
      assert.ok(keys.length > 0);
      assert.deepEqual(keys.filter((times) => !times.includes(';')), [], `장면 ${si}: 키 하나짜리 애니메이션이 없다`);
    }
  }
});

// 근거: 큐 2칸이 1칸이 되는 장면에서 앞 글("2")은 논리 끝(750)에서 꺼지고 마지막 글("1")만 끝까지 남는다. Chrome에서 앞 글이 한 바퀴 끝까지 켜진 채 남아 두 칸이 보였다.
test('only_the_last_text_of_a_value_row_is_held_to_the_end_of_the_cycle', async () => {
  const source = 'daphnis 2\nbox b "B"\nqueue q "Q" slots=4 from=2\nb -> q\nscene "take" mode=once\n  q -> b set="q-1"\n';
  const svg = await toSvg(await buildFigure(source, { strict: true }), { scene: 0 });
  const group = (text) => svg.match(new RegExp(`<g class="queue-fill"[^>]*data-t="${text}">[\\s\\S]*?</g>`))[0];
  const visibility = (text) => group(text).match(/attributeName="visibility"[^>]*values="([^"]*)"/)[1].split(';');
  assert.equal(visibility('2').at(-1), 'hidden', '앞 글은 끝에서 꺼진다');
  assert.equal(visibility('1').at(-1), 'visible', '마지막 글은 끝까지 남는다');
});

// ---- 상태에 CSS 전환이 없다 ----

// 근거: 시각마다 재생기가 정한 상태(차트 행·계열, 선, 윤곽, 카드 내용 층, 바뀐 값 면)에 CSS 전환이 걸려 같은 장면 같은 시각의 모습이 실제 시간과 앞 기록에 따랐다. 사용자가 조작하는 도구 막대의 서서히 나타남만 남는다.
test('player_and_chart_styles_keep_a_css_transition_only_on_the_user_driven_toolbar', () => {
  const rules = [STYLES.player, STYLES.figure, STYLES.chart, STYLES.control].flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*\btransition\s*:[^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim().split('\n').at(-1).trim(), body })));
  const active = rules.filter(({ body }) => !/transition:\s*none/.test(body));
  assert.deepEqual(active.map(({ selector }) => selector), ['.fl-view-tools'], active.map(({ selector, body }) => `${selector}: ${body.trim()}`).join('\n'));
  assert.doesNotMatch(STYLES.chart, /\.fl:has\(\.chart-cell\.dim\)/, '히트맵 굵게는 판 전체가 아니라 자기 차트 카드로 좁힌다');
  assert.match(STYLES.chart, /\.fl \[data-chart\]:has\(\.chart-cell\.dim\) \.chart-cell\.ink:not\(\.dim\)/);
});
