// 값 카드 줄의 값 글자와 바뀔 때 밝히는 테두리. 줄의 이름은 카드 층이 그리고, 값은 시간표(timeline.values)의 변화 목록대로 글자 요소를 값마다 하나씩 두고 불투명도로 바꾼다(docs/design/playback.md 값 변화).
// 같은 카드가 여러 보기에 그려지면 도형마다 같은 값 글자를 한 벌씩 그린다(data-v는 같다). 카드에 놓이지 않은 값(`on=` 없음)은 그리지 않는다.
import { filledSlots, queueSlots } from '../measure/queue.js';
import { CARD, STYLE } from '../measure/sizes.js';
import { wrap } from '../measure/fonts.js';
import { categoryPaint } from '../chart-palette.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { rowSlot } from './card.js';
import { cardBox } from './figure.js';
import { outlineOf } from './shape.js';
import { hiddenAttr } from './visible.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이 글이 값 줄의 마지막 기간의 글인지. 마지막 글만 장면 끝(과 효과 꼬리)까지 보이고, 장면 끝에서 다음 글로 바뀐 앞 글은 그 시각에 꺼진다.
const isLastText = (row, text) => row.periods.at(-1)[2] === text;

// cost: time O(i), heap O(1), stack O(1)
// vars: i = 도형 수
// basis: estimate
// 값 줄이 놓인 도형들: 같은 이름의 도형 가운데 카드(큐는 칸)를 가진 것. 보기마다 한 도형씩이다.
const instancesOf = (scene, row) => scene.items.flatMap((item, index) => (item.id === row.node && (row.slots !== undefined || item.card) ? [{ item, index }] : []));

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 줄 수
// basis: estimate
/**
 * 값이 바뀔 때 잠깐 켜지는 배경 면. 면은 글자와 칸 아래에 있어야 이름과 값이 가려지지 않으므로 값 층이 아니라 도형 그룹 안(도형 면 바로 위, 글자 아래)에 넣는다.
 * 큐는 도형과 같은 윤곽(outlineOf)이고 카드 값 줄은 줄 모양이며 둘 다 테두리가 없어 기본 경계 위에 두 번째 윤곽이 생기지 않는다.
 * 보이는 글이 바뀐 카드 글 줄(timeline.rowPulses)도 같은 면을 가진다(`data-rf`). 카드의 모든 내용 층에서 그 줄 자리에 놓여 보이는 층의 줄만 켜진다.
 * @param deps { windows, pulse?, row? }. windows(구간 목록)은 움직이는 SVG의 SMIL 요소를 돌려주고 재생기는 빈 글을 돌려주는 함수다(재생기가 불투명도를 바꾼다). pulse(값 줄 번호)가 있으면 갱신 펄스(80/80/240ms, 겹치면 최댓값)가 면을 켜고, 없으면 값 줄의 flashes 구간이 켠다. row(펄스 키)는 글 줄 면의 SMIL 요소를 돌려준다(재생기는 없다)
 * @returns { shape: Map<도형 번호, 글>, card: Map<`도형 번호:카드 번호`, 글> }. 도형 면 아래 면과 카드 층 안 면이다
 */
export function drawFlashes(scene, timeline, { windows, pulse, row }) {
  const flashes = { shape: new Map(), card: new Map() };
  addRowFlashes(flashes, scene, timeline, row);
  (timeline.values ?? []).forEach((row, vi) => {
    const anim = pulse ? pulse(vi) : windows(row.flashes);
    for (const { item, index } of instancesOf(scene, row)) {
      if (row.slots !== undefined) {
        flashes.shape.set(index, `${flashes.shape.get(index) ?? ''}${outlineOf(item)[0]} class="fl-flash fl-flash-face" opacity="0" data-vf="${vi}">${anim}</rect>`);
        continue;
      }
      const box = cardBox(item);
      const layout = item.card.layouts[row.card];
      const at = layout.rows.findIndex((laid) => laid.row.valueId === row.id);
      if (at < 0) continue;
      const slot = rowSlot(layout, box, at);
      const key = `${index}:${row.card}`;
      flashes.card.set(key, `${flashes.card.get(key) ?? ''}${flashFrame({ box, slot, attr: `data-vf="${vi}"`, anim, isFirst: at === 0, isLast: at === layout.rows.length - 1 })}`);
    }
  });
  return flashes;
}

// cost: time O(v·(c + n)), heap O(out), stack O(1)
// vars: v = 값 줄 수, c = 값이 바뀌는 횟수, n = 값 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 시간표의 값 줄을 모두 그린다. 값 글자와 밝힘 테두리는 모두 처음에 안 보이고, 보이는 때를 움직임이 정한다.
 * @param deps { glyphs, windows, isStatic? }. windows(구간 목록)은 움직이는 SVG의 SMIL 요소를 돌려주고, 재생기는 빈 글을 돌려주는 함수를 넘겨 요소만 그리게 한다(재생기가 불투명도를 바꾼다). isStatic이면 글이 처음부터 보인다(정지 그림과 재생기가 그리지 않는 장면 없는 문서의 HTML은 값 줄마다 글 하나뿐이다)
 */
export function drawValues(scene, timeline, { glyphs, windows, isStatic = false }) {
  const shown = isStatic ? 1 : 0;
  return (timeline.values ?? [])
    .flatMap((row, vi) => instancesOf(scene, row).map(({ item }) => {
      if (row.slots !== undefined) return drawQueueValue(row, { item, vi, shown }, windows);
      const box = cardBox(item);
      const layout = item.card.layouts[row.card];
      const at = layout.rows.findIndex((laid) => laid.row.valueId === row.id);
      if (at < 0) return '';
      const slot = rowSlot(layout, box, at);
      const texts = [...new Set(row.periods.map(([, , text]) => text))].map((text) => {
        glyphs.add(text, STYLE.value.face);
        const spans = row.periods.filter(([, , t]) => t === text).map(([start, end]) => [start, end]);
        return `<text x="${r(box.x + box.w - CARD.side)}" y="${r(centerBaseline(slot.y + STYLE.row.line / 2, STYLE.value.size))}" class="value" opacity="${shown}"${hiddenAttr(shown)} data-v="${vi}" data-t="${escapeXml(text)}">${valueLines(text, layout.rows[at].valueSlot, { x: box.x + box.w - CARD.side })}${windows(spans, { holdEnd: isLastText(row, text) })}</text>`;
      });
      return `<g class="fl-value">${texts.join('')}</g>`;
    }))
    .join('\n');
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
// 값 글자 본문. 자리 폭 안에 한 줄이면 글 그대로이고, 아니면 자리 폭에서 나눈 줄마다 오른쪽 끝에 맞춘 tspan이다. 크기를 정할 때와 같은 함수와 폭을 쓴다(measure/sizes.js fitValueSlot).
function valueLines(text, slot, { x }) {
  const lines = slot ? wrap(text, slot.w, STYLE.value) : [text];
  if (lines.length === 1) return escapeXml(text);
  return lines.map((line, k) => `<tspan x="${r(x)}" dy="${k === 0 ? 0 : STYLE.row.line}">${escapeXml(line)}</tspan>`).join('');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값이 바뀔 때 그 카드 줄 뒤에 잠깐 켜지는 배경색(테두리 없음). 줄의 실제 자리 전체(카드 왼쪽 끝에서 오른쪽 끝, 위아래는 이웃 줄과 줄 간격 절반씩 나눈 곳)를 칠하고 카드 모서리에 닿는 첫 줄과 마지막 줄만 카드와 같은 반지름이라 면 둘레에 카드 색 띠(흰 테두리처럼 보이는 것)가 남지 않는다.
function flashFrame({ box, slot, attr, anim, isFirst, isLast }) {
  const top = isFirst ? box.y : slot.y - CARD.gap / 2;
  const bottom = isLast ? box.y + box.h : slot.y + slot.h + CARD.gap / 2;
  const [left, right] = [box.x, box.x + box.w];
  const [rt, rb] = [isFirst ? values.radius.md : 0, isLast ? values.radius.md : 0];
  const corner = (radius, dx, dy) => (radius ? `a${radius} ${radius} 0 0 1 ${dx * radius} ${dy * radius}` : '');
  const d = `M${r(left + rt)} ${r(top)}H${r(right - rt)}${corner(rt, 1, 1)}V${r(bottom - rb)}${corner(rb, -1, 1)}H${r(left + rb)}${corner(rb, -1, -1)}V${r(top + rt)}${corner(rt, 1, -1)}Z`;
  return `<path d="${d}" class="fl-flash" opacity="0" ${attr}>${anim}</path>`;
}

// cost: time O(k·l·n), heap O(k·l), stack O(1)
// vars: k = 효과가 있는 글 줄 수, l = 카드 내용 수, n = 도형 수
// basis: estimate
// 보이는 글이 바뀐 카드 글 줄(`row:도형:줄 번호`)마다, 그 도형이 그려진 모든 곳의 모든 카드 내용 층에 같은 줄 자리의 배경 면을 둔다. 값 줄과 같은 면이다.
function addRowFlashes(flashes, scene, timeline, anim) {
  for (const key of new Set((timeline.rowPulses ?? []).map((pulse) => pulse.key))) {
    const [, node, number] = /^row:(.*):(\d+)$/.exec(key);
    const at = Number(number);
    scene.items.forEach((item, index) => {
      if (item.id !== node || !item.card) return;
      item.card.layouts.forEach((layout, k) => {
        if (!layout.rows[at] || layout.rows[at].row?.isValue) return;
        const box = cardBox(item);
        const frame = flashFrame({ box, slot: rowSlot(layout, box, at), attr: `data-rf="${escapeXml(node)}:${at}"`, anim: anim?.(key) ?? '', isFirst: at === 0, isLast: at === layout.rows.length - 1 });
        flashes.card.set(`${index}:${k}`, `${flashes.card.get(`${index}:${k}`) ?? ''}${frame}`);
      });
    });
  }
}

// cost: time O(c·s), heap O(c·s), stack O(1)
// vars: c = 값이 바뀌는 횟수, s = 칸 수
// basis: estimate
// 큐 값 줄. 값 글자마다 그 찬 칸 수만큼 칸을 얹은 묶음을 하나씩 두고 불투명도로 바꾸며(글자와 같은 data-v, data-t), 바뀔 때는 큐 면(도형과 같은 윤곽)을 잠깐 칠한다.
function drawQueueValue(row, { item, vi, shown }, windows) {
  const texts = [...new Set(row.periods.map(([, , text]) => text))].map((text) => {
    const spans = row.periods.filter(([, , t]) => t === text).map(([start, end]) => [start, end]);
    return `<g class="queue-fill" opacity="${shown}"${hiddenAttr(shown)} data-v="${vi}" data-t="${escapeXml(text)}">${filledRects(item, filledSlots(text, row.slots))}${windows(spans, { holdEnd: isLastText(row, text) })}</g>`;
  });
  return `<g class="fl-value">${texts.join('')}</g>`;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 칸 수
// basis: estimate
// 왼쪽부터 count칸의 찬 칸. 찬 칸은 자료 표식이라 범주 색 첫 계열의 면을 쓰고, 빈 칸의 외곽선을 같은 두께의 같은 색으로 덮는다.
function filledRects(item, count) {
  const { fill } = categoryPaint(0);
  return queueSlots(item)
    .slice(0, count)
    .map((s) => `<rect x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" rx="${values.radius.sm}" fill="${fill}" stroke="${fill}" stroke-width="${values.border.thin}"/>`)
    .join('');
}
