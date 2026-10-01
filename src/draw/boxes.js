// 그림에 그려진 글자(도형 이름과 부제, 테이블 머리와 열, 그룹 제목)가 차지하는 사각형. 이동 글 상자가 이름을 가리지 않는 자리를 고르는 데 쓴다.
import { measure } from '../measure/fonts.js';
import { STYLE } from '../measure/sizes.js';
import { plainText } from '../text.js';
import { values } from '../tokens.js';
import { labelRows } from './figure.js';

const SPACE = values.space;
const INNER_X = SPACE['9'];

// cost: time O(s·l + c + g), heap O(s·l + c + g), stack O(1)
// vars: s = 도형 수, l = 도형 이름 줄 수, c = 테이블 열 수, g = 그룹 수
// basis: estimate
/**
 * 장면의 글자 사각형 목록. 글자 높이는 글자 크기이고 가로는 잰 글 폭이다.
 * @returns { x, y, w, h, name }[]. name은 알림 메시지에 쓸 표시 글이다
 */
export function textBoxes(scene) {
  const boxes = [];
  const add = (x, center, width, style, name) => boxes.push({ x, y: center - style.size / 2, w: width, h: style.size, name: plainText(name) });
  for (const it of scene.items) {
    if (it.shape === 'table') {
      add(it.x + it.w / 2 - measure(it.label, STYLE.label.size, STYLE.label.face) / 2, it.y + it.rowH / 2, measure(it.label, STYLE.label.size, STYLE.label.face), STYLE.label, it.label);
      it.columns.forEach((c, k) => {
        const center = it.y + it.rowH * (k + 1.5);
        const key = c.pk ? 'PK' : c.fk ? 'FK' : c.unique ? 'UNQ' : '';
        const nameW = measure(c.name, STYLE.cell.size) + (key ? SPACE['3'] + measure(key, STYLE.tag.size, STYLE.tag.face) : 0);
        const typeW = measure(c.type, STYLE.type.size, STYLE.type.face);
        add(it.x + INNER_X, center, nameW, STYLE.cell, c.name);
        add(it.x + it.w - INNER_X - typeW, center, typeW, STYLE.type, c.type);
      });
      continue;
    }
    for (const row of labelRows(it)) {
      const width = measure(row.text, row.style.size, row.style.face);
      add(row.cx - width / 2, row.center, width, row.style, row.text);
    }
  }
  for (const g of scene.groups) if (g.label) add(g.x + INNER_X, g.y + values.size['group-title'] / 2, measure(g.label, STYLE.group.size, STYLE.group.face), STYLE.group, g.label);
  return boxes;
}
