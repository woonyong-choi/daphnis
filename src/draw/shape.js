// 도형 하나의 윤곽을 그린다. 상자, 원통, 사람, 갈림길, 원, 상태 점, 테이블, 격자. 이름과 카드는 draw/figure.js가 그린다.
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { drawGrid } from './grid.js';

const SPACE = values.space;
const SIZE = values.size;
const RADIUS = values.radius;
const EDGE_DASH = `${values.dash.line} ${values.dash.gap}`;

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 테이블 열 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawShape(it, stroke, paint) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  const fill = `fill="${tokens.color.node}"`;
  switch (it.shape) {
    case 'store': {
      const cap = it.marginTop;
      return (
        `<path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${cap} 0 0 1 ${r(w)} 0 v ${r(h)} a ${r(w / 2)} ${cap} 0 0 1 ${r(-w)} 0 z" ${fill} ${stroke}/>` +
        `<path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${cap} 0 0 0 ${r(w)} 0" fill="none" ${stroke}/>`
      );
    }
    case 'person': {
      const head = SIZE.person.head / 2;
      const shoulder = SIZE.person.shoulder;
      const bodyW = w;
      const bx = x;
      return (
        `<circle cx="${r(cx)}" cy="${r(y - shoulder - SPACE['1'] - head)}" r="${r(head)}" ${fill} ${stroke}/>` +
        `<path d="M${r(bx)} ${r(y + h)} V ${r(y)} A ${r(bodyW / 2)} ${shoulder} 0 0 1 ${r(bx + bodyW)} ${r(y)} V ${r(y + h)} Z" ${fill} ${stroke}/>`
      );
    }
    case 'decision':
      return `<polygon points="${r(cx)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(cx)},${r(y + h)} ${r(x)},${r(y + h / 2)}" ${fill} ${stroke}/>`;
    case 'circle':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" ${fill} ${stroke}/>`;
    case 'start':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="${tokens.color.fg}" ${stroke}/>`;
    case 'final':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="none" ${stroke}/><circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 4)}" fill="${tokens.color.fg}"/>`;
    case 'table':
      return drawTable(it, stroke, paint);
    case 'grid':
      return drawGrid(it, stroke, paint);
    default: {
      const dash = it.shape === 'external' ? ` stroke-dasharray="${EDGE_DASH}"` : '';
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${RADIUS.xl}" ${fill} ${stroke}${dash}/>`;
    }
  }
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 열 수, out = 만든 SVG 글자 수
// basis: estimate
// 테이블: 머리 칸, 열마다 이름과 표시(PK, FK, UNQ), 타입. 열 줄은 밝히기 대상이다.
function drawTable(it, stroke, { decorate, glyphs }) {
  const rowH = it.rowH;
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${RADIUS.xl}" fill="${tokens.color.node}" ${stroke}/>`;
  glyphs.add(it.label, 'medium');
  const header = `<text x="${r(it.x + it.w / 2)}" y="${r(centerBaseline(it.y + rowH / 2, STYLE.label.size))}" class="label">${renderRich(it.label)}</text>`;
  const rows = it.columns.map((c, k) => {
    const key2 = `${it.id}.${c.name}`;
    const y = it.y + rowH * (k + 1);
    const key = c.pk ? 'PK' : c.fk ? 'FK' : c.unique ? 'UNQ' : '';
    glyphs.add(c.name, 'regular');
    glyphs.add(c.type, 'mono');
    glyphs.add(key, 'semibold');
    const baseline = r(centerBaseline(y + rowH / 2, STYLE.cell.size));
    return (
      `<g class="fl-part" data-part="${escapeXml(key2)}"><rect x="${r(it.x + values.border.thin)}" y="${r(y)}" width="${r(it.w - values.border.thin * 2)}" height="${r(rowH)}" class="part-bg ${decorate('part', 0, key2)}"/>` +
      `<line x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(y)}" y2="${r(y)}" class="col-line"/>` +
      `<text x="${r(it.x + SPACE['9'])}" y="${baseline}" class="cell">${escapeXml(c.name)}${key ? `<tspan class="key" dx="${SPACE['3']}">${key}</tspan>` : ''}</text>` +
      `<text x="${r(it.x + it.w - SPACE['9'])}" y="${baseline}" class="cell type">${escapeXml(c.type)}</text></g>`
    );
  });
  return frame + header + rows.join('');
}
