// 도형 하나의 윤곽을 그린다. 상자(사람 포함), 원통, 갈림길, 원, 상태 점, 테이블, API, 차트 카드, 격자. 이름과 카드는 draw/figure.js가 그린다.
import { CHART_FACES } from '../chart/draw.js';
import { STACK_STEP, bodyOf } from '../measure/decor.js';
import { queueSlots } from '../measure/queue.js';
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { columnKey } from '../table.js';
import { tokens, values } from '../tokens.js';
import { drawGrid } from './grid.js';
import { drawHeaderRow, schemaHeader } from './schema.js';
import { drawClassifier } from './class.js';
import { fillOf } from './paint.js';

const SPACE = values.space;
const SIZE = values.size;
const RADIUS = values.radius;
/** 선, 바깥 도형 테두리, 점선 경계 그룹이 함께 쓰는 점선(stroke-dasharray) */
export const LINE_DASH = `${values.dash.line} ${values.dash.gap}`;

// 윤곽 모양. 채우기와 선은 부르는 쪽이 정한다.
const geometry = {
  store: (it) => [`<path d="M${r(it.x)} ${r(it.y)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(it.w)} 0 v ${r(it.h)} a ${r(it.w / 2)} ${it.marginTop} 0 0 1 ${r(-it.w)} 0 z"`],
  circle: (it) => [`<circle cx="${r(it.x + it.w / 2)}" cy="${r(it.y + it.h / 2)}" r="${r(it.w / 2)}"`],
  queue: (it) => [`<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${values.simple2['node-corner']}"`],
  rect: (it) => {
    const { x, y, w, h } = bodyOf(it);
    return [`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${values.simple2['node-corner']}"`];
  },
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 도형 윤곽 조각(닫지 않은 글). 후광이 같은 윤곽을 다시 그린다. 상자, 외부 도형, 타일은 앞 상자(몸통)다. */
export function outlineOf(it) {
  return (geometry[it.shape] ?? geometry.rect)(it);
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 테이블 열 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawShape(it, stroke, paint) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  const fill = `fill="${it.fill ? fillOf(it.fill) : tokens.color.node}"`;
  if (it.headerOnly) return drawHeaderCard(it, stroke, paint);
  switch (it.shape) {
    case 'classifier':
      return drawClassifier(it, stroke, paint);
    case 'store':
      return `${geometry.store(it)[0]} ${fill} ${stroke}/><path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${it.marginTop} 0 0 0 ${r(w)} 0" fill="none" ${stroke}/>`;
    case 'decision':
      return `<polygon points="${r(cx)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(cx)},${r(y + h)} ${r(x)},${r(y + h / 2)}" ${fill} ${stroke}/>`;
    case 'circle':
      return `${geometry.circle(it)[0]} ${fill} ${stroke}/>`;
    case 'queue':
      return `${geometry.queue(it)[0]} ${fill} ${stroke}/>${emptySlots(it)}`;
    case 'start':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="${tokens.color.fg}" ${stroke}/>`;
    case 'final':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="none" ${stroke}/><circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 4)}" fill="${tokens.color.fg}"/>`;
    case 'table':
    case 'api':
      return drawTable(it, stroke, paint);
    case 'chart':
      return drawChartCard(it, stroke, paint);
    case 'grid':
      return drawGrid(it, stroke, paint);
    default:
      return drawBox(it, stroke, fill);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 상자와 외부 도형. 복제 개수(count)가 있으면 뒤 윤곽 두 겹이 오른쪽 아래로 비쳐 보인다. 앞 상자(몸통)는 bodyOf가 정한다.
function drawBox(it, stroke, fill) {
  const dash = it.shape === 'external' ? ` stroke-dasharray="${LINE_DASH}"` : '';
  const steps = Array.from({ length: (it.stack ?? 0) / STACK_STEP }, (_, k) => it.stack / STACK_STEP - k);
  return [...steps, 0].map((k) => `${geometry.rect({ ...it, x: it.x + k * STACK_STEP, y: it.y + k * STACK_STEP })[0]} ${fill} ${stroke}${dash}/>`).join('');
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 차트 카드: 카드 틀 안에 차트 그림을 그대로 놓는다. 차트의 id는 data-chart로 가려 같은 차트가 여러 곳에 그려져도 움직임이 모두 찾는다.
function drawChartCard(it, stroke, { glyphs }) {
  for (const face of CHART_FACES) glyphs.add(it.chart.text, face);
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${values.simple2['node-corner']}" fill="${tokens.color.node}" ${stroke}/>`;
  return `${frame}<g class="fl-chart" data-chart="${escapeXml(it.id)}" transform="translate(${r(it.x)} ${r(it.y)})">${it.chart.body}</g>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 순서 보기 참여자로 놓인 표, API, 클래스: 공통 카드 머리(아이콘과 이름)만 있는 카드. 칸과 멤버는 같은 카드를 담은 그래프 보기가 그린다.
function drawHeaderCard(it, stroke, { glyphs }) {
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${values.simple2['node-corner']}" fill="${tokens.color.node}" ${stroke}/>`;
  return `${frame}${drawHeaderRow(it, it.headerH, glyphs)}`;
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 열 수, out = 만든 SVG 글자 수
// basis: estimate
// 테이블과 API: 머리 칸(아이콘과 이름), 열(칸)마다 이름과 표시(PK, FK, UNQ), 타입. 열 줄은 밝히기 대상이다.
function drawTable(it, stroke, { decorate, glyphs, index }) {
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${values.simple2['node-corner']}" fill="${tokens.color.node}" ${stroke}/>`;
  // 열 줄의 밝힘 면은 안쪽이 직선이고, 마지막 줄이 바깥 둥근 틀 밖으로 나가지 않도록 틀 모양으로 자른다.
  const clip = `tc-${index}`;
  const clipDef = `<clipPath id="${clip}"><rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${values.simple2['node-corner']}"/></clipPath>`;
  const header = drawHeaderRow(it, it.headerH, glyphs);
  const rows = it.columns.map((c, k) => {
    const key2 = `${it.id}.${c.name}`;
    const row = it.tableRows[k];
    const y = it.y + row.y;
    const key = columnKey(c);
    glyphs.add(c.name, 'regular');
    glyphs.add([c.type, ...row.rules.map(({ text }) => text)].join(' '), 'mono');
    glyphs.add(key, 'semibold');
    const baseline = r(centerBaseline(it.y + row.center, STYLE.cell.size));
    return (
      `<g class="fl-part" data-part="${escapeXml(key2)}"><rect x="${r(it.x + values.border.thin)}" y="${r(y)}" width="${r(it.w - values.border.thin * 2)}" height="${r(row.h)}" class="part-bg ${decorate('part', 0, key2)}"/>` +
      `<line x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(y)}" y2="${r(y)}" class="col-line"/>` +
      `<text x="${r(it.x + SPACE['9'])}" y="${baseline}" class="cell">${escapeXml(c.name)}${key ? `<tspan class="key" dx="${SPACE['3']}">${key}</tspan>` : ''}</text>` +
      `<text x="${r(it.x + it.w - SPACE['9'])}" y="${baseline}" class="cell type">${escapeXml(c.type)}</text>${drawColumnRules(it, row)}</g>`
    );
  });
  return `${clipDef}${frame}${schemaHeader(it, it.headerH)}${header}<g clip-path="url(#${clip})">${rows.join('')}</g>`;
}

// cost: time O(r), heap O(out), stack O(1)
// vars: r = 제약 줄 수, out = SVG 글자 수
// basis: estimate
function drawColumnRules(it, row) {
  return row.rules.map(({ text, center }) => `<text x="${r(it.x + SPACE['9'])}" y="${r(centerBaseline(it.y + center, STYLE.type.size))}" class="cell rule">${escapeXml(text)}</text>`).join('');
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 칸 수
// basis: estimate
// 큐의 빈 칸: 무채색 면에 외곽선(도형 면 위 대비 3). 찬 칸은 그 위에 값 층(draw/values.js)이 같은 자리에 얹는다.
function emptySlots(it) {
  return queueSlots(it).map((s) => `<rect x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" rx="${RADIUS.sm}" fill="${tokens.color.figure['queue-empty']}" stroke="${tokens.color.outline}" stroke-width="${values.border.thin}"/>`).join('');
}
