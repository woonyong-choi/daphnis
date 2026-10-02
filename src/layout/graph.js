// 구조, 상태, 데이터 관계 그림을 elkjs로 배치한다. 그룹마다 따로 배치하고, 그룹 경계를 넘는 선은 경계마다 연결점을 거친다(docs/design/layout.md).
import ELK from 'elkjs/lib/elk.bundled.js';
import { values } from '../tokens.js';
import { toElk } from './elk.js';
import { buildModel } from './model.js';
import { isBodyShape, recordPortOrder } from './ports.js';
import { readElk } from './read.js';

const CANVAS = values.size['figure-canvas'];
// 자동 접기에서 비율을 낮춰 다시 배치해 보는 최대 횟수. 배치 시간이 이 횟수만큼 늘 수 있다.
const FOLD_TRIES = 4;

let engine;

// cost: time O(FOLD_TRIES·elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
/**
 * 그림을 배치한다.
 * @param sizes Map<도형 id, sizeNode 결과>
 * @returns { items, groups, edges, width, height }. items는 도형 사각형(배치 사각형과 바깥 여백), edges는 경로 점과 라벨 자리
 */
export async function layoutGraph(figure, sizes) {
  engine ??= new ELK();
  const model = buildModel(figure, sizes);
  // 사람과 원통은 두 번 배치한다. 처음에는 연결점 순서를 elkjs에 맡기고, 그 순서대로 몸통 범위에 연결점을 고정해 다시 배치한다.
  // 순서를 미리 정하면 선이 엇갈리고, 맡기기만 하면 연결점이 머리나 뚜껑 자리에 놓이기 때문이다.
  const hasBodyPorts = [...model.nodes.values()].some((n) => isBodyShape(n) && n.ports.length);
  if (hasBodyPorts) recordPortOrder(await engine.layout(toElk(model, figure)), model);
  let laid = await engine.layout(toElk(model, figure));
  if (laid.width > CANVAS && figure.aspect === undefined) laid = await foldNarrowest(model, figure, laid);
  return readElk(laid, model);
}

// cost: time O(FOLD_TRIES·elk(s + e)), heap O(s + e), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
// 표준 캔버스 폭보다 넓고 aspect를 적지 않았으면, 자동 비율로 접어 다시 배치한다. 폭에 들 때까지 비율을 낮춰 가며 FOLD_TRIES번까지 보고, 가장 좁은 배치를 쓴다.
// 그래도 넓으면 표시 폭만 줄인다(docs/design/layout.md 그림 크기).
async function foldNarrowest(model, figure, flat) {
  let laid = flat;
  let aspect = values.scale['fold-aspect'];
  for (let i = 0; i < FOLD_TRIES && laid.width > CANVAS; i++, aspect *= values.scale['fold-step']) {
    const folded = await engine.layout(toElk(model, { ...figure, aspect }));
    if (folded.width < laid.width) laid = folded;
  }
  return laid;
}
