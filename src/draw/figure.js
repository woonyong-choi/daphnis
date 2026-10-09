// 구조, 상태, 데이터 관계, 순서 그림의 장면을 SVG 조각으로 그린다. 크기와 자리는 배치가 정한 그대로 쓴다.
import { BADGE_STYLE, bodyOf } from '../measure/decor.js';
import { CARD, STYLE, groupHead, hasPill, sizePill } from '../measure/sizes.js';
import { routePolyline } from '../route.js';
import { walkUp } from '../source/ancestry.js';
import { tableDescription } from '../table.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { cardGlyphs, createTones, drawCard } from './card.js';
import { edgeMarker } from './arrow.js';
import { drawDecor, drawGroupTab } from './decor.js';
import { paintOf, tintOf } from './paint.js';
import { sceneTag } from './scene-tag.js';
import { drawSequenceFragments } from './sequence-fragments.js';
import { drawSequenceLife } from './sequence-life.js';
import { LINE_DASH, drawShape } from './shape.js';
import { drawPlot, drawTime } from './time.js';

const SPACE = values.space;
const SIZE = values.size;
const RADIUS = values.radius;
const INNER_Y = SPACE['6'];
// 그룹 면은 깊이에 따라 color.group-1과 group-2를 번갈아 쓴다.
const NESTED_STEPS = 2;
// 이름을 도형 안에서 따로 그리는 도형(테이블 머리, 격자 제목)
const HAS_OWN_LABELS = new Set(['table', 'api', 'grid', 'classifier', 'chart']);

// cost: time O(s·k·r·n + e·p), heap O(out), stack O(1)
// vars: s = 도형 수, k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, e = 선 수, p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장면을 그린다. `scene.flashes`가 있으면(draw/values.js의 drawFlashes) 값이 바뀔 때 켜지는 배경 면을 도형 면과 카드 층 안, 글자 아래에 놓는다. `scene.borders`가 있으면((도형 번호, 도형 글) => 겹침 윤곽 글, 움직이는 SVG의 animate/animator.js) 점이 닿을 때 깜빡이는 테두리 후광을 도형 윤곽 바로 위에 놓는다. body의 순서는 그룹, 생명선, 도형, 선, 메모다. 선 라벨 알약(pills)은 따로 돌려준다. 점과 글 상자가 알약 위로 지나면 알약 글자의 대비가 깨지므로, 호출하는 쪽이 점 층 뒤에 둔다(docs/design/playback.md 점 층).
 * @param decorate (kind, index, extra) => class. 움직이는 SVG가 박자별 class를 넣는다. kind: node, edge, pill, pilltext, quiet, card, layer, part
 * @param glyphs 쓴 글자를 모으는 그릇(createGlyphSet)
 * @returns { body, pills }. pills는 알약이 있는 선마다 `l-번호` 묶음을 담은 `<g class="fl-pills">`이고 알약이 없으면 빈 글이다
 */
export function drawScene(scene, decorate, glyphs) {
  const paint = { toneOf: createTones(scene.tagOrder), decorate, glyphs, scene, flashes: scene.flashes ?? { shape: new Map(), card: new Map() }, borders: scene.borders };
  const parts = [];
  scene.groups.forEach((g, j) => parts.push(drawGroup(g, j, paint)));
  for (const line of scene.lifelines ?? []) parts.push(`<line x1="${r(line.x)}" x2="${r(line.x)}" y1="${r(line.y1)}" y2="${r(line.y2)}" class="lifeline${sceneTag(line, scene.shownSi).off}"${sceneTag(line, scene.shownSi).attr}/>`);
  parts.push(drawSequenceFragments(scene, glyphs));
  if (scene.activations?.length || scene.destructions?.length) parts.push(drawSequenceLife(scene));
  scene.items.forEach((it, i) => parts.push(drawItem(it, i, paint)));
  scene.edges.forEach((e, j) => parts.push(drawEdge(e, j, paint)));
  for (const note of scene.notes ?? []) parts.push(drawNote(note, glyphs, scene.shownSi));
  for (const plot of scene.plots ?? []) parts.push(drawPlot(plot, glyphs));
  for (const time of scene.times ?? []) parts.push(drawTime(time, paint));
  for (const panel of scene.panels ?? []) if (panel.label) parts.push(drawPanelLabel(panel, glyphs));
  const pills = scene.edges.flatMap((e, j) => drawPill(e, j, paint) ?? []);
  return { body: parts.join('\n'), pills: pills.length ? `<g class="fl-pills">${pills.join('')}</g>` : '' };
}

// 그리는 데 함께 쓰는 것: toneOf(카드 태그 색), decorate(움직이는 SVG의 class), glyphs(쓴 글자 모음), scene(후광이 바깥 바탕을 찾는 데 쓴다)
function drawGroup(g, j, { decorate, glyphs, scene }) {
  glyphs.add(g.label, 'semibold');
  const head = groupHead(g);
  const left = g.x + g.titleDx;
  const decor = head.decor ? drawDecor(head.decor, { x: left, y: g.y + (SIZE.group.title - head.decor.h) / 2, iconData: g.iconData }, glyphs) : '';
  const paint = paintOf(g);
  const tint = tintOf(g, scene);
  const colors = `${paint ? ` ps-${paint}` : ''}${tint ? ` tint-${tint.name}-${tint.level}` : ''}`;
  // 중첩 면은 두 단계를 번갈아 쓴다. 깊어질수록 짙어져 카드와 아이콘보다 넓은 면이 앞서지 않게 한다.
  const depth = depthOf(g, scene) % NESTED_STEPS;
  const deep = depth ? ` d${depth + 1}` : '';
  const dashed = g.border === 'dashed';
  return (
    `<g id="g-${j}" class="fl-group${g.iconData ? ' tabbed' : ''}" data-id="${escapeXml(g.id)}"><rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.w)}" height="${r(g.h)}" rx="${RADIUS['2xl']}" class="frame-box fl-stroke${deep}${dashed ? ' dashed' : ''}${colors} ${decorate('group', j)}"${dashed ? ` stroke-dasharray="${LINE_DASH}"` : ''}/>` +
    `${g.iconData ? drawGroupTab(g) : ''}<text x="${r(left + head.textDx)}" y="${r(centerBaseline(g.y + SIZE.group.title / 2, STYLE.group.size))}" class="frame${paint ? ` gt-${paint}` : ''}">${renderRich(g.label)}</text>${decor}</g>`
  );
}

// cost: time O(k·r·n), heap O(out), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 도형 하나: 윤곽, 이름, 부제, 카드. 사람과 원통의 머리, 어깨, 뚜껑은 배치 사각형 바깥 여백에 그린다.
function drawItem(it, i, paint) {
  const { decorate, glyphs, scene } = paint;
  const stroke = `class="fl-stroke${paintOf(it) ? ` ps-${paintOf(it)}` : ''}${it.shape === 'external' ? ' ext' : ''} ${decorate('node', i)}"`;
  const description = describeNode(it);
  const open = `<g id="n-${i}" class="fl-node fl-shape-${escapeXml(it.shape)}" tabindex="0" role="img" aria-label="${escapeXml(description)}" data-id="${escapeXml(it.id)}">`;
  for (const l of it.labelLines ?? []) glyphs.add(l, STYLE.label.face);
  for (const l of it.subLines ?? []) glyphs.add(l, STYLE.sub.face);
  if (it.card) cardGlyphs(it.card.layouts, glyphs);
  const shape = drawShape(it.stroke && !it.fill ? { ...it, fill: it.stroke } : it, stroke, { ...paint, index: i });
  const decor = it.decor ? drawDecor(it.decor, { x: it.x + it.decor.x, y: it.y + it.decor.y, iconData: it.iconData }, glyphs) : '';
  const card = it.card ? drawCard(it.card, { box: cardBox(it), i, shown: scene.shownCards?.[it.id] }, paint) : '';
  // 이름 묶음(아이콘, 이름, 부제)은 카드가 비어 있어도 같은 자리에 있다. 카드 자리는 가장 큰 내용에 맞춰 늘 예약된다.
  const head = `${decor}${HAS_OWN_LABELS.has(it.shape) ? '' : drawLabels(it)}`;
  return `${open}${shape}${paint.flashes.shape.get(i) ?? ''}${paint.borders?.(i, shape) ?? ''}${head}${card}</g>`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 노드의 표시 글자 수
// basis: estimate
function describeNode(it) {
  if (it.headerOnly) return it.label;
  if (it.shape === 'table' || it.shape === 'api') return tableDescription(it);
  if (it.shape === 'chart') return it.label;
  if (it.shape === 'classifier') return it.classifierRows.map((row) => row.text).join('; ');
  return it.label;
}

// cost: time O(g²), heap O(g), stack O(1)
// vars: g = 그룹 수
// basis: estimate
// 그룹이 안긴 깊이. 바깥 그룹이 0이고 안으로 들어갈수록 1씩 늘며, 면은 깊이 0(group-1), 1(group-2), 2 이상(group-3) 셋 중 하나다.
function depthOf(group, scene) {
  const parentOf = (g) => scene.groups.find((up) => up.id === g.parent);
  return walkUp(parentOf(group), parentOf, scene.groups.length).length;
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 이름과 부제 줄 수, out = 만든 SVG 글자 수
// basis: estimate
// 이름과 부제. 카드가 있으면 위에 붙이고, 없으면 세로 가운데. 사람은 몸통 아래에 쓴다.
function drawLabels(it) {
  return labelRows(it)
    .map(({ cls, text, cx, baseline }) => `<text x="${r(cx)}" y="${r(baseline)}" class="${cls}">${renderRich(text)}</text>`)
    .join('');
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 이름과 부제 줄 수
// basis: estimate
/**
 * 도형의 이름과 부제 줄 자리. 그리는 쪽과 글 상자 자리 계산(draw/boxes.js)이 같은 값을 쓴다.
 * @returns { cls, text, style, cx, center, baseline }[]. center는 줄의 세로 가운데, baseline은 글자 기준선이다
 */
export function labelRows(it) {
  const body = bodyOf(it);
  const cx = it.decor?.inline ? it.x + it.decor.textCx : body.x + body.w / 2;
  const lines = [...(it.labelLines ?? []).map((l) => ['label', l, STYLE.label]), ...(it.subLines ?? []).map((l) => ['sub', l, STYLE.sub])];
  if (!lines.length) return [];
  const textH = lines.reduce((sum, [, , s]) => sum + s.line, 0);
  let top;
  if (it.shape === 'queue') top = it.y + INNER_Y;
  else if (it.decor) top = it.y + INNER_Y + it.decor.room;
  else if (it.card) top = it.y + INNER_Y;
  else top = it.y + (body.h - textH) / 2;
  return lines.map(([cls, text, style]) => {
    const center = top + style.line / 2;
    top += style.line;
    return { cls, text, style, cx, center, baseline: centerBaseline(center, style.size) };
  });
}

/** 카드 자리. 사람은 이름표 아래, 테이블은 열 아래, 나머지는 도형 아래쪽 안이다. */
export function cardBox(it) {
  const { w, h } = it.card;
  if (it.shape === 'table' || it.shape === 'api') return { x: it.x + CARD.margin, y: it.y + it.tableHeight + CARD.margin, w, h };
  const body = bodyOf(it);
  return { x: it.x + CARD.margin, y: body.y + body.h - CARD.margin - h, w, h };
}

// cost: time O(p), heap O(out), stack O(1)
// vars: p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 하나. 알약 라벨은 drawPill이 따로 그린다.
function drawEdge(e, j, { decorate, glyphs, scene }) {
  const tag = sceneTag(e, scene.shownSi);
  const { d } = routePolyline(e.points, RADIUS.route);
  const dash = e.dashed ? ` stroke-dasharray="${LINE_DASH}"` : '';
  const marker = edgeMarker(e, j);
  const path = `<path id="p-${j}" d="${d}" class="fl-path"${dash}${marker.attributes}/>`;
  const from = e.fromMultiplicity === undefined ? e.from : `${e.from} [${e.fromMultiplicity}]`;
  const to = e.toMultiplicity === undefined ? e.to : `${e.to} [${e.toMultiplicity}]`;
  const description = e.relation ? ` role="img" aria-label="${escapeXml(`${from} ${e.relation} ${to}${e.label ? `: ${e.label}` : ''}`)}"` : '';
  const ends = (e.endpointLabels ?? []).map((label) => {
    glyphs.add(label.text, STYLE.pill.face);
    return `<text class="edgelabel fl-multiplicity ${decorate('pilltext', j)}" data-end="${label.end}" x="${r(label.x)}" y="${r(centerBaseline(label.y, STYLE.pill.size))}">${escapeXml(label.text)}</text>`;
  });
  return `<g id="e-${j}" class="${edgeClass(e, j, decorate)} ${decorate('edge', j)}${tag.off}"${tag.attr}${description}>${marker.defs}${path}${ends.join('')}</g>`;
}

// 선과 알약 묶음이 함께 쓰는 class. 알약 묶음도 선과 같이 켜지고 조용해진다.
function edgeClass(e, j, decorate) {
  return `fl-edge${e.isMark ? ' mark' : ''}${e.quiet ? ` quiet ${decorate('quiet', j)}` : ''}`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 라벨 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 선의 알약 라벨 묶음. 라벨 자리는 배치가 정했다. 없으면 undefined다.
function drawPill(e, j, { decorate, glyphs, scene }) {
  if (!hasPill(e) || !e.labelAt) return undefined;
  const tag = sceneTag(e, scene.shownSi);
  const { w, h, numW, textW } = sizePill(e.label, e.no);
  const { x, y } = e.labelAt;
  const frame = e.label === undefined ? '' : `<rect x="${r(x - w / 2)}" y="${r(y - h / 2)}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}" class="pill ${decorate('pill', j)}"/>`;
  const number = e.no === undefined ? '' : drawNumber(e.no, { x: x - w / 2 + SPACE['1'], y, numW }, glyphs);
  const text = e.label === undefined ? '' : drawPillText(e.label, { x: e.no === undefined ? x : x - w / 2 + SPACE['1'] + numW + SPACE['2'] + textW / 2, y, cls: decorate('pilltext', j) }, glyphs);
  return `<g id="l-${j}" class="${edgeClass(e, j, decorate)}${tag.off}"${tag.attr}><g class="fl-pill">${frame}${number}${text}</g></g>`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 라벨 글. 번호 원이 왼쪽에 붙으면 글 가운데가 그만큼 오른쪽이다.
function drawPillText(label, { x, y, cls }, glyphs) {
  glyphs.add(label, STYLE.pill.face);
  return `<text x="${r(x)}" y="${r(centerBaseline(y, STYLE.pill.size))}" class="edgelabel ${cls}">${renderRich(label)}</text>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 선 번호 원. 정지 그림과 문서에서도 순서가 읽히도록 선언한 번호를 그대로 쓴다(재생 단계 번호와 독립이다). left는 원 왼쪽 끝, y는 세로 가운데다.
function drawNumber(no, { x: left, y, numW }, glyphs) {
  glyphs.add(String(no), BADGE_STYLE.face);
  const h = numW;
  return (
    `<rect x="${r(left)}" y="${r(y - h / 2)}" width="${r(numW)}" height="${r(h)}" rx="${r(h / 2)}" class="number-pill"/>` +
    `<text x="${r(left + numW / 2)}" y="${r(centerBaseline(y, BADGE_STYLE.size))}" class="number">${no}</text>`
  );
}

// 보기 이름. 판 위 제목 줄에 그룹 제목과 같은 글로 쓴다.
function drawPanelLabel(panel, glyphs) {
  glyphs.add(panel.label, 'semibold');
  return `<text x="${r(panel.labelAt.x)}" y="${r(centerBaseline(panel.labelAt.y, STYLE.group.size))}" class="frame" data-view="${escapeXml(panel.view)}">${renderRich(panel.label)}</text>`;
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 메모 줄 수, out = 만든 SVG 글자 수
// basis: estimate
function drawNote(note, glyphs, shownSi) {
  glyphs.add(note.text, 'regular');
  const tag = sceneTag(note, shownSi);
  const lines = note.lines.map((l, k) => `<text x="${r(note.x + SPACE['5'])}" y="${r(centerBaseline(note.y + SPACE['5'] + (k + 0.5) * STYLE.meta.line, STYLE.meta.size))}" class="meta">${renderRich(l)}</text>`);
  return `<g class="fl-note${tag.off}"${tag.attr}><rect x="${r(note.x)}" y="${r(note.y)}" width="${r(note.w)}" height="${r(note.h)}" rx="${RADIUS.md}" class="note-box"/>${lines.join('')}</g>`;
}
