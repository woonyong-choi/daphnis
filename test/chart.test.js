// 차트: 값 읽기와 오류, 계열 역할, 숫자 글자, 그리기 위치와 맞춤, 계열 드러내기(docs/design/charts.md).
// 차트는 카드 하나(`chart id "제목" 종류 { ... }`)이고 장면의 `reveal 차트.계열`, `light 차트 ...`가 움직인다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { headReach } from '../src/draw/arrow.js';
import { curveOf, timeAt } from '../src/easing.js';
import { formatChange, formatNumber, makeScale, valueFormat } from '../src/chart/scale.js';
import { measure } from '../src/measure/fonts.js';
import { parseFigure } from '../src/source/parse.js';
import { VALUES } from '../src/source/grammar.js';
import { parseTime } from '../src/source/values.js';
import { toSvg } from '../src/svg.js';
import { tokens, values } from '../src/tokens.js';
import { chartOf, formatProblem, withFolder } from './helpers.js';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const ASSETS = new URL('../docs/assets/', import.meta.url);

// 차트 카드 하나만 있는 둘째 판 원본. 블록 안 첫 줄이 3번째 줄이다(1: daphnis 2, 2: chart 줄). tail은 블록 뒤 장면 줄이다.
const doc = (type, lines, tail = '') => `daphnis 2\nchart c "차트" ${type} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n${tail}`;

// cost: time O(build), heap O(m), stack O(1)
// vars: build = 원본 하나를 만드는 비용, m = 메시지 수
// basis: estimate
// 원본을 만들 때 나는 오류를 `줄: [코드] 메시지`로 돌려준다. 오류가 없으면 빈 목록이다.
async function problemsOf(source, options) {
  try {
    await buildFigure(source, options);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(formatProblem);
  }
}

const bodyOf = async (source, options) => chartOf(await buildFigure(source, options)).body;
const textsOf = (svg, className) => [...svg.matchAll(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1]);
const legendOf = (body) => [...body.matchAll(/class="chart-legend">([^<]+)</g)].map((m) => m[1]);
const SERIES_ROLES = ['series a "A" role=main', 'series b "B" role=compare'];
const BAR_LINES = ['x "값(%)"', ...SERIES_ROLES, 'row "r" a=5 b=3'];
const BAR = doc('bar', BAR_LINES);
const SWAPPED_BAR = doc('bar', ['x "값(%)"', 'series b "B" role=compare', 'series a "A" role=main', 'row "r" a=5 b=3']);

const EXAMPLES = new URL('../examples/', import.meta.url);
const PAD = 28;
const TOLERANCE = 1;

// 글 종류(class)마다 글자 크기, 글꼴, 정렬. src/chart/*.js와 styles/chart.css가 정한 값이다. 글자는 제목 15, 본문과 필드 13, 메타 11의 세 역할이다.
const TEXT_STYLES = [
  ['chart-title', 15, 'semibold'],
  ['chart-sub', 11, 'regular'],
  ['chart-legend', 11, 'regular'],
  ['chart-label', 13, 'regular'],
  ['chart-ratio', 13, 'numSemibold'],
  ['chart-seg-key', 11, 'numSemibold'],
  ['chart-end-label', 11, 'medium'],
  ['chart-value', 11, 'num'],
  ['chart-tick', 11, 'num'],
  ['chart-cell', 11, 'num'],
  ['chart-unit', 11, 'regular'],
  ['chart-missing', 11, 'regular'],
  ['chart-name', 11, 'regular'],
  ['chart-rule-label', 11, 'regular'],
];

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글 글자 수
// basis: estimate
// 글자 요소 하나가 차지하는 가로 구간 [왼쪽, 오른쪽]
function textSpan(x, className, text) {
  const [, size, face] = TEXT_STYLES.find(([name]) => className.split(' ').includes(name));
  const isBold = className.includes('ours') || className.includes('second');
  const width = measure(text.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&'), size, isBold && face === 'num' ? 'numSemibold' : face);
  const tokens = className.split(' ');
  const isEnd = tokens.includes('end') || tokens.includes('chart-unit') && !tokens.includes('start') || tokens.includes('chart-ratio');
  const isMiddle = !isEnd && (tokens.includes('chart-tick') || tokens.includes('chart-cell'));
  if (isEnd) return [x - width, x];
  if (isMiddle) return [x - width / 2, x + width / 2];
  return [x, x + width];
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 요소 수
// basis: estimate
/** 차트 SVG 조각의 글자와 도형이 닿는 가로 구간 */
function extentOf(body) {
  const spans = [];
  for (const m of body.matchAll(/<text x="([\d.-]+)"[^>]*class="([^"]+)">(.*?)<\/text>/g)) spans.push(textSpan(Number(m[1]), m[2], m[3]));
  // 글자 바탕 사각형(chart-text-bg)은 글 자리에 덧대는 바탕이다. 여백은 글자 자신의 할당 폭(위 spans)으로 재므로 바탕은 세지 않는다.
  for (const m of body.matchAll(/<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"([^>]*)>/g)) if (!/chart-text-bg/.test(m[3])) spans.push([Number(m[1]), Number(m[1]) + Number(m[2])]);
  for (const m of body.matchAll(/<circle cx="([\d.-]+)" cy="[\d.-]+" r="([\d.]+)"/g)) spans.push([Number(m[1]) - Number(m[2]), Number(m[1]) + Number(m[2])]);
  for (const m of body.matchAll(/<line x1="([\d.-]+)" x2="([\d.-]+)"/g)) spans.push([Number(m[1]), Number(m[2])].sort((a, b) => a - b));
  return { left: Math.min(...spans.map(([a]) => a)), right: Math.max(...spans.map(([, b]) => b)) };
}

// 지원하는 모든 차트 종류의 가장 작은 입력. 여백 시험이 종류마다 하나씩 그린다.
const MINIMAL = {
  bar: ['x "값(%)"', 'series a "A"', 'row "r" a=3', 'row "s" a=5'],
  stacked: ['x "값(%)"', 'series a "A"', 'series b "B"', 'row "r" a=3 b=2', 'row "s" a=5 b=1'],
  percent: ['x "비율(%)"', 'series a "A"', 'series b "B"', 'row "r" a=3 b=2', 'row "s" a=5 b=1'],
  dumbbell: ['x "값(%)"', 'series a "전" role=compare', 'series b "후" role=main', 'row "r" a=1 b=3'],
  box: ['x "시간(ms)"', 'row "a" min=1 q1=2 median=3 q3=4 max=5'],
  scatter: ['x "가(%)"', 'y "나(%)"', 'point "p" x=1 y=2', 'point "q" x=3 y=1'],
  line: ['x "주차"', 'y "점수(%)"', 'series a "A"', 'point x=1 a=1', 'point x=2 a=2'],
  step: ['x "주차"', 'y "점수(%)"', 'series a "A"', 'point x=1 a=1', 'point x=2 a=2'],
  area: ['x "주차"', 'y "점수(%)"', 'series a "A"', 'point x=1 a=1', 'point x=2 a=2'],
  ecdf: ['x "지연(ms)"', 'sample 1', 'sample 2', 'sample 4'],
  difference: ['x "차이(%p)"', 'series d "차이"', 'row "r" d=2 d.low=1 d.high=3'],
  heatmap: ['cell "a" "x" 1', 'cell "a" "y" 2'],
  pie: ['row "a" value=3', 'row "b" value=5'],
  donut: ['row "a" value=3', 'row "b" value=5'],
  histogram: ['x "지연(ms)"', 'bins 0 4 2', 'sample 1', 'sample 3'],
  waterfall: ['x "값(ms)"', 'row "시작" value=5', 'row "증가" value=2', 'total "합계"'],
};

// 근거: 설계 charts.md 요구사항 "숫자와 비율 글자가 반올림 규칙을 따른다"
test('formatNumber_and_formatChange_round_half_away_and_use_k_and_M', () => {
  assert.deepEqual([120000, 1250, 999950, 0.012, 91.4].map(formatNumber), ['120k', '1.3k', '1M', '0.012', '91.4']);
  assert.deepEqual([formatChange(120000, 31000), formatChange(100, 114), formatChange(200, 59), formatChange(0, 5)], ['−74%', '+14%', '−71%', '']);
});

// 근거: 설계 charts.md 눈금 "log 눈금은 10의 거듭제곱", 버그 68ec356 "지수 표기 수의 눈금 NaN"
test('makeScale_log_ticks_are_powers_of_ten_and_tiny_ranges_give_finite_ticks', () => {
  assert.deepEqual(makeScale('log', { min: 28000, max: 120000, start: 0, length: 100 }).ticks, [10000, 100000, 1000000]);
  assert.ok(makeScale('linear', { min: 0.000001, max: 0.000002, start: 0, length: 100 }).ticks.every(Number.isFinite));
});

const REJECTED = [
  // 설계 charts.md 요구사항 "그릴 수 없는 값과 계열 수를 줄 번호와 함께 막는다"
  { rule: '막대에 log', source: doc('bar', ['scale log', 'series a "A"', 'row "r" a=1']), expect: /scale log is not allowed/ },
  { rule: '음수 값', source: doc('bar', ['series a "A"', 'row "r" a=-1']), expect: /negative/ },
  { rule: '덤벨 계열 수', source: doc('dumbbell', ['series a "A"', 'row "r" a=1']), expect: /takes 2 series/ },
  // 빠진 값 `-`는 막대, 누적, 비율, 상자, 선, 계단, 누적분포, 히스토그램, 워터폴만 받는다(상자, 히스토그램, 워터폴은 아래 ACCEPTED와 edgecase-final)
  { rule: '덤벨의 값 없음 표기', source: doc('dumbbell', ['series a "A" role=compare', 'series b "B" role=main', 'row "r" a=- b=3']), expect: /"-" \(missing\) is only for the values of bar, stacked, percent, box, line, step, ecdf, histogram, waterfall charts\. Found a=-/, count: 1 },
  { rule: '산점도의 값 없음 표기', source: doc('scatter', ['point "p" x=1 y=-']), expect: /"-" \(missing\) is only for the values of .* charts\. Found y=-/, count: 1 },
  { rule: '음수 기준선', source: doc('bar', ['series a "A"', 'rule -10 "neg"', 'row "p" a=5']), expect: /a rule cannot be negative/ },
  { rule: '막대 행 기준 음수', source: doc('bar', ['series a "A"', 'row "r" a=5 rule=-1']), expect: /a row rule cannot be negative/ },
  { rule: '막대가 아닌 종류의 행 기준', source: doc('dumbbell', ['series a "A" role=compare', 'series b "B" role=main', 'row "r" a=5 b=3 rule=4']), expect: /"rule" is not a value of a dumbbell chart/ },
  { rule: '차이 차트에 log', source: doc('difference', ['scale log', 'series a "A"', 'row "r" a=1']), expect: /scale log is not allowed/ },
  { rule: '차이 차트 계열 수', source: doc('difference', ['series a "A"', 'series b "B"', 'row "r" a=1 b=2']), expect: /takes 1 series. Found 2/ },
  { rule: '0 시작 해제는 선 차트만(막대)', source: doc('bar', ['zero off', 'series a "A"', 'row "r" a=1']), expect: /zero off is only for line and step charts/ },
  { rule: '0 시작 해제는 선 차트만(산점도)', source: doc('scatter', ['zero off', 'point "p" x=1 y=2']), expect: /zero off is only for line and step charts/ },
  { rule: '0 시작 값 모양', source: doc('line', ['zero maybe', 'series a "A"', 'point x=1 a=2']), expect: /zero is "on" or "off"/ },
  { rule: '히트맵의 값 축', source: doc('heatmap', ['scale linear', 'cell "a" "b" 1']), expect: /^3: a heatmap has no value axis/m },
  { rule: '소수 자릿수 범위(7)', source: doc('heatmap', ['decimals 7', 'cell "a" "x" 1']), expect: /whole number from 0 to 6/ },
  { rule: '소수 자릿수 범위(-1)', source: doc('heatmap', ['decimals -1', 'cell "a" "x" 1']), expect: /whole number from 0 to 6/ },
  { rule: '소수 자릿수 범위(1.5)', source: doc('heatmap', ['decimals 1.5', 'cell "a" "x" 1']), expect: /whole number from 0 to 6/ },
  { rule: '소수 자릿수 범위("2")', source: doc('heatmap', ['decimals "2"', 'cell "a" "x" 1']), expect: /whole number from 0 to 6/ },
  // 설계 charts.md 요구사항 "드러내지 않는 계열과 거꾸로 된 드러내기를 막는다"
  { rule: '덤벨은 compare를 먼저 드러냄', source: doc('dumbbell', ['x "값(%)"', 'series ours "O" role=main', 'series base "B" role=compare', 'row "r" ours=2 base=9'], 'scene "s"\n  reveal c.ours\n  reveal c.base\n'), expect: /reveal "base" before "ours". The arrow starts from the compare series/ },
  // 설계 charts.md 요구사항 "계열 역할: main과 compare는 각각 하나 이하이고 reference는 기대값 계열이다"
  { rule: 'main 둘', source: doc('bar', ['x "값(%)"', 'series a "A" role=main', 'series b "B" role=main', 'row "r" a=1 b=2']), expect: /one role=main and one role=compare/ },
  { rule: 'compare 둘', source: doc('bar', ['x "값(%)"', 'series a "A" role=compare', 'series b "B" role=compare', 'row "r" a=1 b=2']), expect: /one role=main and one role=compare/ },
  { rule: '셋 이상에서 main 둘', source: doc('bar', ['x "값(%)"', 'series a "A" role=main', 'series b "B" role=main', 'series c "C"', 'row "r" a=1 b=2 c=3']), expect: /a chart takes at most one series with role=main/ },
  { rule: '셋 이상에서 compare 둘', source: doc('bar', ['x "값(%)"', 'series a "A" role=compare', 'series b "B" role=compare', 'series c "C"', 'row "r" a=1 b=2 c=3']), expect: /a chart takes at most one series with role=compare/ },
  { rule: '모든 계열이 reference', source: doc('bar', ['x "값(%)"', 'series a "A" role=reference', 'series b "B" role=reference', 'row "r" a=1 b=2']), expect: /every series is role=reference/ },
  { rule: '누적에 reference', source: doc('stacked', ['x "값(%)"', 'series a "A"', 'series b "B" role=reference', 'row "r" a=1 b=2']), expect: /a stacked chart has no expected-value series, so role=reference is not allowed/ },
  { rule: '모르는 역할', source: doc('bar', ['x "값(%)"', 'series a "A" role=other', 'series b "B" role=compare', 'row "r" a=1 b=2']), expect: /role is one of main, compare, reference. Found "other"/ },
  { rule: '계열 하나가 compare면 main이 없음', source: doc('bar', ['x "값(%)"', 'series a "A" role=compare', 'row "r" a=1']), expect: /one series shows it as main/ },
  // 설계 charts.md 요구사항 "신뢰구간을 세 종류가 같은 규칙으로 받는다(순서 오류, 짝 오류)"와 상자 사분위 순서
  { rule: '막대 신뢰구간 순서', source: doc('bar', ['series a "A"', 'row "r" a=5 a.low=6 a.high=7']), expect: /./, count: 1 },
  { rule: '덤벨 신뢰구간 순서', source: doc('dumbbell', ['series a "A" role=compare', 'series b "B" role=main', 'row "r" a=5 a.low=6 a.high=7 b=3']), expect: /./, count: 1 },
  { rule: '선 신뢰구간 짝', source: doc('line', ['series a "A"', 'point x=1 a=2 a.low=1']), expect: /./, count: 1 },
  { rule: '상자 사분위 순서', source: doc('box', ['row "a" min=10 q1=5 median=3 q3=2 max=1']), expect: /./, count: 1 },
  { rule: '막대 구간 순서와 짝', source: doc('bar', ['series a "A"', 'row "p" a=50 a.low=60 a.high=40', 'row "q" a=50 a.low=40']), expect: /./, count: 2 },
  { rule: '산점도는 구간 키를 받지 않음', source: doc('scatter', ['point "p" x=1 y=2 y.low=1 y.high=3']), expect: /"y\.low" is not a value of a scatter chart/ },
  // 설계 charts.md 요구사항 "두 강제 선택 사항이 행 줄과 빠진 신뢰구간을 막는다"는 아래 require 테스트
];

// 근거: 설계 charts.md 요구사항 "그릴 수 없는 값과 계열 수를 줄 번호와 함께 막는다", 계열 역할, 신뢰구간 규칙(위 표의 rule 칸에 행별로 적음)
test('buildFigure_chart_rules_reject_values_that_cannot_be_drawn', async () => {
  for (const { rule, source, expect, count } of REJECTED) {
    const errors = await problemsOf(source);

    assert.match(errors.join('\n'), expect, rule);
    if (count) assert.equal(errors.length, count, `${rule}: ${errors.join(' | ')}`);
  }
});

const ACCEPTED = [
  // 설계 charts.md 요구사항 "그릴 수 없는 값": 선과 산점도는 0과 log 눈금의 x 0을 받는다(4750504)
  { form: '선 차트 log 눈금은 x 값을 보지 않음', source: doc('line', ['scale log', 'series a "A"', 'point x=0 a=1', 'point x=1 a=10']) },
  { form: '모두 0인 선', source: doc('line', ['series a "A"', 'point x=1 a=0', 'point x=2 a=0']) },
  // 설계 charts.md 요구사항 "빠진 값과 0": 값이 모두 0이어도 모두 빠져도 오류가 아니다(옛 규칙은 모두 0인 막대와 숫자가 없는 막대를 막았다)
  { form: '모두 0인 막대', source: doc('bar', ['x "값(%)"', 'series a "A"', 'row "p" a=0']) },
  // 설계 charts.md: 상자, 히스토그램, 워터폴도 값 자리에 `-`를 받는다(빠진 값은 0이 아니다)
  { form: '상자의 빠진 최솟값', source: doc('box', ['x "시간(ms)"', 'row "r" min=- q1=1 median=2 q3=3 max=4']) },
  { form: '히스토그램의 빠진 표본', source: doc('histogram', ['x "지연(ms)"', 'bins 0 4 2', 'sample 1', 'sample -']) },
  { form: '워터폴의 빠진 증감', source: doc('waterfall', ['x "값(ms)"', 'row "시작" value=5', 'row "증가" value=-', 'total "합계"']) },
  // 계열 둘이고 role을 생략하면 선언 순서대로 역할을 받는다(첫 계열이 먼저 드러난다)
  { form: '역할 없는 덤벨은 첫 계열을 먼저 드러냄', source: doc('dumbbell', ['x "값(%)"', 'series base "전"', 'series ours "후"', 'row "r" base=9 ours=2'], 'scene "s"\n  reveal c.base\nscene "t"\n  reveal c.ours\n') },
  { form: '계열 하나만 role을 적음', source: doc('bar', ['x "값(%)"', 'series a "A" role=main', 'series b "B"', 'row "r" a=1 b=2']) },
  { form: '계열 하나는 role 생략', source: doc('bar', ['x "값(%)"', 'series a "A"', 'row "r" a=1']) },
  // 설계 charts.md: 막대와 선은 compare를 main보다 먼저 드러낼 수 있다
  { form: '막대는 compare를 먼저 드러냄', source: `${BAR}scene "전"\n  reveal c.b\nscene "후"\n  reveal c.a\n` },
];

// 근거: 설계 charts.md 요구사항 "그릴 수 없는 값"의 반대 경계와 계열 역할(위 표의 form 칸에 행별로 적음)
test('buildFigure_chart_valid_forms_read_without_errors', async () => {
  for (const { form, source } of ACCEPTED) assert.deepEqual(await problemsOf(source), [], form);
});

// 근거: 설계 charts.md 요구사항 "그릴 수 없는 값": data JSON 원소의 숫자 아닌 값, 빠진 이름, 잘못된 JSON Pointer(68ec356, 4750504)
test('loadChartData_non_number_value_missing_name_and_pointer_without_slash_are_errors', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'bad.json'), '﻿[{"label":"x","a":"12"},{"a":1}]');

    const bad = await buildFigure(doc('bar', ['series a "A"', 'data "bad.json"']), { baseDir: folder }).catch((e) => e);
    const pointer = await buildFigure(doc('bar', ['series a "A" key="new_judge"', 'data "summary.json" at "rows"']), { baseDir: FIXTURES }).catch((e) => e);

    assert.deepEqual(bad.problems.map((p) => p.message), ['data element 0 value "a" must be a number or null. Found "12"', 'data element 1 needs a text "label"']);
    assert.ok(pointer.problems.some((p) => p.message.includes('starts with "/"')), JSON.stringify(pointer.problems));
  });
});

const BAR_DATA = [doc('bar', ['series ours "O" key="new_judge"', 'row "A" ours=3.1 ours.low=2.2 ours.high=4.3']), doc('bar', ['data "summary.json" at "/rows"', 'series ours "O" key="new_judge"'])];
const LINE_DATA = [doc('line', ['series s "S" key="new_judge"', 'point x=1 s=12 s.low=10 s.high=14', 'point x=2 s=8 s.low=6 s.high=9']), doc('line', ['series s "S" key="new_judge"', 'data "summary.json" at "/weeks"'])];
const DUMBBELL_DATA = [
  doc('dumbbell', ['series a "A" key="before" role=compare', 'series b "B" key="after" role=main', 'row "A" a=120000 a.low=100000 a.high=140000 b=30000 b.low=25000 b.high=36000']),
  doc('dumbbell', ['series a "A" key="before" role=compare', 'series b "B" key="after" role=main', 'data "summary.json" at "/tokens"']),
];

// 근거: 설계 charts.md 요구사항 "여섯 종류를 행 줄과 data JSON에서 같은 결과로 그린다"(이 시험은 막대, 선, 덤벨만), "신뢰구간을 세 종류가 같은 규칙으로 받고 행 줄과 data가 같은 결과를 낸다"
test('buildFigure_rows_from_data_match_inline_rows_for_bar_line_and_dumbbell', async () => {
  for (const [inline, fromData] of [BAR_DATA, LINE_DATA, DUMBBELL_DATA]) assert.equal(await bodyOf(fromData, { baseDir: FIXTURES }), await bodyOf(inline), inline.split('\n')[1]);
});

// 근거: 설계 charts.md 요구사항 "두 강제 선택 사항이 행 줄과 빠진 신뢰구간을 막는다(--require-ci는 막대, 덤벨, 선)"
test('buildFigure_require_data_and_require_ci_reject_hand_rows_and_missing_intervals', async () => {
  const bar = doc('bar', ['series a "A"', 'row "r" a=1']);
  const ciSources = [bar, doc('dumbbell', ['series a "A" role=compare', 'series b "B" role=main', 'row "r" a=5 b=3']), doc('line', ['series a "A"', 'point x=1 a=2'])];

  await assert.rejects(buildFigure(bar, { requireData: true }), /require-data/);
  for (const source of ciSources) await assert.rejects(buildFigure(source, { requireCi: true }), /require-ci/, source);
  await buildFigure(doc('scatter', ['point "p" x=1 y=2']), { requireCi: true });
});

// 근거: 버그 #6, #9 "값 축 제목에 괄호 단위가 없으면 경고한다"
test('parseFigure_value_axis_title_without_a_unit_in_parentheses_is_a_warning', () => {
  const warningsOf = (source) => parseFigure(source).warnings.map((w) => `${w.line}: ${w.message}`);

  assert.match(warningsOf(doc('bar', ['series a "A"', 'row "r" a=1']))[0], /the value axis title needs a unit in parentheses, such as (x|y) "latency\(ms\)"/);
  assert.match(warningsOf(doc('bar', ['x "지연"', 'series a "A"', 'row "r" a=1']))[0], /^3: /);
  assert.deepEqual(warningsOf(doc('bar', ['x "지연(ms)"', 'series a "A"', 'row "r" a=1'])), []);
  assert.equal(warningsOf(doc('scatter', ['x "비용(달러)"', 'point "p" x=1 y=2'])).length, 1);
  assert.equal(warningsOf(doc('line', ['x "주차"', 'series a "A"', 'point x=1 a=2'])).length, 1);
  assert.deepEqual(warningsOf(doc('heatmap', ['cell "r" "c" 1'])), []);
});

const DECIMALS = [
  { rule: '히트맵 칸은 같은 소수 자릿수', source: doc('heatmap', ['x "열(개)"', 'cell "a" "x" 0.6', 'cell "a" "y" 0.05', 'cell "b" "x" 1', 'cell "b" "y" 0.25']), cls: 'chart-cell', texts: ['0.60', '0.05', '1.00', '0.25'] },
  { rule: 'decimals 머리 줄이 히트맵 자릿수를 덮음', source: doc('heatmap', ['decimals 1', 'cell "a" "x" 0.6', 'cell "a" "y" 0.05']), cls: 'chart-cell', texts: ['0.6', '0.1'] },
  { rule: 'decimals 머리 줄이 막대 자릿수를 덮음', source: doc('bar', ['x "정확도(%)"', 'decimals 0', 'series a "A"', 'row "r" a=91.4', 'row "s" a=79.7']), cls: 'chart-value', texts: ['91', '80'] },
  { rule: '막대 계열마다 자기 자릿수', source: doc('bar', ['x "값(점)"', 'series a "A"', 'series b "B"', 'row "r" a=91.4 b=60', 'row "s" a=79 b=44']), cls: 'chart-value', texts: ['91.4', '60', '79.0', '44'] },
  { rule: '상자 차트 값은 중앙임을 붙이고 자릿수가 같다', source: doc('box', ['x "지연(ms)"', 'row "a" min=1 q1=2 median=3 q3=4 max=5', 'row "b" min=1 q1=2 median=3.5 q3=4 max=5']), cls: 'chart-value', texts: ['중앙값 3.0', '중앙값 3.5'] },
];

// 근거: 설계 charts.md 요구사항 "숫자와 비율 글자가 반올림 규칙을 따른다"(소수 자릿수: 같은 계열과 표 안에서 같고, decimals 머리 줄이 우선)
test('buildFigure_chart_value_text_keeps_equal_decimal_places', async () => {
  for (const { rule, source, cls, texts } of DECIMALS) assert.deepEqual(textsOf(await bodyOf(source), cls), texts, rule);
});

// 차트 카드 하나의 계열 [id, 역할] 목록
const rolesOf = (source) => parseFigure(source).figure.nodes[0].plot.chart.series.map((s) => [s.id, s.role]);
const roleOf = (type, rows, a = '', b = '') => rolesOf(doc(type, ['x "값(%)"', `series a "A"${a}`, `series b "B"${b}`, rows]));

// 근거: 설계 charts.md 요구사항 "계열 역할: 쓴 role을 먼저, 계열이 하나나 둘이면 생략한 계열은 선언 순서대로 main, compare를 받는다(firstRole이 먼저), 셋 이상이면 역할이 없다"
test('parseFigure_series_roles_follow_the_written_role_then_the_declaration_order', () => {
  const read = parseFigure(doc('bar', ['x "값(%)"', 'series a "A" key="k" role=compare', 'series b "B" role=main', 'row "r" a=1 b=2'])).figure.nodes[0].plot.chart;

  assert.deepEqual(read.series.map((s) => [s.id, s.key, s.role]), [['b', 'b', 'main'], ['a', 'k', 'compare']]);
  assert.deepEqual(roleOf('bar', 'row "r" a=1 b=2'), [['a', 'main'], ['b', 'compare']]);
  assert.deepEqual(roleOf('line', 'point x=1 a=1 b=2'), [['a', 'main'], ['b', 'compare']]);
  assert.deepEqual(roleOf('dumbbell', 'row "r" a=1 b=2'), [['a', 'compare'], ['b', 'main']]);
  assert.deepEqual(roleOf('bar', 'row "r" a=1 b=2', ' role=compare', ''), [['b', 'main'], ['a', 'compare']]);
  assert.deepEqual(roleOf('bar', 'row "r" a=1 b=2', '', ' role=main'), [['b', 'main'], ['a', 'compare']]);
  assert.equal(rolesOf(doc('bar', ['x "값(%)"', 'series a "A"', 'row "r" a=1']))[0][1], 'main');
  assert.deepEqual(rolesOf(doc('bar', ['x "값(%)"', 'series a "A"', 'series b "B"', 'series c "C"', 'row "r" a=1 b=2 c=3'])), [['a', undefined], ['b', undefined], ['c', undefined]], '계열이 셋 이상이면 생략한 역할은 비어 있다');
});

// 근거: 설계 charts.md 범례와 덤벨 방향
test('buildFigure_legend_lists_main_first_and_a_dumbbell_starts_at_compare', async () => {
  const dumbbell = doc('dumbbell', ['x "값(%)"', 'series ours "O" role=main', 'series base "B" role=compare', 'row "r" ours=2 base=9'], 'scene "s"\n  reveal c.base\n  reveal c.ours\n');

  const result = await buildFigure(dumbbell);
  const chart = chartOf(result);

  // 막대 둘 이상은 번호 키 범례다(`1 이름`). 범례 순서는 main이 먼저이고 선언 순서와 드러내는 순서를 따르지 않는다.
  assert.deepEqual(legendOf(await bodyOf(SWAPPED_BAR)), ['1 A', '2 B']);
  assert.deepEqual(legendOf(await bodyOf(`${BAR}scene "전"\n  reveal c.b\nscene "후"\n  reveal c.a\n`)), ['1 A', '2 B']);
  assert.deepEqual(legendOf(chart.body), ['O', 'B']);
  // 덤벨은 compare가 시작점이다. 첫 그룹(cs-0)이 compare 계열(둘째 범주 노랑)의 점이고 끝점과 화살표는 둘째 그룹(cs-1)의 main이다. 점 모양은 범주 번호를 따라 시작점은 사각형, 끝점은 원이다.
  assert.match(chart.body, /<g class="cs-0"><rect [^>]*fill="var\(--color-data-category-2\)"[^>]*class="pop"\/><\/g><g class="cs-1"><line [^>]*class="chart-arrow pop"[^>]*\/><circle [^>]*fill="var\(--color-data-category-outline-1\)" class="chart-after pop"\/>/);
  assert.equal(Object.values(result.timeline.segs.at(-1).charts)[0].series.length, 2);
});

// 근거: 설계 docs-integration.md "범주 색은 선언 순서가 아니라 계열의 role이 정한다: main이 첫째 범주, 나머지는 선언 순서"
test('buildFigure_series_color_follows_the_role_not_the_declaration_order', async () => {
  const fills = (body) => [...body.matchAll(/<rect [^>]*height="12"[^>]*fill="(?!none)([^"]+)"[^>]* class="grow"/g)].map((m) => m[1]);

  // main은 기록된 첫째 범주, compare는 둘째 범주다(chart-palette.js).
  assert.deepEqual(fills(await bodyOf(BAR)), [tokens.color.data.category[1], tokens.color.data.category[2]]);
  assert.deepEqual(fills(await bodyOf(SWAPPED_BAR)), fills(await bodyOf(BAR)));
});

// 근거: 설계 docs-integration.md "같은 계열 이름은 모든 예제에서 같은 역할이다"
test('examples_same_series_label_and_id_have_the_same_role_in_every_source', () => {
  const dirs = [new URL('../examples/', import.meta.url), ASSETS];
  const sources = dirs.flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.dap')).map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') })));
  const byLabel = new Map();
  const byId = new Map();
  for (const { name, text } of sources) {
    for (const card of parseFigure(text).figure.nodes.filter((node) => node.shape === 'chart')) {
      for (const s of card.plot.chart.series) {
        for (const [table, key] of [[byLabel, s.label], [byId, s.id]]) {
          const seen = table.get(key);
          assert.ok(seen === undefined || seen.role === s.role, `${name}: "${key}" is ${s.role} but ${seen?.name} has ${seen?.role}`);
          table.set(key, { name, role: s.role });
        }
      }
    }
  }

  assert.ok(byLabel.size >= 4);
});

// 근거: 설계 charts.md 요구사항 "막대 값 글자가 기준선에 걸려도 막대 끝 옆 같은 간격에 있고 점선이 글자 둘레에서 끊긴다"
test('drawBars_value_text_stays_next_to_the_bar_end_and_draws_after_the_rule', async () => {
  const body = await bodyOf(doc('bar', ['series a "A"', 'rule 80 "기준"', 'row "r" a=70.3 a.low=66 a.high=74.2', 'row "s" a=50']));
  const gap = values.space['3'];
  const ciEnd = Number(/<line x1="[\d.]+" x2="([\d.]+)"[^>]*class="chart-ci late"/.exec(body)[1]);
  const [, barX, barW] = /<g class="cr-1"><g class="cs-0"><rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(body).map(Number);
  const textX = (value) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*class="chart-value ours late">${value}`).exec(body)[1]);

  assert.ok(Math.abs(textX('70.3') - (ciEnd + gap)) < 0.11);
  assert.ok(Math.abs(textX('50') - (barX + barW + gap)) < 0.11);
  assert.ok(body.indexOf('class="chart-value') > body.indexOf('class="chart-rule"'));
});

// 근거: 설계 charts.md 요구사항 "가까운 덤벨 두 값이 화살표 없이 겹치지 않고 끝점 모양이 모든 행에서 같다"
test('drawDumbbells_every_row_ends_in_the_same_main_dot_and_close_rows_only_lose_the_arrow', async () => {
  const close = await bodyOf(doc('dumbbell', ['scale log', 'series a "A" role=compare', 'series b "B" role=main', 'row "r" a=8000 b=9200', 'row "s" a=100000 b=1000']));
  const [near, far] = close.split('<g class="cr-1 ink"><text');
  const textX = (svg, cls) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*class="chart-value ${cls} late`).exec(svg)[1]);
  const dots = (svg) => [...svg.matchAll(/<circle [^>]*r="(\d+)" fill="([^"]+)" class="chart-after pop"/g)].map((m) => m.slice(1).join(' '));

  // 모든 칸은 안정 슬롯이라 가까운 행의 화살표 요소도 있지만 보이지 않는다.
  assert.match(near, /class="chart-arrow pop"[^>]*visibility="hidden"/);
  assert.match(far, /class="chart-arrow pop"(?![^>]*visibility="hidden")/);
  assert.equal(dots(near).length, 1);
  assert.deepEqual(dots(far), dots(near));
  assert.ok(textX(near, 'second') > textX(near, 'first'));
});

// 근거: 설계 charts.md 요구사항 "선 차트 점이 선이 닿는 시각에 나타난다"
test('drawLine_dot_appears_when_the_line_reaches_it_along_the_reveal_curve', async () => {
  const chart = chartOf(await buildFigure(doc('line', ['x "주차"', 'y "점수(%)"', 'series a "A"', 'point x=1 a=1', 'point x=2 a=1', 'point x=3 a=1', 'point x=4 a=1', 'point x=5 a=1'])));
  const ats = [...chart.body.matchAll(/<circle [^>]*class="dot" data-at="([\d.]+)"/g)].map((m) => Number(m[1]));
  const reach = [0, 0.25, 0.5, 0.75, 1].map((length) => Math.round(timeAt(curveOf('reveal'), length) * 1000) / 1000);

  assert.deepEqual(ats, reach);
  assert.ok(ats[2] < 0.5, 'the reveal curve is ahead of linear time at half the length');
  assert.deepEqual(chart.dotAts, reach);
});

// 근거: 버그 #44(선 차트 기준선 라벨이 끝 점들과 겹침), 설계 charts.md 그리기 "그 자리를 데이터가 가리면 왼쪽 끝으로 옮긴다"
test('drawLine_rule_label_moves_to_the_free_side_when_dots_touch_the_rule_at_the_right_end', async () => {
  const rows = Array.from({ length: 10 }, (_, k) => `point x=${k + 1} a=${k < 5 ? 0.76 : 0.8142 + (k % 2) * 0.003}`);
  const chart = chartOf(await buildFigure(doc('line', ['y "비율(%)"', 'series a "A"', 'rule 0.8142 "목표"', ...rows])));
  const label = /<text x="([\d.]+)" y="([\d.]+)" class="chart-rule-label( end)?">목표<\/text>/.exec(chart.body);
  const [x, baseline, width] = [Number(label[1]), Number(label[2]), measure('목표', 11)];
  const box = { x0: label[3] ? x - width : x, x1: label[3] ? x : x + width, y0: baseline - 11 - 2, y1: baseline };
  const dots = [...chart.body.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="(\d+)"[^>]*class="dot"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
  const covered = dots.filter((d) => d.x + d.r > box.x0 && d.x - d.r < box.x1 && d.y + d.r > box.y0 && d.y - d.r < box.y1);

  assert.equal(dots.length, 10);
  assert.deepEqual(covered, []);
  assert.equal(label[3], undefined, 'the free side is the left end');
});

// 근거: 이슈 #41 완료 조건 "다른 행에는 그 기준선이 그려지지 않음", 설계 charts.md 요구사항 "행마다 다른 기준"
test('drawBars_row_rule_is_drawn_only_beside_its_own_row_and_widens_the_axis', async () => {
  const rows = [['r', 70, 80], ['s', 40, 90]];
  const source = doc('bar', ['x "비율(%)"', 'series a "A"', 'rule 50 "공통"', ...rows.map(([name, v, rule]) => `row "${name}" a=${v} rule=${rule}`)]);
  const body = await bodyOf(source);
  const lines = [...body.matchAll(/<line x1="([\d.]+)" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)" class="chart-rule"\/>/g)].map((m) => m.slice(1).map(Number));
  const bars = [...body.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="12"(?![^>]*fill="none")[^>]*class="grow"/g)].map((m) => Number(m[1]));
  const [first, second, shared] = lines;
  const rowOf = (line) => bars.findIndex((top) => top > line[1] && top < line[2]);

  assert.equal(lines.length, 3, 'one shared rule and one rule per row');
  assert.deepEqual([rowOf(first), rowOf(second)], [0, 1], 'each row rule spans only its own row');
  assert.ok(first[0] < second[0], 'rule=80 sits left of rule=90');
  assert.ok(shared[2] - shared[1] > second[2] - second[1], 'the shared rule still crosses every row');
  assert.deepEqual(textsOf(body, 'chart-rule-label'), ['80', '90', '공통']);
  assert.ok(Math.max(...textsOf(body, 'chart-tick').map(Number)) >= 90, 'the axis covers the row rules');

  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'rows.json'), JSON.stringify(rows.map(([label, a, rule]) => ({ label, a, rule }))));
    const fromData = await bodyOf(doc('bar', ['x "비율(%)"', 'series a "A"', 'rule 50 "공통"', 'data "rows.json"']), { baseDir: folder });

    assert.equal(fromData, body, 'a data element key "rule" reads the same row rule');
  });
  // 계열 이름이 rule이면 옛 뜻(계열 값)이 우선이라 행 기준을 그리지 않는다.
  assert.equal((await bodyOf(doc('bar', ['x "값(%)"', 'series rule "R"', 'row "r" rule=5']))).includes('chart-rule-casing'), false);
});

// 근거: 이슈 #42 완료 조건 "차이가 음수인 행과 0인 행이 읽힘", 설계 charts.md 요구사항 "차이 차트가 음수 값, 음수 기준선, 모두 0인 값을 그린다"
test('drawDifferences_negative_values_negative_rule_and_all_zero_are_drawn_around_a_zero_line', async () => {
  const dotsOf = (body) => [...body.matchAll(/<circle cx="([\d.]+)"[^>]*class="chart-after pop"/g)].map((m) => Number(m[1]));
  const zeroOf = (body) => Number(/<line x1="([\d.]+)" x2="[\d.]+" [^>]*class="chart-zero"/.exec(body)[1]);
  const mixed = await bodyOf(doc('difference', ['x "차이(%p)"', 'decimals 1', 'series d "차이"', 'rule -10 "기준선"', 'row "음수" d=-6.4 d.low=-9.8 d.high=-3', 'row "양수" d=3.2 d.low=-0.4 d.high=6.8', 'row "영" d=0 d.low=0 d.high=0']));
  const flat = await bodyOf(doc('difference', ['x "차이(%p)"', 'series d "차이"', 'row "a" d=0 d.low=0 d.high=0', 'row "b" d=0 d.low=0 d.high=0']));
  const [negative, positive, zero] = dotsOf(mixed);

  assert.ok(negative < zeroOf(mixed) && zeroOf(mixed) < positive, 'negative left of the zero line, positive right of it');
  assert.equal(zero, zeroOf(mixed), 'a zero difference sits on the zero line');
  assert.deepEqual(textsOf(mixed, 'chart-value'), ['−6.4', '+3.2', '0.0']);
  assert.deepEqual(textsOf(mixed, 'chart-rule-label'), ['기준선']);
  assert.deepEqual(textsOf(mixed, 'chart-tick').map(Number).filter((t) => t === 0), [0]);
  assert.deepEqual(dotsOf(flat), [zeroOf(flat), zeroOf(flat)]);
  assert.deepEqual(textsOf(flat, 'chart-tick'), ['-1', '-0.5', '0', '0.5', '1']);
});

// 근거: 이슈 #42 재현 원본(값이 모두 0이고 기준선이 -10), 설계 charts.md "차이 차트의 0은 값 축 안쪽에 선다"
test('drawDifferences_zero_stays_a_tick_step_inside_the_axis_and_texts_stay_in_the_frame', async () => {
  const sources = [
    doc('difference', ['x "차이(%p)"', 'series d "차이"', 'rule -10 "기준선"', 'row "a" d=0 d.low=0 d.high=0']),
    doc('difference', ['x "차이(%p)"', 'series d "차이"', 'row "a" d=3 d.low=1 d.high=6']),
    doc('difference', ['x "차이(%p)"', 'series d "차이"', 'row "a" d=-3 d.low=-6 d.high=-1']),
  ];
  for (const source of sources) {
    const chart = chartOf(await buildFigure(source));
    const ticks = [...chart.body.matchAll(/<text x="([\d.]+)"[^>]*class="chart-tick">([^<]*)</g)].map((m) => [Number(m[1]), m[2]]);
    const zero = ticks.find(([, label]) => label === '0')[0];
    const step = ticks[1][0] - ticks[0][0];
    const texts = [...chart.body.matchAll(/<text x="([\d.]+)"[^>]*class="chart-value[^"]*">([^<]*)</g)];

    assert.ok(zero - ticks[0][0] >= step - 1 && ticks.at(-1)[0] - zero >= step - 1, `${source}: ticks ${ticks.map((t) => t[1])}`);
    for (const [, x, text] of texts) assert.ok(Number(x) + measure(text, 11, 'numSemibold') <= chart.width - PAD + TOLERANCE, text);
  }
});

// 근거: 이슈 #43 완료 조건 "축이 값 범위에 맞춤", "생략하면 지금 뜻"(호환 규칙), 설계 charts.md "잘린 축은 잘림이 보인다"
test('drawLine_zero_off_fits_the_value_range_and_marks_a_cut_axis', async () => {
  const rows = [0.76, 0.758, 0.812, 0.815].map((v, k) => `point x=${k + 1} a=${v}`);
  const head = (zero) => ['y "비율(%)"', ...zero, 'series a "A"'];
  const yTicks = (body) => textsOf(body, 'chart-tick end').map(Number);
  const kept = await bodyOf(doc('line', [...head([]), ...rows]));
  const cut = await bodyOf(doc('line', [...head(['zero off']), ...rows]));
  const crossing = await bodyOf(doc('line', [...head(['zero off']), 'point x=1 a=-2', 'point x=2 a=3']));

  assert.equal(yTicks(kept)[0], 0, 'omitting zero keeps the old axis from 0');
  assert.equal(kept.includes('chart-break'), false);
  assert.ok(yTicks(cut)[0] > 0.7 && yTicks(cut).at(-1) < 0.9, `fits the data: ${yTicks(cut)}`);
  assert.equal(cut.split('class="chart-break"').length - 1, 1, 'a cut axis shows one break mark');
  assert.equal(crossing.includes('chart-break'), false, 'an axis that still contains 0 is not cut');
});

const STEPPED = 'scene "하나"\n  reveal c.a\nscene "둘"\n  reveal c.b\n';
const STEPPED_BAR = doc('bar', ['x "정확도(%)"', ...SERIES_ROLES, 'row "r" a=5 b=3'], STEPPED);
const MISSING_BAR = doc('bar', ['x "정확도(%)"', ...SERIES_ROLES, 'row "r" a=5 b=3', 'row "m" a=- b=4'], STEPPED);

// 근거: 설계 charts.md "막대 행 이름은 모든 계열을 놓은 최종 위치에 고정한다. 계열이 나타나거나 사라져도 제목과 행 이름이 이동하지 않는다". 장면마다 움직이는 SVG의 행 이름 자리가 같고, 이름 글자에는 움직임(animate)이 없다
test('toSvg_bar_labels_stay_fixed_through_every_reveal', async () => {
  const labelsOf = (svg) => [...svg.matchAll(/<text[^>]*class="chart-label[^"]*"[^>]*>/g)].map((m) => m[0].replace(/\s*(?:opacity|data-\w+)="[^"]*"/g, ''));
  for (const source of [STEPPED_BAR, MISSING_BAR]) {
    const result = await buildFigure(source);
    const scenes = await Promise.all([...result.timeline.steps.keys()].map((si) => toSvg(result, { scene: si })));
    const labels = scenes.map(labelsOf);

    assert.ok(labels[0].length > 0, '행 이름이 있다');
    assert.deepEqual(labels[1], labels[0], '장면이 바뀌어도 행 이름은 같은 자리다');
    for (const svg of scenes) assert.doesNotMatch(svg, /<text[^>]*class="chart-label[^"]*"[^>]*>[^<]*<animate/, '행 이름은 움직이지 않는다');
  }
});

// 근거: 설계 playback.md 요구사항 "값이 없는 슬롯이 있는 행은 막대가 보이는 동안 이름이 그 막대에 맞는다"
test('drawChart_bar_label_of_a_row_with_a_missing_series_is_centered_on_its_only_bar', async () => {
  const body = await bodyOf(MISSING_BAR);
  const bars = [...body.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="12"(?![^>]*fill="none")[^>]*class="grow"/g)].map((m) => Number(m[1]) + 6);
  const labels = [...body.matchAll(/<text x="28" y="([\d.]+)" class="chart-label[^"]*">/g)].map((m) => Number(m[1]) - 13 * 0.36);

  assert.equal(bars.length, 3);
  // r 행은 두 막대 가운데(첫 막대 가운데 + 슬롯 간격의 절반), m 행은 하나뿐인 막대(둘째 슬롯) 가운데
  assert.ok(Math.abs(labels[0] - (bars[0] + (values.size.chart.bar + values.space['8']) / 2)) < 0.2, `${labels[0]} ${bars[0]}`);
  assert.ok(Math.abs(labels[1] - bars[2]) < 0.2, `${labels[1]} ${bars[2]}`);
});

// 근거: 설계 charts.md 그리기 "오른쪽에는 왼쪽 여백(28px)과 같은 여백, 아래는 마지막 글자 줄 아래 같은 여백", 결정 docs-integration.md "차트도 꽉 채움"
test('drawChart_content_has_equal_left_and_right_margins_and_the_pad_below_the_last_text_line', async () => {
  assert.deepEqual(Object.keys(MINIMAL).sort(), Object.keys(VALUES.chartType.items).sort(), '이 시험은 지원하는 모든 차트 종류를 그린다');
  const sources = [...Object.entries(MINIMAL).map(([type, lines]) => ({ file: type, source: `daphnis 2\nchart c "제목" ${type} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n`, isTitled: true })), { file: 'scatter without titles', source: doc('scatter', ['point "p" x=1 y=2', 'point "q" x=3 y=5']) }];
  const failures = [];

  for (const { file, source, isTitled } of sources) {
    const chart = chartOf(await buildFigure(source));
    const { left, right } = extentOf(chart.body);
    const expect = (isOk, message) => isOk || failures.push(`${file}: ${message}`);

    if (isTitled) expect(Math.abs(left - PAD) <= TOLERANCE, `left margin ${left}`);
    // 원과 도넛은 고리를 가운데에 두고 항목 줄을 왼쪽 여백에서 시작하므로 오른쪽 여백이 같지 않고, 내용이 여백 안에 드는지만 잰다.
    if (file === 'pie' || file === 'donut') expect(chart.width - right >= PAD - TOLERANCE, `content crosses the right margin ${chart.width - right}`);
    else expect(Math.abs(left - (chart.width - right)) <= TOLERANCE, `left ${left}, right margin ${chart.width - right}`);
    const baselines = [...chart.body.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" class="chart-unit">/g)].map((m) => Number(m[1]));
    if (baselines.length) expect(chart.height - Math.max(...baselines) === PAD + values.space['1-5'], `bottom ${chart.height - Math.max(...baselines)}`);
  }
  assert.deepEqual(failures, []);
});

// 근거: 결정 docs-integration.md "차트도 꽉 채움": 히트맵 칸이 오른쪽 여백까지 폭을 채운다
test('drawChart_heatmap_cells_fill_the_width_up_to_the_right_margin', async () => {
  const chart = chartOf(await buildFigure(doc('heatmap', ['cell "a" "x" 1', 'cell "a" "y" 2', 'cell "b" "x" 3', 'cell "b" "y" 4'])));
  const cells = [...chart.body.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*class="chart-heat"/g)].map((m) => Number(m[1]) + Number(m[2]));

  assert.ok(Math.abs(Math.max(...cells) - (chart.width - PAD)) <= TOLERANCE);
});

// 두 점을 잇는 선(link)이 있는 산점도. 화살촉이 점 이름을 가리지 않는지 잰다.
const LINKED_SCATTER = doc('scatter', ['x "정확도(%)"', 'y "지연(ms)"', 'point "alpha" x=1 y=9', 'point "beta" x=4 y=3', 'point "gamma" x=7 y=8', 'link "alpha" -> "beta"', 'link "beta" -> "gamma"']);

// 근거: 버그 #11(산점도 선) 화살촉이 점 이름을 가리지 않는다
test('drawChart_scatter_arrowhead_stays_clear_of_every_point_name', async () => {
  const chart = chartOf(await buildFigure(LINKED_SCATTER));
  const links = [...chart.body.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"[^>]*class="chart-link pop"/g)].map((m) => m.slice(1).map(Number));
  const names = [...chart.body.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" class="chart-name late( end)?">(.*?)<\/text>/g)].map((m) => {
    const width = measure(m[4], 11);
    const x = Number(m[1]);
    return { x0: (m[3] ? x - width : x) - 4, x1: (m[3] ? x : x + width) + 4, y0: Number(m[2]) - 11 * 0.36 - 5.5 - 4, y1: Number(m[2]) - 11 * 0.36 + 5.5 + 4 };
  });
  const { length: headLength, cap } = headReach(2.5);

  assert.equal(links.length, 2);
  for (const [x1, y1, x2, y2] of links) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
    for (const along of [0, 0.5, 1]) {
      const [px, py] = [x2 + ux * cap - ux * headLength * along, y2 + uy * cap - uy * headLength * along];
      for (const box of names) assert.ok(!(px >= box.x0 && px <= box.x1 && py >= box.y0 && py <= box.y1), `arrowhead point ${px.toFixed(1)},${py.toFixed(1)} is inside a name box`);
    }
  }
});

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 점 수
// basis: estimate
// 점 이름 글자 상자 목록 { label, x0, x1, y0, y1 }. 점 오른쪽 이름과 왼쪽(end) 이름을 모두 읽는다.
function nameBoxes(body) {
  return [...body.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" class="chart-name late( end)?">(.*?)<\/text>/g)].map((m) => {
    const width = measure(m[4], 11);
    const [x, y] = [Number(m[1]), Number(m[2]) - 11 * 0.36];
    return { label: m[4], x0: m[3] ? x - width : x, x1: m[3] ? x : x + width, y0: y - 5.5, y1: y + 5.5 };
  });
}
const isOverlapping = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// 근거: 설계 charts.md 산점도 점 이름 "이름끼리 겹치면 비켜 놓는다": 같은 좌표와 가까운 좌표의 두 점도 이름이 따로 읽힌다(#36)
test('drawScatter_names_of_points_at_the_same_or_near_coordinates_are_placed_apart', async () => {
  const head = ['x "a(ms)"', 'y "b(ms)"'];
  for (const points of [['point "alpha" x=5 y=5', 'point "beta" x=5 y=5', 'point "far" x=1 y=1'], ['point "alpha" x=5 y=5', 'point "beta" x=5.02 y=5.02', 'point "far" x=1 y=1']]) {
    const result = await buildFigure(doc('scatter', [...head, ...points]), { strict: true });
    const boxes = nameBoxes(chartOf(result).body);

    assert.equal(boxes.length, 3);
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(!isOverlapping(a, b), `${a.label}와 ${b.label} 이름이 겹친다: ${points}`);
  }
});

// 근거: 설계 charts.md 산점도 점 이름: 비켜 놓을 자리가 없을 만큼 한 좌표에 점이 몰리면 이름이 겹쳐 읽을 수 없으므로 strict가 검사 2번 오류로 알린다(#36)
test('buildFigure_scatter_names_that_cannot_be_placed_apart_are_a_check_2_error_with_the_point_line', async () => {
  const points = Array.from({ length: 25 }, (_, i) => `point "name${i}" x=5 y=5`);
  const errors = await problemsOf(doc('scatter', ['x "a(ms)"', 'y "b(ms)"', ...points]), { strict: true });

  assert.ok(errors.some((e) => /^\d+: \[check-2\] point name "name\d+" overlaps point name "name\d+"/.test(e)), errors.join('\n'));
});

// 근거: 설계 charts.md "머리와 선언 줄": 종류를 모르면 종류에 기대는 검사를 하지 않고 헤더 오류 하나만 남긴다
test('parseFigure_chart_header_failure_stops_before_any_type_dependent_check', () => {
  const sources = [
    'daphnis 2\nchart c "차트"\n',
    'daphnis 2\nchart c "차트" bogus {\n}\n',
    'daphnis 2\nchart c "차트" bogus {\n  series s "S"\n  row "A" s=1\n  rule 5 "R"\n}\n',
  ];
  for (const source of sources) {
    const error = (() => {
      try {
        parseFigure(source);
      } catch (e) {
        return e;
      }
    })();

    assert.deepEqual([...new Set(error.problems.map((p) => p.line))], [2], source);
    assert.ok(error.problems.every((p) => p.code !== 'internal'), source);
  }
});

// 근거: 설계 charts.md "머리와 선언 줄": 이름 문법에 맞고 실제 중복이 없는 계열 이름은 상속 속성 이름이어도 받는다
test('buildFigure_series_named_like_an_inherited_property_reads_once_and_real_duplicates_still_fail', async () => {
  // 이름 문법(소문자, 숫자, -)에 맞는 Object.prototype 속성은 constructor 하나다. 대소문자를 가리는 valueOf 따위는 문법에서 이미 걸러진다.
  for (const name of ['constructor']) {
    const source = doc('bar', ['x "Value(ms)"', `series ${name} "S"`, `row "A" ${name}=1`]);

    assert.deepEqual(await problemsOf(source), [], name);
    assert.ok((await bodyOf(source)).includes('class="grow"'), name);
  }
  const twice = await problemsOf(doc('bar', ['x "Value(ms)"', 'series constructor "S"', 'row "A" constructor=1 constructor=2']));
  const optionTwice = await problemsOf(doc('bar', ['x "Value(ms)"', 'series a "S" key="k" key="j"', 'row "A" a=1']));
  const unknownWord = await problemsOf(doc('bar', ['x "Value(ms)"', 'series a "S"', 'constructor 1', 'row "A" a=1']));

  assert.match(twice.join('\n'), /"constructor" is written twice/);
  assert.equal(optionTwice.length > 0, true);
  assert.match(unknownWord.join('\n'), /unknown chart statement "constructor"/);
});

const NINES = '9'.repeat(310);
const LINE_HEAD = ['x "Time(s)"', 'y "Value(ms)"', 'series s "S"'];
// 입력 종류마다 Number 변환이 Infinity가 되는 글(310자리)과 유한하지만 1e15 이상인 글
const NUMBER_INPUTS = [
  { input: 'rule 선언, 310자리', source: doc('line', [...LINE_HEAD, `rule ${NINES} "Limit"`, 'point x=0 s=1', 'point x=1 s=2']), line: 6 },
  { input: 'rule 선언, 1e15', source: doc('line', [...LINE_HEAD, `rule 1${'0'.repeat(15)} "Limit"`, 'point x=0 s=1', 'point x=1 s=2']), line: 6 },
  { input: 'rule 선언, 음수 310자리', source: doc('line', [...LINE_HEAD, `rule -${NINES} "Limit"`, 'point x=0 s=1', 'point x=1 s=2']), line: 6 },
  { input: '선 차트 point 값', source: doc('line', [...LINE_HEAD, `point x=0 s=${NINES}`, 'point x=1 s=2']), line: 6 },
  { input: '선 차트 point x', source: doc('line', [...LINE_HEAD, `point x=${NINES} s=1`, 'point x=1 s=2']), line: 6 },
  { input: '막대 행 값', source: doc('bar', ['x "v(ms)"', 'series s "S"', `row "A" s=${NINES}`]), line: 5 },
  { input: '막대 행 기준 rule=', source: doc('bar', ['x "v(ms)"', 'series s "S"', `row "A" s=1 rule=${NINES}`]), line: 5 },
  { input: '히트맵 cell', source: doc('heatmap', [`cell "a" "b" ${NINES}`]), line: 3 },
  { input: '산점도 point', source: doc('scatter', ['x "a(ms)"', 'y "b(ms)"', `point "p" x=1 y=${NINES}`]), line: 5 },
];

// 근거: 설계 charts.md 값 범위 "값의 절댓값은 1e15 미만": rule과 행 숫자가 같은 유한성·범위 검사를 받고 성공한 SVG에는 비유한 좌표가 없다
test('buildFigure_chart_numbers_that_overflow_or_pass_1e15_are_line_errors_for_every_input_kind', async () => {
  for (const { input, source, line } of NUMBER_INPUTS) {
    const errors = await problemsOf(source, { strict: true });

    assert.equal(errors.length > 0, true, `${input}: 오류 없음`);
    assert.ok(errors.every((e) => e.startsWith(`${line}:`)), `${input}: ${errors.join(' | ')}`);
    assert.doesNotMatch(errors.join('\n'), /internal/, input);
  }
  const result = await buildFigure(doc('line', [...LINE_HEAD, 'rule 999999999999999 "Limit"', 'point x=0 s=1', 'point x=1 s=2']), { strict: true });
  const svg = await toSvg(result, { isStatic: true });

  assert.doesNotMatch(svg, /NaN|Infinity/);
});

// 근거: 설계 playback.md·figure-syntax.md 시간 값과 aspect: 유한하지 않은 시간과 비율은 구문 오류다
test('parseFigure_time_and_ratio_that_overflow_to_infinity_are_syntax_errors', () => {
  assert.equal(parseTime(`${NINES}ms`), undefined);
  assert.equal(parseTime(`${NINES}s`, true), undefined);
  assert.equal(parseTime('900ms'), 900);
  assert.throws(() => parseFigure(`daphnis 2\npace ${NINES}s\nbox a "A"`), (e) => e.problems[0].line === 2);
  assert.throws(() => parseFigure(`daphnis 2\naspect ${NINES}\nbox a "A"`), (e) => e.problems[0].line === 2);
});

// 근거: 설계 charts.md 값 축 "빠진 값과 0": 값이 모두 0이어도 모두 빠져도 오류가 아니다. 모두 빠진 막대는 틀과 축만 대체 범위(0에서 1)로 그리고 행은 막대 없이 `missing` 문구를 쓴다. 일부 누락과 값 0도 유한한 좌표로 그린다
test('buildFigure_bar_with_every_value_missing_draws_the_frame_and_axis_and_partial_missing_or_zero_still_draw_finite_coordinates', async () => {
  const head = ['x "Value(ms)"', 'series s "S"'];
  const sources = {
    allMissing: [doc('bar', [...head, 'row "A" s=-']), {}],
    withRule: [doc('bar', [...head, 'rule 5 "R"', 'row "A" s=-', 'row "B" s=-']), {}],
    fromData: [doc('bar', [...head, 'data "nulls.json"']), { baseDir: FIXTURES }],
    allZero: [doc('bar', [...head, 'row "A" s=0', 'row "B" s=0']), {}],
  };

  for (const [name, [source, options]] of Object.entries(sources)) {
    const result = await buildFigure(source, { strict: true, ...options });
    const svg = await toSvg(result, { isStatic: true });

    assert.deepEqual(result.warnings, [], name);
    // 글꼴 조각은 base64 글이라 우연히 NaN이 들어갈 수 있다(nonfinite.test.js와 같다). 검사에서 뺀다.
    assert.doesNotMatch(svg.replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,'), /NaN|Infinity/, `${name}: 좌표가 유한하다`);
  }
  const ticks = async (source) => [...(await toSvg(await buildFigure(source, { strict: true }), { isStatic: true })).matchAll(/class="chart-tick[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual((await ticks(sources.allMissing[0])).slice(0, 2), ['0', '1'], '모두 빠진 막대의 눈금은 0과 1이다');
  assert.deepEqual((await ticks(sources.allZero[0])).slice(0, 2), ['0', '1'], '모두 0인 막대의 눈금도 0과 1이다');
  for (const rows of [['row "A" s=-', 'row "B" s=3'], ['row "A" s=0', 'row "B" s=3'], ['row "A" s=0', 'row "B" s=-', 'row "C" s=2']]) {
    const result = await buildFigure(doc('bar', [...head, ...rows]), { strict: true });
    const svg = await toSvg(result, { isStatic: true });

    assert.deepEqual(result.warnings, [], rows.join('\n'));
    assert.doesNotMatch(svg, /NaN|Infinity/, rows.join('\n'));
  }
});

// 근거: 설계 charts.md 눈금 "정밀도는 축 간격에 맞춘다": 값 범위가 작아도 눈금은 서로 다른 값이고 순서대로 늘어난다
test('makeScale_linear_ticks_stay_distinct_and_exact_for_tiny_large_negative_and_zero_adjacent_ranges', () => {
  const cases = [
    { name: '1e-12 단위', range: { min: 1e-12, max: 2e-12 }, first: 0, last: 2e-12, count: 5 },
    { name: '0 주변 음양', range: { min: -1e-12, max: 1e-12 }, first: -1e-12, last: 1e-12 },
    { name: '이진 오차(0.1 + 0.2)', range: { min: 0.1, max: 0.3 }, first: 0, last: 0.3 },
    { name: '큰 값에서 0 시작', range: { min: 1e14, max: 3e14 }, first: 0, last: 3e14 },
    { name: '음수만', range: { min: -3e-9, max: -1e-9 }, first: -3e-9, last: -1e-9 },
    { name: '값이 0 하나', range: { min: 0, max: 0 }, first: 0, last: 1 },
    { name: '0 시작 해제, 큰 값의 작은 차이', range: { min: 1e14, max: 1e14 + 5, fromZero: false }, first: 1e14, last: 1e14 + 5 },
    { name: '0 시작 해제, 작은 값의 작은 차이', range: { min: 1.5e-12, max: 1.9e-12, fromZero: false }, first: 1.5e-12, last: 1.9e-12 },
  ];
  for (const { name, range, first, last, count } of cases) {
    const { ticks, labels, at } = makeScale('linear', { ...range, start: 0, length: 100 });

    assert.equal(ticks[0], first, `${name}: 첫 눈금 ${ticks}`);
    assert.equal(ticks.at(-1), last, `${name}: 끝 눈금 ${ticks}`);
    if (count) assert.equal(ticks.length, count, name);
    assert.ok(ticks.every((t, i) => i === 0 || t > ticks[i - 1]), `${name}: 눈금이 늘어나지 않음 ${ticks}`);
    assert.equal(new Set(labels).size, labels.length, `${name}: 눈금 글자가 겹침 ${labels}`);
    assert.ok(ticks.every((t) => Number.isFinite(at(t))) && at(ticks.at(-1)) > at(ticks[0]), name);
  }
});

// 근거: 이슈 #75 재현. 설계 charts.md 눈금: 작은 값의 선 차트에서 y축 눈금 글자가 모두 달라야 한다
test('buildFigure_line_chart_of_tiny_values_draws_distinct_y_ticks_and_distinct_grid_lines', async () => {
  const source = doc('line', ['x "Time(s)"', 'y "Value(s)"', 'series s "S"', 'point x=0 s=0.000000000001', 'point x=1 s=0.000000000002']);
  const body = await bodyOf(source, { strict: true });
  const labels = [...body.matchAll(/class="chart-tick end">([^<]*)</g)].map((m) => m[1]);
  const ys = [...body.matchAll(/y1="([^"]*)"[^>]*class="chart-grid"/g)].map((m) => m[1]);

  assert.ok(labels.length >= 3, labels.join());
  assert.equal(new Set(labels).size, labels.length, `y 눈금 글자 ${labels}`);
  assert.equal(new Set(ys).size, ys.length, `격자 y ${ys}`);
  assert.deepEqual(labels.slice(0, 3), ['0', '5e-13', '1e-12']);
});

// 근거: 설계 charts.md 값 글자 "1000 미만은 가장 짧은 십진 표기": 소수 자릿수가 모자라 0으로 지워지는 작은 값은 지수 표기로 쓴다
test('valueFormat_tiny_nonzero_values_use_exponent_notation_instead_of_rounding_to_zero', () => {
  const format = valueFormat([1e-12, 2e-12]);

  assert.deepEqual([format(1e-12), format(2e-12), format(0)], ['1e-12', '2e-12', '0']);
  assert.equal(valueFormat([0.5, 1.25])(0.5), '0.50');
  assert.equal(valueFormat([1e-12], 2)(1e-12), '0.00');
});
