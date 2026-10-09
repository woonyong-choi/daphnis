// HTML은 원본 시간표를 유지한 좁은 배치를 함께 싣는다. 브라우저에서 배치나 사건을 다시 계산하지 않는다.
// 좁은 배치는 그래프와 차트 판을 좁은 컨테이너 폭(COMPACT_WIDTH)에 맞춰 다시 만든다. 순서와 시간 판은 다시 만들지 않고 판마다 가로 보기창으로 읽을 수 있는 폭을 지킨다(html.js panelsMarkup).
import { reflowFigure } from '../build.js';
import { COMPACT_WIDTH } from '../canvas.js';
import { values } from '../tokens.js';
import { figureContent } from './content.js';

const REFLOWED = new Set(['graph', 'plot']);

// cost: time O(elk + check + out), heap O(out), stack O(d)
// vars: elk = 배치 시간, check = 그림 검사 시간, out = SVG와 시간표 크기, d = 그룹 깊이
// basis: estimate
/**
 * 좁은 배치의 내용. 다시 만들 판(그래프, 차트) 가운데 컨테이너보다 넓은 판이 없거나 다시 만들어도 좁아지지 않으면 undefined다.
 * 사건과 시각은 원본 시간표와 같고 그래프의 경로와 차트의 그림 폭만 다르다. 그래프의 길 모양이 시각을 보존하지 못하면 차트만 좁힌다.
 */
export async function responsiveContent(result, glyphs) {
  const wide = result.scene.panels;
  if (!wide.some((panel) => REFLOWED.has(panel.strategy) && panel.box.w > COMPACT_WIDTH)) return;
  const hasGraph = result.figure.views.some((view) => view.strategy === 'graph');
  const narrow = await reflowNarrow(result, hasGraph);
  if (!narrow.scene.panels.some((panel, i) => panel.box.w < wide[i].box.w)) return;
  const content = figureContent(narrow, glyphs);
  return { content, timeline: narrow.timeline, breakpoint: values.breakpoint.tablet };
}

// 그래프 보기가 있으면 그래프도 좁은 폭에 배치한다. 새 배치에서 사건 시각을 보존할 수 없으면(layout-timing) 그래프는 두고 차트만 좁힌다.
async function reflowNarrow(result, hasGraph) {
  if (!hasGraph) return reflowFigure(result, { chartWidth: COMPACT_WIDTH });
  try {
    return await reflowFigure(result, { layoutWidth: COMPACT_WIDTH, chartWidth: COMPACT_WIDTH });
  } catch (error) {
    if (!error.problems?.some((d) => d.code === 'layout-timing')) throw error;
    return reflowFigure(result, { chartWidth: COMPACT_WIDTH });
  }
}
