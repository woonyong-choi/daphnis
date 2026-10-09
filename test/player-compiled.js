// 컴파일러로 만든 재생기 HTML을 Chrome 시험에 넘기는 도구와, 시험이 쓰는 daphnis 2 원본. Chrome과 상태 읽기는 chrome.js가 맡고, 이 파일은 컴파일러(src/build.js)가 필요한 부분만 둔다.
// 단계는 원본의 `scene "이름" mode= speed=`가 정한다. 컴파일러가 내는 단계 값을 시험에서 바꾸지 않는다.
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { CAPTURE } from './chrome.js';

export { CHROME, launchChrome, readState, withPage } from './chrome.js';

/** 값 카드가 도착하면 1, 2로 늘어나는 두 장면 흐름. */
export const FLOW = 'daphnis 2\nbox a "A"\nbox b "B"\nvalue n "Count" on=b\non b n+1\na -> b\nscene "First" mode=once\n  a -> b time=300ms\nscene "Last" mode=once\n  a -> b time=300ms\n';
export const MULTI = 'daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\nvalue n "Count" on=c\non c n+1\na -> b\nb -> c\nscene "One" mode=once\n  a -> b time=300ms\n  b -> c time=300ms\nscene "Two" mode=once\n  a -> b time=300ms\n';
export const SINGLE = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "Only" mode=once\n  a -> b time=300ms\n';
export const NO_TIME = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\n';
export const LONG_TABS = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "첫 번째 단계 이름은 아주 길게 쓸 수 있다"\n  a -> b\nscene "두 번째 단계도 마찬가지로 길다"\n  a -> b\nscene "세 번째"\n  a -> b\nscene "네 번째 단계의 이름"\n  a -> b\n';

/**
 * 그래프 보기, 같은 카드를 담은 순서 보기, 값에 묶인 막대 차트가 그래프에도 차트 보기에도 그려진 판 셋의 혼합 그림.
 * 같은 논리 카드(web, api, db)가 그래프와 순서 두 판에 있고, 같은 차트 load가 그래프 카드와 차트 판에 있다. 값 depth는 db 카드에 있고 차트 load가 읽는다.
 * 장면: 한 번 재생(값이 오르고 차트 틀이 바뀜), 반복, 정지.
 */
export const MIXED = [
  'daphnis 2',
  'title "혼합 그림"',
  'box web "웹"',
  'box api "API"',
  'store db "DB"',
  'value depth "깊이" on=db from=2',
  'chart load "부하" bar {',
  '  series ms "지연"',
  '  row "now" ms=depth',
  '  row "max" ms=6',
  '}',
  'view main graph right "구조" {',
  '  web',
  '  api',
  '  db',
  '  load',
  '}',
  'view calls sequence "호출" {',
  '  web',
  '  api',
  '  db',
  '}',
  'view chart plot "차트" {',
  '  load',
  '}',
  'web -> api',
  'api -> db',
  'scene "한 번" mode=once',
  '  web -> api "주문" time=600ms',
  '  api -> db "저장" time=600ms set="depth+1"',
  '  light load "now"',
  'scene "반복" mode=loop speed=2',
  '  web -> api "주문" time=400ms',
  '  api -> db "저장" time=400ms set="depth+1"',
  'scene "정지" mode=static',
  '  show db "끝"',
  '',
].join('\n');

/**
 * 원본의 재생기 HTML. probe가 참이면 재생기 객체를 window.probe로 꺼내 안쪽 상태를 읽는다.
 * @returns { html, result }. result는 buildFigure의 결과(시간표와 장면)다.
 */
export async function playerHtml(source, { probe = true, baseDir } = {}) {
  const result = await buildFigure(source, baseDir ? { baseDir } : {});
  const html = await toHtml(result, 'scene');
  const instrumented = probe ? html.replace("figurePlay(document.querySelector('.fl-figure'),", `${CAPTURE}figurePlay(document.querySelector('.fl-figure'),`) : html;
  return { html: instrumented, result, timeline: result.timeline };
}
