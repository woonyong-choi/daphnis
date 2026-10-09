// 클래스의 세 구획은 같은 줄 좌표를 측정, 렌더링, 충돌 검사에 전달한다.
import { values } from '../tokens.js';
import { measure, wrap } from './fonts.js';

/** 인터페이스 카드의 표시. 클래스 카드와 순서 보기의 머리만 있는 참여자가 같은 글을 쓴다. */
export const INTERFACE_MARK = '«interface»';

const VISIBILITY = Object.freeze({ public: '+', private: '-', protected: '#', package: '~' });
const PAD_X = values.space['9'];
const PAD_Y = values.space['6'];

// cost: time O(m·n²), heap O(m·n), stack O(1)
// vars: m = 멤버 수, n = 가장 긴 표시 글자 수
// basis: estimate
export function sizeClassifier(node, styles) {
  const maxInner = values.size.node['card-width'] - PAD_X * 2;
  // 머리는 제목(label)과 그 위아래 메타(stereotype), 멤버는 핵심 필드(mono)다
  const header = [];
  if (node.classifierKind === 'interface') header.push({ text: INTERFACE_MARK, style: styles.meta, role: 'meta' });
  header.push({ text: node.label, style: styles.label, role: 'label' });
  if (node.abstract) header.push({ text: '{abstract}', style: styles.meta, role: 'meta' });
  const groups = [header, ...['field', 'method'].map((kind) => node.members.filter((m) => m.kind === kind).map((m) => ({ text: memberText(m), style: styles.mono, role: 'row mono', underline: Boolean(m.static), member: m.id })))];
  const rows = [];
  const dividers = [];
  let y = 0;
  for (const [index, group] of groups.entries()) {
    y += PAD_Y;
    for (const entry of group) {
      for (const text of wrap(entry.text, maxInner, entry.style)) {
        rows.push({ ...entry, text, center: y + entry.style.line / 2, centered: index === 0 });
        y += entry.style.line;
      }
    }
    if (!group.length) y += styles.mono.line;
    y += PAD_Y;
    if (index < groups.length - 1) dividers.push(y);
  }
  const w = Math.max(values.size.node['min-width'], ...rows.map((row) => measure(row.text, row.style.size, row.style.face) + PAD_X * 2));
  return { w, h: y, marginTop: 0, marginBottom: 0, labelLines: [], subLines: [], classifierRows: rows.map((row) => ({ ...row, x: row.centered ? w / 2 : PAD_X })), classifierDividers: dividers };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 멤버 표시 글자 수
// basis: estimate
function memberText(member) {
  const signature = member.kind === 'field' ? `${member.id}: ${member.signature}` : `${member.id}${member.signature}`;
  return [VISIBILITY[member.visibility], signature, member.abstract ? '{abstract}' : undefined].filter(Boolean).join(' ');
}
