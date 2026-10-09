// 시간 보기 배치. 추적 카드의 구간(span)을 실제 시간 축 위에 놓는다. 레인은 구간이 처음 나온 순서로 위에서 아래로 쌓고, 같은 레인에서 시간이 겹치는 구간은 줄을 나눈다.
// 가로 위치는 시작 시각에 비례하고 길이는 길이에 비례한다(0에서 시작하는 선형 축, 눈금은 chart/scale.js의 같은 규칙).
import { measure } from '../measure/fonts.js';
import { categoryPaint } from '../chart-palette.js';
import { axisEnd } from '../chart/axis.js';
import { labelColumn, drawHeader } from '../chart/labels.js';
import { BAR, PAD, SPACE, TEXT, WIDTH } from '../chart/metrics.js';
import { makeScale } from '../chart/scale.js';

// 구간 줄의 세로 간격과 레인 위아래 여유
const SUB_ROW = BAR + SPACE['8'];
const LANE_PAD = SPACE['4'];
// 구간 막대 끝과 그 이름 글 사이 간격
const NAME_GAP = SPACE['3'];

// cost: time O(s log s + s·r), heap O(s), stack O(1)
// vars: s = 구간 수, r = 레인 안 줄 수
// basis: estimate
/**
 * 추적 카드를 시간 보기로 배치한다.
 * @param card 추적 카드 { id, label, unit, spans }
 * @param names 카드 이름 → 레인 이름 글(레인은 카드 이름이다)
 * @returns { kind: 'time', id, width, height, header, lanes, axisY, scale, unit, plotX, plotRight, text }. text는 글꼴 조각에 모을 글자다. 레인은 { id, label, y, h, paint, spans }이고 구간은 { id, label, key, x, y, w, h, nameX, at, dur }이다. key는 `카드.구간`으로 light가 가리키는 이름이다
 */
export function layoutTime(card, names) {
  const header = drawHeader({ title: card.label, subtitle: undefined, chartType: 'time', chart: { series: [], rules: [], layout: undefined } });
  const lanes = [...new Set(card.spans.map((s) => s.lane))];
  const labelW = labelColumn(lanes.map((id) => names.get(id) ?? id));
  const plotX = PAD + labelW;
  const plotRight = WIDTH - PAD;
  const total = Math.max(...card.spans.map((s) => s.at + s.dur));
  const scale = makeScale('linear', { min: 0, max: total, start: plotX, length: plotRight - plotX });
  let y = header.bottom;
  const laid = lanes.map((id, k) => {
    const rows = packRows(card.spans.filter((s) => s.lane === id), scale);
    const h = Math.max(SUB_ROW, rows.length * SUB_ROW) + LANE_PAD * 2;
    const spans = rows.flatMap((row, r) => row.map((s) => ({ ...s, y: y + LANE_PAD + r * SUB_ROW + SPACE['4'], h: BAR })));
    const lane = { id, label: names.get(id) ?? id, y, h, paint: categoryPaint(k), spans: spans.map((s) => ({ ...s, key: `${card.id}.${s.id}` })) };
    y += h;
    return lane;
  });
  const axisY = y + SPACE['4'];
  const bottom = axisEnd(axisY, Boolean(card.unit));
  const text = `${[card.label, card.unit, ...laid.map((l) => l.label), ...card.spans.map((s) => s.label)].join('')}0123456789.ekM−+%=-`;
  return { kind: 'time', id: card.id, width: WIDTH, height: bottom + PAD, header: header.svg, lanes: laid, axisY, scale, unit: card.unit, plotX, plotRight, text };
}

// cost: time O(s log s + s·r), heap O(s), stack O(1)
// vars: s = 구간 수, r = 줄 수
// basis: estimate
// 레인 안 구간을 시작 시각 순으로 줄에 놓는다. 한 줄에서 앞 구간의 막대와 이름 글이 차지한 가로 구간(px)과 겹치면 다음 줄로 간다.
function packRows(spans, scale) {
  const rows = [];
  const edges = [];
  for (const span of [...spans].sort((a, b) => a.at - b.at || a.dur - b.dur)) {
    const x = scale.at(span.at);
    const w = Math.max(SPACE['1'], scale.at(span.at + span.dur) - x);
    const nameW = measure(span.label, TEXT['11']);
    // 이름은 막대 오른쪽에 두고, 그림 오른쪽 끝을 넘으면 막대 왼쪽에 둔다.
    const isLeft = x + w + NAME_GAP + nameW > WIDTH - PAD;
    const [from, to] = isLeft ? [x - NAME_GAP - nameW, x + w] : [x, x + w + NAME_GAP + nameW];
    let k = edges.findIndex((end) => end <= from);
    if (k < 0) k = edges.length;
    edges[k] = to;
    (rows[k] ??= []).push({ id: span.id, label: span.label, lane: span.lane, at: span.at, dur: span.dur, x, w, isLeft, nameX: isLeft ? x - NAME_GAP : x + w + NAME_GAP, line: span.line });
  }
  return rows;
}
