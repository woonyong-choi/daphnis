// 근거: docs/design/charts.md 히스토그램의 경계 포함, 원시 입력 보존, 집계와 축 계약.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { chartModelOf, chartOf, chartSource, withFolder } from './helpers.js';

// 차트 카드 하나(c)와 그 뒤에 붙는 장면 줄로 이루어진 둘째 판 원본. 블록 안 첫 줄이 3번째 줄이다.
const doc = (lines, tail = '') => `daphnis 2\n${chartSource('histogram', lines)}${tail}`;
const HEADER = ['x "지연(ms)"', 'y "관측(건)"', 'bins 0 1 10'];
const INPUT = [0, 0.1, 0.3, 0.3, 0.9, 1];
const samples = (values) => values.map((value) => `sample ${value}`);
const SOURCE = doc([...HEADER, ...samples(INPUT)]);

test('histogram_counts_each_observation_once_and_keeps_empty_bins_and_decimal_boundaries', async () => {
  const result = await buildFigure(SOURCE, { strict: true });
  const model = chartModelOf(result);
  assert.deepEqual(model.bins.map((bin) => bin.count), [1, 1, 0, 2, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(model.rows.map((row) => row.values.value), INPUT);
  assert.equal(model.bins.reduce((sum, bin) => sum + bin.count, 0), INPUT.length);
  const html = await toHtml(result, 'histogram');
  assert.match(html, /<th scope="row">4<\/th><td>0.3<\/td>/);
  assert.match(html, /\[0.3, 0.4\)<\/th><td>2<\/td>/);
  assert.match(html, /\[0.9, 1\]<\/th><td>2<\/td>/);
});

test('histogram_bins_are_contiguous_and_heights_are_proportional_to_counts', async () => {
  const chart = chartOf(await buildFigure(SOURCE));
  const bars = [...chart.body.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"[^>]*class="chart-histogram-bin"/g)].map((match) => match.slice(1, 5).map(Number));
  assert.equal(bars.length, 10);
  // 구간은 이어져 있고(같은 간격으로 놓이고), 테두리가 겹치지 않게 막대 사이에 작은 틈(space.2 이하)만 있다.
  const pitch = bars[1][0] - bars[0][0];
  // 좌표는 소수 첫째 자리로 줄여 쓰므로(roundCoord) 이웃한 두 간격은 최대 0.1(반올림 눈금) 다를 수 있다.
  for (let i = 1; i < bars.length; i++) assert.ok(Math.abs(bars[i][0] - bars[i - 1][0] - pitch) <= 0.1 + 1e-9, `${i}번째 구간 위치`);
  assert.ok(pitch - bars[0][2] >= 0 && pitch - bars[0][2] <= values.space['2'], `구간 사이 틈 ${pitch - bars[0][2]}`);
  assert.ok(bars.every((bar) => bar[2] === bars[0][2]), '구간 폭은 모두 같다');
  assert.ok(Math.abs(bars[3][3] - bars[0][3] * 2) < 0.01);
  assert.equal(bars[2][3], 0);
  assert.ok(bars.every((bar) => Math.abs(bar[1] + bar[3] - bars[0][1] - bars[0][3]) < 0.01));
});

test('histogram_accepts_signed_constant_and_zero_observations_and_highlights_bin_starts', async () => {
  for (const value of [-1, 0, 1]) {
    const result = await buildFigure(doc(['x "차이(ms)"', 'y "관측(건)"', 'bins -1 1 2', `sample ${value}`, `sample ${value}`], 'scene "선택" mode=once\n  light c x=0\n'), { strict: true });
    assert.deepEqual(chartModelOf(result).bins.map((bin) => bin.count), value < 0 ? [2, 0] : [0, 2]);
    assert.deepEqual(chartOf(result).rowKeys, ['x=-1', 'x=0']);
    const svg = await toSvg(result);
    assert.match(svg, /scaleY\(0\)/);
    // 글꼴의 base64에는 우연히 NaN이 들어갈 수 있으므로 실제 SVG·CSS 수치만 검사한다.
    assert.doesNotMatch(svg.replace(/url\(data:font[^)]*\)/g, ''), /(?:NaN|Infinity)/);
  }
});

test('histogram_json_matches_inline_samples_and_rejects_non_numeric_or_out_of_range_samples', async () => {
  await withFolder(async (folder) => {
    const source = doc([...HEADER, 'data "samples.json"']);
    writeFileSync(join(folder, 'samples.json'), JSON.stringify(INPUT.map((value) => ({ value }))));
    assert.equal(chartOf(await buildFigure(source, { baseDir: folder, strict: true })).body, chartOf(await buildFigure(SOURCE)).body);
    for (const record of [{}, { value: '0.1' }, { value: 2 }]) {
      writeFileSync(join(folder, 'samples.json'), JSON.stringify([record]));
      await assert.rejects(buildFigure(source, { baseDir: folder }));
    }
  });
});

// 근거: charts.md 빠진 값 `-`. JSON의 null은 행 줄의 `sample -`와 같은 빠진 표본이다: 관측으로 세지 않고 0건 표본이 되지도 않는다.
test('histogram_json_null_is_a_missing_sample_like_the_inline_dash_and_is_not_counted_as_zero', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'samples.json'), JSON.stringify([...INPUT.map((value) => ({ value })), { value: null }]));
    const fromData = await buildFigure(doc([...HEADER, 'data "samples.json"']), { baseDir: folder, strict: true });
    const inline = await buildFigure(doc([...HEADER, ...samples(INPUT), 'sample -']), { strict: true });

    assert.equal(chartOf(fromData).body, chartOf(inline).body);
    assert.deepEqual(chartModelOf(inline).bins.map((bin) => bin.count), chartModelOf(await buildFigure(SOURCE)).bins.map((bin) => bin.count), '빠진 표본은 구간 수를 바꾸지 않는다');
    assert.equal(chartModelOf(inline).missingCount, 1);
    assert.equal(chartModelOf(inline).observed, INPUT.length);
  });
});

test('histogram_rejects_invalid_bins_outliers_and_incompatible_chart_options', async () => {
  for (const binning of [[], ['bins 1 0 2'], ['bins 0 0 2'], ['bins 0 1 0'], ['bins 0 1 101'], ['bins 0 1 2.5'], ['bins 0 1 1e309'], ['bins 0 1 2', 'bins 0 2 2'], ['bins 0 1e15 2'], ['bins 99999999999999 100000000000000 100']]) {
    await assert.rejects(buildFigure(doc([...binning, 'sample 0'])), /bins|under/, binning.join('|'));
  }
  const withHead = (head) => doc([...head, ...HEADER, ...samples(INPUT)]);
  for (const [lines, tail, message] of [
    [['rule -1 "음수"'], '', /cannot be negative/],
    [['sample -1'], '', /within bins/],
    [['scale log'], '', /log/],
    [['zero off'], '', /zero off/],
    [['series a "A"'], '', /takes 0 series/],
    [[], 'scene "x" mode=once\n  light c x=0.35\n', /not in the chart/],
    [[], 'scene "x" mode=once\n  reveal c.a\n', /a histogram chart without series has nothing to reveal/],
    [['row "x" value=1'], '', /uses "sample"/],
  ]) {
    await assert.rejects(buildFigure(`${withHead(lines)}${tail}`), message, lines.join('|') + tail);
  }
  await assert.rejects(buildFigure(`daphnis 2\n${chartSource('scatter', ['bins 0 1 2', 'point "p" x=0 y=0'])}`), /only for histogram/);
});

// 근거: 같은 폭의 구간은 큰 기준값 위에서도 반올림 때문에 서로 다른 폭으로 변하지 않는다.
test('histogram_large_offset_preserves_equal_bin_widths_and_boundary_membership', async () => {
  const minimum = 100000000000000;
  const values = Array.from({ length: 9 }, (_, i) => minimum + i * 1.25);
  const source = doc(['x "값(ms)"', 'y "관측(건)"', `bins ${minimum} ${minimum + 10} 8`, ...samples(values)]);
  const bins = chartModelOf(await buildFigure(source, { strict: true })).bins;
  assert.deepEqual(bins.map((bin) => bin.upper - bin.lower), Array(8).fill(1.25));
  assert.deepEqual(bins.map((bin) => bin.count), [1, 1, 1, 1, 1, 1, 1, 2]);
});

const AUTO = ['x "값(ms)"', 'y "관측(건)"', 'bins auto'];

// 근거: charts.md 자동 구간은 관측 순서를 보존하고 마지막 경계까지 모든 값을 한 번씩 센다.
test('histogram_auto_counts_all_samples_and_discloses_actual_bins', async () => {
  const values = Array.from({ length: 8 }, (_, i) => i);
  for (const input of [values, values.toReversed(), values.map((value) => value * 10 - 30)]) {
    const result = await buildFigure(doc([...AUTO, ...samples(input)]), { strict: true });
    assert.deepEqual(chartModelOf(result).bins.map((bin) => bin.count), [2, 2, 2, 2]);
    assert.deepEqual(chartModelOf(result).rows.map((row) => row.values.value), input);
    const html = await toHtml(result, 'automatic');
    assert.match(html, /Sturges/);
    assert.match(html, /적용 4개/);
    assert.match(html, /전체 관측값 8개/);
  }
});

test('histogram_auto_handles_constant_and_precision_limited_ranges_without_losing_samples', async () => {
  const base = 1e14;
  const cases = [[0], [-5, -5], [1e15 - 0.125], [-1e15 + 0.125], ...[1, -1].map((sign) => Array.from({ length: 16 }, (_, i) => sign * (base + (i % 2) * 0.015625)))];
  for (const input of cases) {
    const result = await buildFigure(doc([...AUTO, ...samples(input)]), { strict: true });
    const bins = chartModelOf(result).bins;
    assert.equal(bins.length, 1);
    assert.equal(bins[0].count, input.length);
    assert.ok(bins[0].lower < bins[0].upper);
    assert.ok(input.every((value) => value >= bins[0].lower && value <= bins[0].upper));
    const html = await toHtml(result, 'range');
    assert.match(html, input.length === 16 ? /정밀도/ : /표시 범위/);
  }
});

test('histogram_auto_preserves_input_validation_and_matches_json_samples', async () => {
  for (const bins of [['bins auto 4'], ['bins "auto"'], ['bins auto', 'bins auto'], ['bins 0 1 2', 'bins auto'], ['bins auto', 'bins 0 1 2']]) {
    await assert.rejects(buildFigure(doc([...bins, 'sample 0'])), /bins/, bins.join('|'));
  }
  await assert.rejects(buildFigure(doc(['bins auto'])), /row|sample|data/);
  for (const value of ['1e15', '-1e15', 'NaN', '1e309', '1e-320']) await assert.rejects(buildFigure(doc([...AUTO, `sample ${value}`])), undefined, value);
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'samples.json'), JSON.stringify(INPUT.map((value) => ({ value }))));
    const json = await buildFigure(doc([...AUTO, 'data "samples.json"']), { baseDir: folder, strict: true });
    const inline = await buildFigure(doc([...AUTO, ...samples(INPUT)]), { strict: true });
    assert.deepEqual(chartModelOf(json).bins, chartModelOf(inline).bins);
    assert.equal(chartOf(json).body, chartOf(inline).body);
  });
});
