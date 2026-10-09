// 원본 하나를 장면과 시간표로 만든다. 읽기, 차트 값 읽기, 크기, 배치, 시간표(선 길이를 쓰려고 배치 뒤), 그림 검사를 차례로 부른다(docs/architecture.md 그림 만들기).
import { waterfallDataRow } from './source/waterfall.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveBudget } from './budget.js';
import { buildScene } from './build-scene.js';
import { chartCards } from './chart-frames.js';
import { attachIcons } from './icons/index.js';
import { checkLayoutWidth } from './layout/graph.js';
import { findMissingGlyph } from './measure/fonts.js';
import { hasUnpairedBacktick } from './text.js';
import { INTERVAL_TYPES, checkChartLightTargets, checkChartRows, hasRowRule } from './source/chart-rules.js';
import { readFigure } from './source/parse.js';
import { createProblems, FigureError } from './source/problems.js';

// 원소 키. 종류마다 행 이름이 들어 있는 키다.
const LABEL_KEY = { bar: 'label', stacked: 'label', percent: 'label', dumbbell: 'label', difference: 'label', box: 'label', pie: 'label', donut: 'label', scatter: 'name' };

// cost: time O(n + elk + b·(e + s)), heap O(n + s + e), stack O(d), io 1
// vars: n = 원본 글자 수, elk = 배치 시간, b = 박자 수, e = 선 수, s = 도형 수, d = 그룹 깊이
// basis: estimate
/**
 * 원본을 장면과 시간표로 만든다.
 * @param baseDir 차트 카드 `data` 경로의 기준 폴더
 * @param strict 경고도 오류로 올린다
 * @param budget 올린 예산 { 이름: 값 }. 이름 없는 예산은 기본 한도다(src/budget.js)
 * @param layoutWidth 그래프 보기의 배치 목표 폭. 들어가지 못하면 경고하고 글자·도형 크기는 유지한다
 * @returns { figure, scene, timeline, warnings, valueTexts }. scene은 보기마다의 판을 합친 장면(scene.panels, scene.plots, scene.times, scene.chartFrames)이고 timeline은 문서 하나의 시간표다
 * @throws FigureError 원본 오류나 그림 검사 오류가 있을 때. 모든 문제를 담는다
 */
export async function buildFigure(source, { baseDir = '.', strict = false, requireData = false, requireCi = false, budget, layoutWidth } = {}) {
  const limits = resolveBudget(budget);
  const problems = createProblems(source);
  const figure = readFigure(source, problems);
  checkLayoutWidth(figure, layoutWidth, problems);
  for (const card of chartCards(figure)) {
    if (card.plot.chart.data) loadChartData(card.plot, baseDir, problems);
    checkSkillRules(card.plot, { requireData, requireCi }, problems);
  }
  checkGlyphs(figure, problems);
  attachIcons(figure, baseDir, problems);
  problems.throwIfAny();
  const built = await buildScene(figure, { source, limits, layoutWidth }, problems);
  return finish({ figure, ...built }, problems, { strict });
}

// cost: time O(elk + check + n), heap O(n + s + e), stack O(d)
// vars: elk = 배치 시간, check = 그림 검사 시간, n = 시간표 크기, s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
/**
 * 이미 빌드한 문서를 새 폭에 배치한다. 사건·시각은 원본 시간표를 보존하고 그래프 보기의 경로와 글상자 자리, 차트의 그림 폭만 다시 만든다.
 * @param layoutWidth 그래프 보기의 배치 목표 폭(그래프 보기가 있을 때만)
 * @param chartWidth 차트를 그리는 폭. 차트 보기와 차트 카드가 모두 이 폭 이하로 그려진다(차트의 `layout.width`)
 */
export async function reflowFigure(reference, { layoutWidth, chartWidth, strict = false, budget } = {}) {
  const { figure } = reference;
  const problems = createProblems();
  checkLayoutWidth(figure, layoutWidth, problems);
  problems.throwIfAny();
  const limits = resolveBudget(budget);
  const built = await buildScene(figure, { limits, layoutWidth, chartWidth, reference }, problems);
  return finish({ figure, ...built }, problems, { strict });
}

// cost: time O(w), heap O(w), stack O(1)
// vars: w = 경고 수
// basis: estimate
// 경고(strict)를 오류로 올리고, 오류가 없으면 남은 진단과 함께 돌려준다.
function finish(result, problems, { strict }) {
  for (const d of strict ? problems.warnings : []) problems.error(d.line, d.message, { code: d.code, column: d.column });
  problems.throwIfAny();
  return { ...result, warnings: problems.warnings };
}

// cost: time O(j + r·k), heap O(j), stack O(1), io 1
// vars: j = JSON 글자 수, r = 원소 수, k = 원소의 키 수
// basis: estimate
// 차트 카드의 `data "경로" at "/포인터"` 배열을 행으로 바꾼다. 키 대응은 docs/design/charts.md 값 출처 절이다.
function loadChartData(plot, baseDir, problems) {
  const { chart, chartType } = plot;
  const { line } = chart.data;
  let records;
  try {
    records = pointer(JSON.parse(readFileSync(resolve(baseDir, chart.data.path), 'utf8').replace(/^﻿/, '')), chart.data.pointer);
  } catch (error) {
    problems.error(line, `cannot read data "${chart.data.path}" at "${chart.data.pointer}": ${error.message}`);
    return;
  }
  if (!Array.isArray(records)) {
    problems.error(line, `data at "${chart.data.pointer}" is not an array`);
    return;
  }
  const byKey = new Map(chart.series.map((s) => [s.key, s.id]));
  chart.rows = records.map((record, index) => toRow(record, { chart, chartType, byKey, line, index }, problems)).filter(Boolean);
  // 원소를 하나라도 버렸으면 그 오류가 원인이라, 행 수와 행 값 규칙은 보지 않는다. 덧붙는 오류를 막기 위해서다.
  if (chart.rows.length < records.length) return;
  checkChartRows(plot, problems);
  checkChartLightTargets(plot, problems);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 원소의 키 수
// basis: estimate
// 원소 하나를 행으로. 계열 키는 계열 이름으로 바꾸고, 빠진 키와 null은 빠진 값이다.
function toRow(record, { chart, chartType, byKey, line, index }, problems) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    problems.error(line, `data element ${index} must be an object`);
    return undefined;
  }
  if (chartType === 'waterfall') return waterfallDataRow(record, { line, index }, problems);
  const names = chartType === 'heatmap' ? ['row', 'col'] : LABEL_KEY[chartType] ? [LABEL_KEY[chartType]] : [];
  const badName = names.find((key) => typeof record[key] !== 'string');
  if (badName) {
    problems.error(line, `data element ${index} needs a text "${badName}"`);
    return undefined;
  }
  const values = {};
  let label;
  for (const [key, value] of Object.entries(record)) {
    const [base, part] = key.split(/\.(?=low$|high$)/);
    const series = byKey.get(base);
    if (key === LABEL_KEY[chartType]) label = value;
    else if (chartType === 'heatmap' && (key === 'row' || key === 'col')) values[key] = value;
    else if (['scatter', 'ecdf'].includes(chartType) && key === 'series') values.series = byKey.get(String(value)) ?? String(value);
    else if (series) values[part ? `${series}.${part}` : series] = value;
    else if (['x', 'y', 'min', 'q1', 'median', 'q3', 'max', 'value'].includes(key) || (key === 'rule' && hasRowRule(chart, chartType))) values[key] = value;
    else problems.warn(line, `data key "${key}" is not used by a ${chartType} chart`);
  }
  for (const [key, value] of Object.entries(values)) {
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    if (key !== 'series' && key !== 'row' && key !== 'col' && value !== null && !isNumber) problems.error(line, `data element ${index} value "${key}" must be a number or null. Found ${JSON.stringify(value)}`);
  }
  // 빠진 키는 빠진 값이다(막대, 쌓는 막대, 비율, 선, 계단). 선택하지 않은 표본 값은 없다.
  for (const s of byKey.values()) if (['bar', 'stacked', 'percent', 'line', 'step'].includes(chartType) && !(s in values)) values[s] = null;
  if (chartType === 'heatmap') return { label: `${values.row}\u0000${values.col}`, row: values.row, col: values.col, values: { value: values.value }, line };
  return { label, values, line };
}

// cost: time O(r·s), heap O(1), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 문서 스킬이 실험 차트에 거는 규칙. 값 손 기재 금지(예시 데이터 제외)와 신뢰구간.
function checkSkillRules(plot, { requireData, requireCi }, problems) {
  const { chart } = plot;
  const isIllustrative = plot.subtitle?.startsWith('예시 데이터.') ?? false;
  if (requireData && !chart.data && !isIllustrative) problems.error(chart.rows[0]?.line ?? plot.line, 'values must come from data "results/summary.json" at "/..." (--require-data). Hand-written rows are only for subtitles starting with "예시 데이터."');
  if (!requireCi || !INTERVAL_TYPES.includes(plot.chartType)) return;
  for (const row of chart.rows) {
    for (const { id } of chart.series) {
      const hasCi = row.values[`${id}.low`] !== undefined && row.values[`${id}.high`] !== undefined;
      const name = row.label ?? `x=${row.values.x}`;
      if (row.values[id] !== null && !hasCi) problems.error(row.line, `${plot.chartType} "${name}" needs ${id}.low= and ${id}.high= (--require-ci)`);
    }
  }
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 포인터 단계 수
// basis: estimate
// JSON Pointer(RFC 6901)로 값을 찾는다.
function pointer(document, path) {
  if (path === '') return document;
  if (!path.startsWith('/')) throw new Error('a JSON Pointer is "" or starts with "/"');
  return path
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, key) => {
      if (node === undefined || node === null) throw new Error(`no value at "${path}"`);
      return node[key];
    }, document);
}

// cost: time O(n), heap O(t), stack O(d)
// vars: n = 문서 모형의 글 글자 수, t = 글 수, d = 모형 깊이
// basis: estimate
// 그림 글꼴에 없는 글자를 줄 번호와 함께 알린다. 대신 그릴 글꼴의 폭을 알 수 없기 때문이다.
// 모형의 모든 글을 본문 글꼴로, 테이블과 API 칸 타입은 고정폭 글꼴로도 본다. 백틱 구간은 글 안에서 고정폭으로 보고, 짝이 안 맞는 백틱은 오류다. 글 종류를 빠뜨리지 않기 위해 모형 전체를 훑는다.
function checkGlyphs(figure, problems) {
  const texts = [];
  collectTexts(figure.nodes, figure.line ?? 1, texts);
  collectTexts([figure.groups, figure.edges, figure.views, figure.values, figure.steps, figure.title, figure.subtitle], figure.line ?? 1, texts);
  const mono = figure.nodes.flatMap((n) => (n.columns ?? []).map((c) => [c.type, c.line ?? n.line]));
  const reported = new Set();
  for (const [text, line, face] of [...texts.map(([t, l]) => [t, l, 'regular']), ...mono.map(([t, l]) => [t, l, 'mono'])]) {
    if (hasUnpairedBacktick(text) && !reported.has(`${line}\u0000${text}`)) {
      reported.add(`${line}\u0000${text}`);
      problems.error(line, `the backticks in "${text}" are not paired. Close the code span with a second backtick`);
    }
    const missing = text ? findMissingGlyph(text, face) : undefined;
    if (missing === undefined || reported.has(`${line}\u0000${missing}`)) continue;
    reported.add(`${line}\u0000${missing}`);
    problems.error(line, `the font has no glyph for "${missing}". Remove the character`);
  }
}

// cost: time O(n), heap O(t), stack O(d)
// vars: n = 모형 원소 수, t = 글 수, d = 모형 깊이
// basis: estimate
function collectTexts(value, line, out, seen = new Set()) {
  // 차트 행 이름처럼 \u0000으로 이은 안쪽 키는 그리지 않는 글이라 이음 글자를 빼고 본다.
  if (typeof value === 'string') out.push([value.replaceAll('\u0000', ' '), line]);
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    const own = typeof value.line === 'number' ? value.line : line;
    if (Array.isArray(value)) for (const item of value) collectTexts(item, line, out, seen);
    else for (const item of Object.values(value)) collectTexts(item, own, out, seen);
  }
}

export { FigureError };
