// 그림 표시 폭 규칙. 모든 그림은 같은 표준 캔버스 폭으로 보인다(docs/design/layout.md 그림 크기).
import { values } from './tokens.js';

/** 구조, 순서, 상태, 데이터 그림과 전체 폭 차트의 표시 폭 */
export const CANVAS = values.size['figure-canvas'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 내용 크기에서 viewBox 폭과 표시 크기를 정한다.
 * 내용이 canvas보다 좁으면 viewBox만 canvas로 넓혀 가운데에 두고, 넓으면 viewBox는 내용 폭 그대로 두고 표시 폭만 canvas로 줄인다(글자도 같은 비율로 작아진다).
 * @param width 내용 너비
 * @param height 내용 높이(캡션 포함)
 * @returns { viewWidth, shownWidth, shownHeight, scale }. scale은 내용이 줄어드는 비율이고 1이면 줄지 않는다
 */
export function fitCanvas(width, height) {
  const canvas = CANVAS;
  const viewWidth = Math.max(width, canvas);
  const scale = canvas / viewWidth;
  return { viewWidth, shownWidth: canvas, shownHeight: height * scale, scale };
}
