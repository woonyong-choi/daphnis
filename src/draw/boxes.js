// 이동 글 상자가 피할 사각형. 글자(도형 이름과 부제, 테이블 머리와 열, 그룹 제목), 도형 테두리(사람 머리와 몸통, 원통 뚜껑 포함), 선 라벨 알약이다.
import { measure } from '../measure/fonts.js';
import { STYLE, sizePill } from '../measure/sizes.js';
import { plainText } from '../text.js';
import { values } from '../tokens.js';
import { labelRows } from './figure.js';

const SPACE = values.space;
const INNER_X = SPACE['9'];
const SIZE = values.size;

// cost: time O(s·l + c + g), heap O(s·l + c + g), stack O(1)
// vars: s = 도형 수, l = 도형 이름 줄 수, c = 테이블 열 수, g = 그룹 수
// basis: estimate
/**
 * 장면의 글자 사각형 목록. 가로는 잰 글 폭이고 높이는 글자 크기에 위아래 `space.1`씩 더한 값이다(글자 위아래 내림과 올림).
 * @returns { x, y, w, h, name }[]. name은 알림 메시지에 쓸 표시 글이다
 */
export function textBoxes(scene) {
  const boxes = [];
  const add = (x, center, width, style, name) => boxes.push({ x, y: center - style.size / 2 - SPACE['1'], w: width, h: style.size + SPACE['1'] * 2, name: plainText(name) });
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

// cost: time O(s + e), heap O(s + e), stack O(1)
// vars: s = 도형 수, e = 선 수
// basis: estimate
/**
 * 이동 글 상자가 피할 모든 사각형: 글자, 도형 테두리, 선 라벨 알약. 그룹 틀은 이동이 그 안에서 일어나므로 제목 글자만 피한다.
 * @returns { x, y, w, h, name }[]
 */
export function chipObstacles(scene) {
  return [...textBoxes(scene), ...shapeBoxes(scene), ...pillBoxes(scene)];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 도형이 그려진 테두리 사각형. 사람은 머리와 몸통(어깨 포함) 둘, 원통은 위아래 뚜껑까지 넓힌다.
function shapeBoxes(scene) {
  return scene.items.flatMap((it) => {
    const name = plainText(it.label ?? it.id);
    if (it.shape === 'person') {
      const head = SIZE['person-head'];
      const shoulder = SIZE['person-shoulder'];
      const headTop = it.y - shoulder - SPACE['1'] - head;
      return [
        { x: it.x + it.w / 2 - head / 2, y: headTop, w: head, h: head, name },
        { x: it.x, y: it.y - shoulder, w: it.w, h: it.h + shoulder, name },
      ];
    }
    const cap = it.shape === 'store' ? it.marginTop : 0;
    return [{ x: it.x, y: it.y - cap, w: it.w, h: it.h + cap * 2, name }];
  });
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 선 수
// basis: estimate
// 선 라벨 알약 사각형. 자기 선의 알약도 점이 지나므로 피한다.
function pillBoxes(scene) {
  return scene.edges
    .filter((e) => e.label && e.labelAt)
    .map((e) => {
      const { w, h } = sizePill(e.label);
      return { x: e.labelAt.x - w / 2, y: e.labelAt.y - h / 2, w, h, name: plainText(e.label) };
    });
}
