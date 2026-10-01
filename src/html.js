// 재생 화면 HTML 한 장과 목록 쪽. 스크립트, 스타일, 글꼴, 그림을 모두 안에 넣어 파일 하나로 열린다.
import { readFileSync } from 'node:fs';
import { fitCanvas } from './canvas.js';
import { CHART_FACES, chartText } from './chart/draw.js';
import { drawScene } from './draw/figure.js';
import { curveOf } from './easing.js';
import { createGlyphSet, embedFonts } from './measure/fonts.js';
import { DEFS, STYLES } from './styles.js';
import { escapeXml, plainText, renderRichHtml, roundCoord as r } from './text.js';
import { chartMotionCss } from './chart/motion.js';
import { chartSeriesIds, litIds } from './timeline.js';
import { tokens, values } from './tokens.js';

const PLAYER = readFileSync(new URL('./player.js', import.meta.url), 'utf8');
const VIEWER = readFileSync(new URL('./viewer.js', import.meta.url), 'utf8');
// iframe 안에서 열리면 틀을 빼고, 목록 쪽이 iframe 높이를 맞추도록 본문 높이를 알린다. 문서(html) 높이는 iframe 창보다 작아지지 않아 쓰지 않는다.
// 목록 쪽의 라이트·다크 선택은 iframe의 prefers-color-scheme에 안정적으로 전해지지 않아, 목록 쪽이 보내는 테마 메시지로 이 문서의 data-theme을 바꾼다. 처음에는 목록 쪽에 현재 테마를 물어본다.
const EMBED_SCRIPT = `<script>if (window.self !== window.top) {
  document.documentElement.classList.add('embedded');
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || !('theme' in e.data)) return;
    const root = document.documentElement;
    if (e.data.theme === 'light' || e.data.theme === 'dark') {
      root.setAttribute('data-theme', e.data.theme);
      root.style.colorScheme = e.data.theme;
    } else {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    }
  });
  parent.postMessage({ themeRequest: true }, '*');
  addEventListener('load', () => new ResizeObserver(() => parent.postMessage({ figureHeight: Math.ceil(document.body.getBoundingClientRect().height) }, '*')).observe(document.body));
}</script>`;
// 전체 화면 단추와, 전체 화면에서만 보이는 확대·축소 단추. 아이콘은 viewer.js가 그린다.
const VIEW_BUTTONS =
  '<button type="button" class="fl-round fl-full"></button>' +
  '<div class="fl-zoom"><button type="button" class="fl-round" data-zoom="in" aria-label="확대"></button><button type="button" class="fl-round" data-zoom="out" aria-label="축소"></button><button type="button" class="fl-round" data-zoom="fit" aria-label="전체 보기"></button></div>';
// 목록 쪽 테마 전환. 시스템은 OS 설정을 따르고, 라이트와 다크는 목록 쪽 루트에 color-scheme을 걸어 iframe 안 그림의 prefers-color-scheme도 같은 값이 되게 한다.
// 목록 쪽 자체 색은 토큰 CSS의 data-theme 값으로 바꾼다. 고른 값은 localStorage에 기억하고, 첫 그림이 그려지기 전에 적용해 깜빡임을 막는다.
const THEME_MODES = [
  ['system', '시스템'],
  ['light', '라이트'],
  ['dark', '다크'],
];
const THEME_BUTTONS = THEME_MODES.map(([mode, label]) => `<button type="button" data-mode="${mode}" aria-pressed="false">${label}</button>`).join('');
const THEME_SCRIPT = `
const THEME_KEY = 'mutoscope-theme';
// cost: time O(1), heap O(1), stack O(1)
// vars: 단추 3개
// basis: estimate
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
    root.style.colorScheme = mode;
  } else {
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light dark';
  }
  for (const frame of document.querySelectorAll('iframe')) frame.contentWindow?.postMessage({ theme: mode }, '*');
  for (const button of document.querySelectorAll('.theme button')) button.setAttribute('aria-pressed', String(button.dataset.mode === (mode === 'light' || mode === 'dark' ? mode : 'system')));
}
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}
applyTheme(savedTheme());
addEventListener('DOMContentLoaded', () => {
  applyTheme(savedTheme());
  document.querySelector('.theme').addEventListener('click', (e) => {
    const mode = e.target.dataset?.mode;
    if (!mode) return;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {}
    applyTheme(mode);
  });
});`;
// 재생기가 점과 글 상자, 아이콘을 그릴 때 쓰는 값. 브라우저 코드는 tokens.js를 불러올 수 없어 데이터로 넘긴다.
const PLAYER_METRICS = Object.freeze({
  accent: tokens.color.accent,
  chipFill: tokens.color['accent-fill'],
  halo: values.size.halo,
  haloOpacity: values.opacity.halo,
  packet: values.size.packet,
  chipRadius: values.radius.lg,
  chipLine: values.size.line['15'],
  chipPadX: values.space['9'],
  chipPadY: values.space['4'],
  chipGap: values.space['6'],
  icon: values.size.icon,
  iconStroke: values.border.edge,
  pauseStroke: values.border.strong,
  zoomMax: values.scale['zoom-max'],
  zoomStep: values.scale['zoom-step'],
  move: curveOf('move'),
});

// cost: time O(s + e + b·(e + k) + out), heap O(out), stack O(1), io 1
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수, out = 만든 HTML 글자 수
// basis: estimate
/** 재생기 HTML 문서. 그림, 시간표, 재생 스크립트를 모두 안에 넣는다. */
export async function toHtml(result, name) {
  const { figure, timeline } = result;
  const glyphs = createGlyphSet();
  const content = result.chart ? chartContent(result, glyphs) : figureContent(result, glyphs);
  for (const label of timeline.steps) glyphs.add(label, 'regular');
  for (const seg of timeline.segs) {
    glyphs.add(seg.caption, 'regular');
    for (const hop of seg.hops) for (const line of hop.data ?? []) glyphs.add(line, 'regular');
  }
  const fonts = await embedFonts(glyphs.used);
  const { height } = content;
  // 표시 폭은 SVG 파일과 같은 표준 캔버스 폭이다. 좁은 내용은 viewBox를 왼쪽으로 넓혀 가운데에 두고, 넓은 내용은 viewBox 그대로 표시 폭만 줄인다.
  const { viewWidth, shownWidth, shownHeight } = fitCanvas(content.width, height);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="fl" width="${r(shownWidth)}" height="${r(shownHeight)}" style="aspect-ratio: ${r(viewWidth)} / ${r(height)}" viewBox="${r((content.width - viewWidth) / 2)} 0 ${r(viewWidth)} ${r(height)}" role="img">` +
    `<title>${escapeXml(plainText(figure.title ?? name))}</title><defs>${DEFS}</defs>${content.svg}<g class="fl-packets"></g></svg>`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(plainText(figure.title ?? name))}</title>
${EMBED_SCRIPT}
<style>${fonts}
${STYLES.tokens}${STYLES.player}${STYLES.figure}${STYLES.chart}${result.chart ? chartMotionCss(timeline.growMs, result.chart.dotAts) : ''}</style>
</head>
<body>
<figure class="fl-figure${result.chart ? ' fl-chart-page' : ''}" tabindex="0">
${VIEW_BUTTONS}
<div class="fl-canvas">${svg}</div>
<figcaption class="fl-foot">
<div class="fl-bar"><button type="button" class="fl-round fl-pause"></button><div class="fl-tabs" role="tablist"></div><button type="button" class="fl-round fl-rate" aria-label="배속">1×</button></div>
<p class="fl-caption" aria-live="polite"></p>
</figcaption>
</figure>
<script>
${VIEWER}
${PLAYER}
figurePlay(document.querySelector('.fl-figure'), ${JSON.stringify(content.data).replace(/</g, '\\u003c')});
</script>
</body>
</html>
`;
}

// cost: time O(s + e + b·(e + k)), heap O(b·(e + k)), stack O(1)
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수
// basis: estimate
// 구조, 상태, 데이터, 순서 그림. 시간표의 id를 도형, 그룹 번호로 바꿔 넘긴다.
function figureContent(result, glyphs) {
  const { scene, timeline } = result;
  const itemIndex = new Map(scene.items.map((it, i) => [it.id, i]));
  const groupIndex = new Map(scene.groups.map((g, i) => [g.id, i]));
  const toIndex = (map, obj) => Object.fromEntries(Object.entries(obj).map(([id, v]) => [map.get(id), v]));
  const segs = timeline.segs.map((seg) => {
    const lit = litIds(seg, scene.edges);
    return {
      si: seg.si,
      t0: seg.t0,
      t1: seg.t1,
      hops: seg.hops,
      edgesOn: seg.edgesOn,
      nodesOn: [...lit].filter((id) => itemIndex.has(id)).map((id) => itemIndex.get(id)),
      groupsOn: [...lit].filter((id) => groupIndex.has(id)).map((id) => groupIndex.get(id)),
      columnsOn: seg.columnsOn,
      cards: toIndex(itemIndex, seg.cards),
      cardsBefore: toIndex(itemIndex, seg.cardsBefore),
      cardsAt: toIndex(itemIndex, seg.cardsAt),
      caption: seg.caption,
      series: [],
      growing: [],
      lights: [],
    };
  });
  const data = {
    segs,
    steps: timeline.steps,
    cardCounts: scene.items.map((it) => it.card?.layouts.length ?? 0),
    edgeEnds: scene.edges.map((e) => [itemIndex.get(e.from.split('.')[0]) ?? -1, itemIndex.get(e.to.split('.')[0]) ?? -1]),
    seriesCount: 0,
    rowCount: 0,
    metrics: PLAYER_METRICS,
  };
  return { svg: drawScene(scene, () => '', glyphs), width: scene.width, height: scene.height, data };
}

// cost: time O(b·(s + l) + c), heap O(b·(s + l)), stack O(1)
// vars: b = 박자 수, s = 계열 수, l = 밝히기 수, c = 차트 글자 수
// basis: estimate
// 차트. 계열은 번호로, light는 행 번호로 바꿔 넘긴다.
function chartContent(result, glyphs) {
  const { figure, chart, timeline } = result;
  for (const face of CHART_FACES) glyphs.add(chartText(figure), face);
  const ids = chartSeriesIds(figure);
  const segs = timeline.segs.map((seg) => ({
    si: seg.si,
    t0: seg.t0,
    t1: seg.t1,
    hops: [],
    edgesOn: [],
    nodesOn: [],
    groupsOn: [],
    columnsOn: [],
    cards: {},
    cardsBefore: {},
    cardsAt: {},
    caption: seg.caption,
    labelShifts: seg.labelShifts,
    series: seg.series.map((id) => ids.indexOf(id)),
    growing: seg.growing.map((id) => ids.indexOf(id)),
    lights: seg.lights.map((key) => chart.rowKeys.indexOf(key)),
  }));
  const data = { segs, steps: timeline.steps, cardCounts: [], edgeEnds: [], seriesCount: ids.length, rowCount: chart.rowKeys.length, metrics: PLAYER_METRICS };
  // 재생기 안에서는 그림 바탕 사각형을 그리지 않는다. 카드가 유일한 틀이고, 회색 판은 문서에 넣는 SVG 파일에만 있다.
  return { svg: chart.body, width: chart.width, height: chart.height, data };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 이름과 제목 글자 수
// basis: estimate
// 한글 제목이 제목이고 예제 이름은 작은 꼬리표다. 제목이 없으면 이름이 제목이 된다.
function cardHead({ name, title }) {
  if (!title) return `<h2>${escapeXml(name)}</h2>`;
  return `<h2>${renderRichHtml(title)}<span class="name">${escapeXml(name)}</span></h2>`;
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 여러 그림을 한 쪽에서 보는 목록. 그림마다 재생 화면을 iframe으로 넣는다.
 * @param figures { name, title, href }[]. href는 목록 쪽에서 본 확장자 뺀 상대 경로다.
 */
export function toGallery(figures, heading) {
  const cards = figures
    .map(
      (f) =>
        `<section><header>${cardHead(f)}<nav><a href="${escapeXml(f.href)}.html">열기</a><a href="${escapeXml(f.href)}.svg">SVG</a></nav></header>` +
        `<iframe src="${escapeXml(f.href)}.html" loading="lazy" allowfullscreen title="${escapeXml(f.name)}"></iframe></section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)}</title>
<style>${STYLES.tokens}${STYLES.gallery}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="top">
<h1>${escapeXml(heading)}</h1>
<p>그림 ${figures.length}개 · <a href="document.html">문서 안 모습 보기</a></p>
<div class="theme" role="group" aria-label="테마">${THEME_BUTTONS}</div>
</div>
<main>
${cards}
</main>
<script>
// 그림 쪽이 알려 준 본문 높이로 iframe 높이를 맞추고(그림 아래 빈 공간을 없애기 위해서다), 새로 뜬 그림에는 현재 테마를 보낸다.
addEventListener('message', (e) => {
  const frame = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source);
  if (!frame) return;
  if (e.data?.figureHeight) frame.style.height = e.data.figureHeight + 'px';
  if (e.data?.themeRequest) frame.contentWindow.postMessage({ theme: savedTheme() }, '*');
});
</script>
</body>
</html>
`;
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 문서(README) 안 모습 미리보기. 그림마다 움직이는 SVG를 img로 넣는다(GitHub README와 같은 방식).
 * @param figures { name, title, href }[]. href는 이 쪽에서 본 확장자 뺀 상대 경로다.
 */
export function toDocument(figures, heading) {
  const sections = figures
    .map((f) => `${cardHead(f)}\n<p class="figure"><img src="${escapeXml(f.href)}.svg" alt="${escapeXml(plainText(f.title || f.name))}"></p>`)
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)} 문서 미리보기</title>
<style>${STYLES.tokens}${STYLES.document}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="bar">
<a href="index.html">목록으로</a>
<div class="theme" role="group" aria-label="테마">${THEME_BUTTONS}</div>
</div>
<article>
<h1>${escapeXml(heading)}</h1>
<p>문서에 넣은 모습 그대로 보는 미리보기다. 그림은 움직이는 SVG 파일을 img로 넣은 것이라 회색 판이 흰 문서 위에서 그림 경계를 만든다.</p>
${sections}
</article>
</body>
</html>
`;
}
