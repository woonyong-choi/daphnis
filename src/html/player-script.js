// 재생기 문서의 고정 부분: 브라우저 스크립트(src/player/)를 한 글로 이어 붙인 것과 그림 틀 마크업. 컴파일러(build)에 기대지 않아 재생기 시험이 이 모듈로 같은 문서 틀을 만든다.
import { readFileSync } from 'node:fs';
import { CONTROL_ICONS } from '../icons/controls.js';

// 브라우저 스크립트 파일(src/player/). 한 스크립트로 이어 붙여 HTML에 넣는다. 순서는 상수와 함수 선언이 쓰이기 전에 있어야 하는 곳만 지키면 된다(진입은 맨 끝의 figurePlay 호출).
const PLAYER_FILES = ['view', 'export', 'play', 'controls', 'stage', 'effects', 'responsive', 'curve', 'sample', 'values'];
// 내려받기용 정본 템플릿을 넣어 두는 문서 머리 meta 칸의 이름. 재생기 스크립트(player/export.js)가 같은 이름을 읽는다.
export const CANONICAL_NAME = 'daphnis-canonical';
// 조작부 전용 글리프를 재생기 앞에 붙인다. 크기와 선 굵기는 simple2 토큰을 따른다.
const UI_ICON_SCRIPT = `const UI_ICONS = ${JSON.stringify(CONTROL_ICONS).replace(/</g, '\\u003c')};\nconst CANONICAL_NAME = ${JSON.stringify(CANONICAL_NAME)};\n`;
export const PLAYER_SCRIPT = UI_ICON_SCRIPT + PLAYER_FILES.map((name) => readFileSync(new URL(`../player/${name}.js`, import.meta.url), 'utf8')).join('\n');

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 원 단추 하나. 내려받기, 전체 화면, 확대·축소가 모두 이 구성을 쓴다. 아이콘은 player/view.js와 player/export.js가 그린다.
function roundButton(extraClass, { label, zoom } = {}) {
  const className = extraClass ? `fl-round ${extraClass}` : 'fl-round';
  const labelAttr = label ? ` aria-label="${label}"` : '';
  const zoomAttr = zoom ? ` data-zoom="${zoom}"` : '';
  return `<button type="button" class="${className}"${zoomAttr}${labelAttr}></button>`;
}

// 도구 막대: HTML 내려받기, 전체 화면(맨 오른쪽), 그리고 전체 화면에서만 보이는 확대·축소 단추. 재생을 다루는 단추는 두지 않는다.
const VIEW_BUTTONS =
  `<div class="fl-view-tools" role="toolbar" aria-label="그림 도구">${roundButton('fl-download', { label: 'HTML 내려받기' })}${roundButton('fl-full')}` +
  `<div class="fl-zoom">${roundButton('', { label: '확대', zoom: 'in' })}${roundButton('', { label: '축소', zoom: 'out' })}${roundButton('', { label: '전체 보기', zoom: 'fit' })}</div></div>`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 그림 글자 수
// basis: estimate
/**
 * 그림 틀(figure). 장면 탭 줄은 비어 있고 재생기가 채운다. 재생 조작 단추는 없다.
 * @param canvas 그림 영역 안쪽 마크업(판 묶음, html.js panelsMarkup)
 * @param className figure 요소에 더할 class(앞에 공백 포함, 없으면 빈 글)
 * @param style figure 요소에 더할 속성 글(앞에 공백 포함, 없으면 빈 글)
 * @param narrow 좁은 배치의 판 묶음을 담은 template 글(없으면 빈 글)
 */
export function figureFrame({ canvas, className = '', style = '', narrow = '' }) {
  return `<figure class="fl-figure${className}" tabindex="0"${style}>
<p class="fl-scroll-hint" hidden>그림을 좌우로 밀어 보세요. 전체 화면에서 확대할 수 있습니다.</p>
<div class="fl-surface">
${VIEW_BUTTONS}
<div class="fl-canvas" role="region" aria-label="그림">${canvas}</div>
</div>
${narrow}
<figcaption class="fl-foot">
<div class="fl-tabs" role="tablist" aria-label="장면 선택"></div>
</figcaption>
</figure>`;
}
