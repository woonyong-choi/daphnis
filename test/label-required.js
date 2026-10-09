// 직접 라벨이 필요한 색 이름. 계열의 경계가 대비 3에 못 미치는 모드에서, 색 이름의 테두리와 윤곽이 그 계열의 경계 값이면 대비 3 대신 직접 라벨이 뜻을 전한다.
// 토큰이 정한다: 계열별 `color.data.category-label`이 required이고 그 모드의 경계가 어떤 면 위에서 3에 못 미칠 때만이다.
import { contrast } from '../src/contrast.js';
import { values } from '../src/tokens.js';
import { themeColor } from './helpers.js';

const GRAPHIC = 3;
const FACES = ['bg', 'node', 'surface', 'card', 'group-1', 'group-2', 'group-3', 'page'];

// cost: time O(n·f), heap O(1), stack O(1)
// vars: n = 계열 수, f = 면 수
// basis: estimate
/** 색 이름 `name`의 윤곽(outline)이 `theme`에서 직접 라벨이 필요한 계열의 경계인지. */
export function isLabelRequired(theme, name) {
  const outline = themeColor(theme, `paint.${name}.outline`);
  return Object.entries(values.color.data['category-family']).some(([number, family]) => {
    const border = themeColor(theme, `category.${family}.${theme}-border`);
    return values.color.data['category-label'][number] === 'required' && border === outline && FACES.some((face) => contrast(border, themeColor(theme, face)) < GRAPHIC);
  });
}
