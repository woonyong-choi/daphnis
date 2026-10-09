// 열의 이름·타입과 제약 줄을 한 번 배치해 그리기, 연결점, 충돌 검사에 넘긴다.
import { columnKey, columnRules } from '../table.js';
import { values } from '../tokens.js';
import { HEADER } from './decor.js';
import { measure } from './fonts.js';

const SPACE = values.space;
const ICON = values.size.icon.node;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 카드 머리 한 줄(아이콘과 제목)의 너비와 자리. 표, API, 클래스, 순서 보기 참여자가 같은 머리를 쓴다. 묶음은 카드 가운데에 놓이므로 x는 카드 너비에서 구한다.
 * @returns { w, icon, titleX }. icon은 아이콘 자리가 필요한지, titleX는 묶음 왼쪽에서 제목 글 가운데까지 거리다
 */
export function headerRow(node, style) {
  const titleW = measure(node.label, style.label.size, style.label.face);
  const icon = Boolean(node.iconData);
  const lead = icon ? ICON + HEADER.iconGap : 0;
  return { w: lead + titleW, icon, titleX: lead + titleW / 2 };
}

// cost: time O(c·n), heap O(c·n), stack O(1)
// vars: c = 열 수, n = 열 표시 글자 수
// basis: estimate
export function tableLayout(node, style) {
  const rowH = values.size.node['table-row'];
  let height = HEADER.rowH;
  const rows = node.columns.map((column) => {
    const rules = columnRules(column).map((text, i) => ({ text, center: height + rowH + style.type.line * (i + 0.5) }));
    const row = { y: height, center: height + rowH / 2, h: rowH + rules.length * style.type.line, rules };
    height += row.h;
    return row;
  });
  const nameW = Math.max(...node.columns.map((column) => measure(column.name, style.cell.size) + (columnKey(column) ? measure(columnKey(column), style.key.size, style.key.face) + SPACE['3'] : 0)));
  const typeW = Math.max(...node.columns.map((column) => measure(column.type, style.type.size, style.type.face)));
  const ruleW = Math.max(0, ...rows.flatMap((row) => row.rules.map(({ text }) => measure(text, style.type.size, style.type.face))));
  const head = headerRow(node, style);
  const w = Math.max(values.size.node['min-width'], Math.max(nameW + typeW + SPACE['8'], ruleW, head.w) + HEADER.padX * 2);
  return { w, height, rows, rowH, headerH: HEADER.rowH, head };
}
