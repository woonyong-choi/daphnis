// 클래스의 이름, 속성, 메서드 구획을 잰 좌표 그대로 그린다.
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { schemaHeader } from './schema.js';
import { tokens, values } from '../tokens.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 전체 표시 글자 수
// basis: estimate
export function drawClassifier(it, stroke, { glyphs }) {
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${values.simple2['node-corner']}" fill="${tokens.color.node}" ${stroke}/>`;
  const dividers = it.classifierDividers.map((y) => `<line class="classifier-divider col-line" x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(it.y + y)}" y2="${r(it.y + y)}"/>`);
  const rows = it.classifierRows.map((row) => {
    glyphs.add(row.text, row.style.face);
    return `<text class="classifier-text ${row.role}" x="${r(it.x + row.x)}" y="${r(centerBaseline(it.y + row.center, row.style.size))}" text-anchor="${row.centered ? 'middle' : 'start'}"${row.underline ? ' text-decoration="underline"' : ''}>${escapeXml(row.text)}</text>`;
  });
  return frame + schemaHeader(it, it.classifierDividers[0]) + dividers.join('') + rows.join('');
}
