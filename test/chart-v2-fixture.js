// 차트 v2 시험이 함께 쓰는 정규 차트 입력(IR) 만들기. 원본 해석기를 거치지 않고 차트 그리기가 받는 모양을 직접 만든다.
// 그래서 이 입력으로 확인하는 것은 순수 계산과 그리기 기하이고, 원본에서 그림까지 이어지는 흐름(E2E)은 해석기가 같은 모양을 만든 뒤에 확인한다.
import { drawChart } from '../src/chart/draw.js';
import { prepareParts } from '../src/source/parts.js';
import { prepareHistogram } from '../src/source/histogram.js';

/** 계열 목록 [id, 이름, 역할?]을 계열 입력으로 */
export const seriesOf = (list) => list.map(([id, label, role]) => ({ id, label, key: id, role, line: 1 }));

/** 계열 id, 이름 목록: `names(3)`은 a, b, c 세 계열 */
export const names = (count) => Array.from({ length: count }, (_, i) => [String.fromCharCode(97 + i), `계열 ${String.fromCharCode(65 + i)}`]);

/**
 * 차트 그리기가 받는 모형 하나. 종류가 원·도넛·히스토그램이면 원본 해석기와 같은 준비 단계(비율, 구간)를 거친다.
 * @param chart 차트 입력에 덮어쓸 값(rows, series, rules, x, y, layout, extent ...)
 */
export function figureOf(chartType, { title = '제목', subtitle, series = [], rows = [], ...chart }) {
  const figure = {
    chartType,
    title,
    subtitle,
    line: 1,
    chart: { series: seriesOf(series), rules: [], missing: undefined, x: undefined, y: undefined, scale: 'linear', zero: 'on', decimals: undefined, rows: rows.map((row, i) => ({ line: i + 2, ...row })), links: [], ...chart },
  };
  const problems = { error: (line, message) => { throw new Error(`${line}: ${message}`); } };
  if (chartType === 'pie' || chartType === 'donut') prepareParts(figure, problems);
  if (chartType === 'histogram') prepareHistogram(figure, problems);
  return figure;
}

/** 행 목록: 이름과 계열 값 목록 */
export const barRows = (list) => list.map(([label, ...values]) => ({ label, values: Object.fromEntries(values.map((v, i) => [String.fromCharCode(97 + i), v])) }));

/** 선 차트 행: x와 계열 값 목록 */
export const pointRows = (list) => list.map(([x, ...values]) => ({ values: { x, ...Object.fromEntries(values.map((v, i) => [String.fromCharCode(97 + i), v])) } }));

/** 누적분포 표본: 값 목록 또는 [값, 계열 id] 목록 */
export const sampleRows = (list) => list.map((item) => ({ values: Array.isArray(item) ? { value: item[0], series: item[1] } : { value: item } }));

export { drawChart };

/** SVG 글에서 속성 값을 모두 모은다 */
export const attrsOf = (svg, name) => [...svg.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);

/** 클래스를 가진 요소의 글 */
export const textsOf = (svg, className) => [...svg.matchAll(new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1]);
