// 재생기 브라우저 시험용 손으로 적은 정본 문서. 컴파일러(src/build.js)를 거치지 않는다.
// 그림 틀과 재생 스크립트는 실제 문서와 같은 모듈(src/html/player-script.js)에서 오고, 그림(SVG)과 시간표는 이 파일이 손으로 적는다.
// 그래서 이 문서로 잰 것은 재생기의 시계, 장면, 그리기 계약이지 컴파일러 출력이 아니다. 같은 계약을 컴파일러가 만든 실제 문서로 test/player-compiled.test.js가 따로 잰다.
import { categoryPaint } from '../src/chart-palette.js';
import { withPulseOverlays } from '../src/chart/pulse-overlay.js';
import { PLAYER_SCRIPT, figureFrame } from '../src/html/player-script.js';
import { FLOW_METRICS, PLAYER_METRICS } from '../src/html/metrics.js';
import { STYLES } from '../src/styles.js';
import { CAPTURE } from './chrome.js';

// 장면 0 "One"은 박자 둘(0~600, 600~1200)이고 점이 1번 선(0)과 2번 선(1)을 차례로 지난다. 값 줄(n)은 논리 도형 c가 점을 받는 1100에 0에서 1로 바뀐다.
// 장면 1 "Two"는 박자 하나(1200~2000)이고 점이 1번 선을 순방향으로, 이어서 역방향으로 지난다. 값 줄 m은 1900에 1에서 2로 바뀐다.
// 첫 박자의 카드는 논리 도형 a에서 100에 첫 카드가 나타나고, 둘째 박자에서는 300에 둘째 카드로 바뀐다.
// 논리 도형 a와 c는 두 판에 그려져 도형 번호가 둘이다(a: 0과 4, c: 2와 3). 차트 카드 c1도 두 판에 있다.
export const FIXTURE_TIMES = Object.freeze({ firstEdgeMs: 500, secondEdgeStart: 600, secondEdgeEnd: 1100, valueChange: 1100, sceneOneLength: 1200 });

const SEG = { hops: [], cards: {}, cardsBefore: {}, cardsAt: {}, charts: {}, nodesOn: [], partsOn: [] };
// 장면 One에서 차트 c1은 계열 s0이 보이고 c2는 계열 s0이 숨는다. 두 차트는 따로 움직인다. 처음 박자에서는 c1의 행 r0을 밝힌다.
const CHARTS_ONE = { c1: { series: ['s0'], growing: [], lights: [] }, c2: { series: [], growing: [], lights: [] } };
const CHARTS_ONE_LIT = { ...CHARTS_ONE, c1: { series: ['s0'], growing: [], lights: ['r0'] } };

// 장면의 논리 길이와 그 장면 마지막 사건(펄스, 선에서 점이 떠남)의 장면 안 시각. 표시 길이(presentation)는 컴파일러가 정하는 값이고 이 손으로 적은 문서는 같은 식을 쓴다:
// D = max(길이 / speed, 마지막 사건 / speed + 400). 400은 효과 꼬리(표시 ms)라 speed로 나누지 않는다.
const SCENE_SPANS = [{ length: 1200, last: 1100 }, { length: 800, last: 700 }];
const TAIL_MS = 400;
const presentationOf = (steps) => steps.map((step, si) => Math.max(SCENE_SPANS[si].length / step.speed, SCENE_SPANS[si].last / step.speed + TAIL_MS));

// 손으로 적은 정본 재생 데이터. steps는 { label, mode, speed } 객체다(scenes[i]로 mode, speed를 정한다).
export function fixtureData(scenes) {
  const steps = [
    { label: 'One', mode: 'once', speed: 1, ...scenes?.[0] },
    { label: 'Two', mode: 'once', speed: 1, ...scenes?.[1] },
  ];
  return {
    tight: { x: 0, y: 0, w: 600, h: 320 },
    steps,
    width: 600,
    height: 320,
    itemIds: ['a', 'b', 'c', 'c', 'a'],
    cardCounts: [2, 0, 0, 0, 2],
    groupIds: [],
    edgePanels: [0, 0],
    trackPanels: [],
    panels: [
      { index: 0, view: 'main', strategy: 'graph', box: { x: 0, y: 0, w: 600, h: 200 }, minWidth: 600 },
      { index: 1, view: 'side', strategy: 'graph', box: { x: 0, y: 200, w: 600, h: 120 }, minWidth: 600 },
    ],
    metrics: { ...PLAYER_METRICS, ...FLOW_METRICS },
    segs: [
      { ...SEG, si: 0, t0: 0, t1: 600, hops: [{ edge: 0, at: 0, ms: 500 }], cards: { a: 0 }, cardsAt: { a: 100 }, pulses: [{ id: 'b', at: 500 }], nodesOn: ['a'], charts: CHARTS_ONE_LIT },
      { ...SEG, si: 0, t0: 600, t1: 1200, hops: [{ edge: 1, at: 0, ms: 500 }], cardsBefore: { a: 0 }, cards: { a: 1 }, cardsAt: { a: 300 }, pulses: [{ id: 'c', at: 500 }], nodesOn: ['b'], charts: CHARTS_ONE },
      { ...SEG, si: 1, t0: 1200, t1: 2000, hops: [{ edge: 0, at: 0, ms: 500 }, { edge: 0, at: 500, ms: 200, isBack: true }], pulses: [{ id: 'b', at: 500 }], charts: { c1: { series: ['s0'], growing: [], lights: [] }, c2: { series: ['s0'], growing: [], lights: [] } } },
    ],
    // 조용한 선 1은 점이 들어서는 600부터 장면 One 끝까지 보인다. 켜 둔 도형 a(One 처음 박자)와 b(둘째 박자), 차트 c1의 행 r0(처음 박자)은 구간이 가진다. 지나간 선을 켜 두는 표시는 없다.
    marks: { 'quiet:1': [[600, 1200, 0]] },
    presentation: presentationOf(steps),
    values: [
      { si: 0, periods: [[0, 1100, '0'], [1100, 1200, '1']] },
      { si: 1, periods: [[1200, 1900, '1'], [1900, 2000, '2']] },
    ],
    pulses: [{ key: 'value:0', at: 1100, si: 0 }, { key: 'value:1', at: 1900, si: 1 }, { key: 'chart:c1:a:0', at: 700, si: 0 }],
    // 차트 카드 c1은 장면 One에서 700에 틀 0에서 틀 1로 바뀌고 표 a:0만 달라진다(표 b:0은 두 틀이 같다). 장면 Two에는 이 차트의 기간이 없어 처음 틀(0번)이다.
    charts: { c1: { id: 'c1', rows: [{ si: 0, t0: 0, t1: 1200, periods: [[0, 700, 0, []], [700, 1200, 1, ['a:0']]] }] } },
    chartFrames: {
      c1: {
        marks: [{ id: 'a:0', tag: 'rect' }, { id: 'b:0', tag: 'rect' }],
        frames: [{ 'a:0': { attrs: { width: '40', class: 'bar' }, text: '1' }, 'b:0': { attrs: { width: '30' } } }, { 'a:0': { attrs: { width: '80', 'data-extra': 'on' }, text: '2' }, 'b:0': { attrs: { width: '30' } } }],
      },
    },
    chartMeta: { c1: { series: ['s0'], rowKeys: ['r0', 'r1'] }, c2: { series: ['s0'], rowKeys: [] } },
  };
}

const node = (i, x, id, extra = '') => `<g id="n-${i}" class="fl-node" tabindex="0" data-id="${id}"><rect class="fl-stroke" x="${x}" y="60" width="100" height="80" rx="8"/><g class="fl-head"><text x="${x + 50}" y="90">${id}</text></g>${extra}</g>`;
const valueRow = (vi, y) => ['0', '1', '2'].map((t) => `<text data-v="${vi}" data-t="${t}" x="520" y="${y}" opacity="0">${t}</text>`).join('') + `<rect class="fl-flash fl-flash-face" data-vf="${vi}" x="500" y="${y - 14}" width="60" height="20" opacity="0"/>`;
const card = (i, k, text) => `<g id="n-${i}-c${k}" class="fl-layer" opacity="0"><text x="70" y="125">${text}</text></g>`;
// 선 0과 알약 0은 보통 알약이고, 선 1과 알약 1은 조용한 알약(켜 둔 선이나 알약 색이 남을 때만 보인다)이다.
const edge = (j, d, quiet) => `<g id="e-${j}" class="fl-edge${quiet ? ' quiet' : ''}"><path id="p-${j}" class="fl-path" d="${d}"/></g>`;
const label = (j, x, quiet) => `<g id="l-${j}" class="fl-edge${quiet ? ' quiet' : ''}"><g class="fl-pill"><rect class="pill" x="${x}" y="85" width="40" height="18" rx="9"/><text class="edgelabel" x="${x + 20}" y="98">m${j}</text></g></g>`;
// 차트 표식 a:0은 노랑 계열(범주 1번)이다. 표식이 싣는 계열 효과 색(data-effect)과 문서를 만들 때 넣는 겹침(withPulseOverlays)이 실제 문서와 같다.
export const YELLOW = categoryPaint(1);
const effect = `data-effect="${YELLOW.effect}"`;
const chartBody = (y) =>
  withPulseOverlays(
    `<g class="cs-0"><g class="cr-0"><rect data-mark="a:0" data-raw="1" ${effect} x="300" y="${y}" width="40" height="10" fill="${YELLOW.fill}" stroke="${YELLOW.border}" class="bar"/><text data-mark-text="a:0" data-raw="1" ${effect} x="300" y="${y + 30}">1</text></g><g class="cr-1"><rect data-mark="b:0" x="300" y="${y + 20}" width="30" height="5"/></g></g>`,
  );

// 판 0: 도형 a(0)와 b(1)와 c(2), 선 둘, 카드 둘, 값 줄 둘, 차트 c1과 c2. 판 1: 같은 논리 도형 c(3)와 a(4)의 다른 그림과 차트 c1의 다른 그림.
// 재생기가 찾는 id와 class를 실제 그림과 같은 이름으로 쓴다.
const PANEL_0 =
  `${edge(0, 'M120 100 L240 100', false)}${edge(1, 'M340 100 L480 100', true)}` +
  `${node(0, 20, 'a', `<rect class="fl-card" x="20" y="60" width="100" height="80" rx="8" opacity="0"/>${card(0, 0, 'first')}${card(0, 1, 'second')}`)}${node(1, 240, 'b')}${node(2, 480, 'c', valueRow(0, 110) + valueRow(1, 130))}` +
  `<g class="fl-chart" data-chart="c1">${chartBody(150)}</g><g class="fl-chart" data-chart="c2"><g class="cs-0"><rect x="10" y="170" width="20" height="5"/></g></g>` +
  `<g class="fl-packets"></g>${label(0, 150, false)}${label(1, 380, true)}`;
const PANEL_1 =
  `${node(3, 480, 'c', `<g class="fl-value">${valueRow(0, 270)}${valueRow(1, 290)}</g>`)}` +
  `${node(4, 20, 'a', `<rect class="fl-card" x="20" y="260" width="100" height="40" rx="8" opacity="0"/>${card(4, 0, 'first')}${card(4, 1, 'second')}`)}` +
  `<g class="fl-chart" data-chart="c1">${chartBody(250)}</g><g class="fl-packets"></g>`;

const panel = (view, box, body) => `<section class="dp-panel" data-view="${view}" style="--panel-w: ${box.w}; --min-w: ${box.w}px"><svg xmlns="http://www.w3.org/2000/svg" class="fl" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="img">${body}</svg></section>`;
const PANELS = `<div class="dp-panels" style="--view-w: 600">${panel('main', { x: 0, y: 0, w: 600, h: 200 }, PANEL_0)}${panel('side', { x: 0, y: 200, w: 600, h: 120 }, PANEL_1)}</div>`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 글자 수
// basis: estimate
/** 손으로 적은 정본 재생 문서. scenes로 장면별 { mode, speed }를 정하고, 재생기 객체가 window.probe로 열려 있다. */
export function fixtureHtml(scenes, { steps } = {}) {
  const data = fixtureData(scenes);
  if (steps) {
    data.steps = steps;
    data.presentation = presentationOf(steps);
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${STYLES.tokens}${STYLES.control}${STYLES.player}${STYLES.figure}${STYLES.chart}</style></head><body>${figureFrame({ canvas: PANELS })}<script>${PLAYER_SCRIPT}\n${CAPTURE}figurePlay(document.querySelector('.fl-figure'), ${JSON.stringify(data)});</script></body></html>`;
}
