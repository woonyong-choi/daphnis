// 근거: charts.md의 건수 보존, 비율 합과 밀도 면적, 축 단위·입력표 계약.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { histogramValue } from '../src/histogram.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { chartModelOf, chartOf, chartSource, withFolder } from './helpers.js';

const SAMPLES = [0, 0.1, 0.3, 0.3, 0.9, 1];
const LIGHT = 'scene "선택" mode=once\n  light c x=0\n';
// 차트 카드 하나의 원본. data가 거짓이 아니면 표본 줄 대신 data 줄을 쓴다.
const source = (measure, bins = '0 1 10', input = SAMPLES.map((value) => `sample ${value}`)) =>
  `daphnis 2\n${chartSource('histogram', ['x "지연(ms)"', `y "${measure === 'density' ? '확률밀도(1/ms)' : '비율(0~1)'}"`, `bins ${bins} measure=${measure}`, ...input])}${LIGHT}`;

test('histogram_normalization_preserves_samples_counts_and_probability_mass', async () => {
  for (const measure of ['count', 'probability', 'density']) {
    const result = await buildFigure(source(measure), { strict: true });
    const chart = chartModelOf(result);
    assert.deepEqual(chart.rows.map((row) => row.values.value), SAMPLES);
    assert.deepEqual(chart.bins.map((bin) => bin.count), [1, 1, 0, 2, 0, 0, 0, 0, 0, 2]);
    const heights = chart.bins.map((bin) => histogramValue(bin, chart));
    const mass = heights.reduce((sum, height, i) => sum + height * (measure === 'density' ? chart.bins[i].upper - chart.bins[i].lower : 1), 0);
    assert.ok(Math.abs(mass - (measure === 'count' ? SAMPLES.length : 1)) < 1e-12);
    assert.equal(heights[2], 0);
    if (measure === 'density') assert.ok(heights[3] > 1);
    const displayed = [...chartOf(result).body.matchAll(/data-value="([^"]+)"/g)].map((match) => Number(match[1]));
    assert.deepEqual(displayed, heights);
    const svg = await toSvg(result);
    assert.match(svg, /data-count="2"/);
    const html = await toHtml(result, '정규화');
    if (measure !== 'count') assert.match(html, /높이는 건수 ÷ 전체 관측 수/);
    if (measure === 'density') assert.match(html, /막대 면적의 합은 1/);
    if (measure !== 'count') assert.match(chartOf(result).body, />0\.[1-9]\d*<\/text>/);
  }
});

test('histogram_density_changes_with_units_while_probability_is_invariant', async () => {
  for (const measure of ['probability', 'density']) {
    const small = chartModelOf(await buildFigure(source(measure)));
    const large = chartModelOf(await buildFigure(source(measure, '0 1000 10', SAMPLES.map((value) => `sample ${value * 1000}`))));
    small.bins.forEach((bin, i) => assert.ok(Math.abs(histogramValue(bin, small) - histogramValue(large.bins[i], large) * (measure === 'density' ? 1000 : 1)) < 1e-12));
  }
});

test('histogram_normalization_works_with_automatic_bins_and_json', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'samples.json'), JSON.stringify(SAMPLES.map((value) => ({ value }))));
    for (const measure of ['probability', 'density']) {
      const a = await buildFigure(source(measure, 'auto'), { strict: true });
      const b = await buildFigure(source(measure, 'auto', ['data "samples.json"']), { strict: true, baseDir: folder });
      assert.equal(chartOf(a).body, chartOf(b).body);
      assert.equal(chartModelOf(b).binning.measure, measure);
    }
  });
});

test('histogram_normalization_rejects_invalid_options_and_unrepresentable_density', async () => {
  for (const option of ['measure=percent', 'measure="density"', 'measure=density measure=count', 'unknown=density']) {
    await assert.rejects(buildFigure(source('density').replace('measure=density', option)), /bins/, option);
  }
  await assert.rejects(buildFigure(`daphnis 2\n${chartSource('histogram', ['bins 0 0.00000000000000000001 2 measure=density', 'sample 0'])}`), /normalized histogram.*under/);
  await assert.rejects(buildFigure(`daphnis 2\n${chartSource('histogram', ['bins auto measure=density'])}`), /row|sample|data/);
});

// 근거: charts.md 계산값 표시는 기존 decimals 규칙을 따르고 반올림 전 값으로 계산한다. 보이는 글(접근성 이름, 제목, 구간표)과 구조 자료(data-value, rowKeys)를 나눠 잰다.
const PLAYER_CALL = /figurePlay\(document\.querySelector\('\.fl-figure'\), (.*)\);\n<\/script>/s;
const ranged = (lines) => `daphnis 2\n${chartSource('histogram', ['x "값(ms)"', 'y "높이(건)"', ...lines])}`;
const labelsOf = (svg) => [...svg.matchAll(/aria-label="(\[[^"]*)"/g)].map((m) => m[1]);
const titlesOf = (svg) => [...svg.matchAll(/<title>(\[[^<]*)<\/title>/g)].map((m) => m[1]);
const rangesOf = (html) => [...html.matchAll(/<th scope="row">(\[[^<]*)<\/th>/g)].map((m) => m[1]);
const cellsOf = (html) => [...html.matchAll(/<td data-value="([^"]*)">([^<]*)<\/td>/g)].map((m) => ({ raw: m[1], shown: m[2] }));
const keysOf = (html) => Object.values(JSON.parse(PLAYER_CALL.exec(html)[1]).chartMeta).map((meta) => meta.rowKeys);

test('histogram_auto_density_text_uses_the_table_format_and_data_value_keeps_full_precision', async () => {
  const result = await buildFigure(ranged(['bins 22 1000 7 measure=density', ...[22, 30, 40, 500, 1000].map((v) => `sample ${v}`)]), { strict: true });
  const chart = chartModelOf(result);
  const svg = await toSvg(result);
  const html = await toHtml(result, 'auto');
  const first = (3 / 5 / (978 / 7)).toFixed(6);

  assert.equal(labelsOf(svg)[0], `[22, 161.714286): ${first} 확률밀도 (3건)`);
  assert.deepEqual(titlesOf(svg), labelsOf(svg));
  assert.equal(labelsOf(svg).length, 7);
  assert.equal(rangesOf(html)[0], '[22, 161.714286)');
  assert.equal(rangesOf(html).at(-1), '[860.285714, 1000]');
  assert.equal(cellsOf(html)[0].shown, first);
  // 같은 모형이 SVG 막대 이름과 표 칸에 같은 글자로 나간다
  assert.deepEqual(cellsOf(html).map((cell) => cell.shown), labelsOf(svg).map((label) => /: (\S+) 확률밀도/.exec(label)[1]));
  // 구조 자료는 반올림 전 값 그대로다: 막대와 표 칸의 data-value가 계산값과 같고, 6자리보다 길다
  const heights = chart.bins.map((bin) => histogramValue(bin, chart));
  assert.deepEqual([...svg.matchAll(/data-value="([^"]+)"/g)].map((m) => Number(m[1])), heights);
  assert.deepEqual(cellsOf(html).map((cell) => Number(cell.raw)), heights);
  assert.ok(heights.every((height) => Number.isFinite(height)) && String(heights[0]).split('.')[1].length > 6);
  // 경계 이름은 light가 찾는 이름이라 반올림하지 않는다(왼쪽 끝이 모두 다르다)
  assert.deepEqual(keysOf(html)[0], chart.bins.map((bin) => `x=${bin.lower}`));
  assert.ok(new Set(keysOf(html)[0]).size === chart.bins.length && keysOf(html)[0][1] === 'x=161.714285714286');
  // 보이는 글에는 6자리를 넘는 소수가 없다
  for (const text of [...labelsOf(svg), ...rangesOf(html), ...cellsOf(html).map((cell) => cell.shown)]) assert.doesNotMatch(text, /\.\d{7,}/, text);
});

test('histogram_text_respects_authored_decimals_and_never_merges_bins_that_round_alike', async () => {
  // decimals 2: 경계 −1, −0.5, 0, 0.5, 1은 두 자리로 구별된다. 음수도 같은 서식이다.
  const signed = await buildFigure(ranged(['decimals 2', 'bins -1 1 4 measure=probability', ...[-1, -0.4, 0.3, 1].map((v) => `sample ${v}`)]), { strict: true });
  assert.deepEqual(labelsOf(await toSvg(signed)), ['[-1.00, -0.50): 0.25 비율(0~1) (1건)', '[-0.50, 0.00): 0.25 비율(0~1) (1건)', '[0.00, 0.50): 0.25 비율(0~1) (1건)', '[0.50, 1.00]: 0.25 비율(0~1) (1건)']);

  // decimals 0은 경계 0.5, 1.5를 한 글자로 합친다. 구간이 합쳐져 읽히지 않도록 십진 표기로 쓰고, 높이는 적은 자릿수를 지킨다.
  const coarse = await buildFigure(ranged(['decimals 0', 'bins 0 3 6 measure=probability', ...[0, 0.6, 1.2, 2, 3].map((v) => `sample ${v}`)]), { strict: true });
  assert.deepEqual(rangesOf(await toHtml(coarse, 'coarse')), ['[0, 0.5)', '[0.5, 1)', '[1, 1.5)', '[1.5, 2)', '[2, 2.5)', '[2.5, 3]']);
  assert.ok(labelsOf(await toSvg(coarse)).every((label) => /: [01] 비율\(0~1\)/.test(label)));

  // 아주 작은 경계(자릿수로 0이 되는 값)는 0으로 쓰지 않고 정확한 십진 표기로 쓴다
  for (const lines of [['decimals 2'], []]) {
    const tiny = await buildFigure(ranged([...lines, 'bins 0 0.000001 4', 'sample 0', 'sample 0.0000009']), { strict: true });
    const html = await toHtml(tiny, 'tiny');
    assert.deepEqual(rangesOf(html), ['[0, 2.5e-7)', '[2.5e-7, 5e-7)', '[5e-7, 7.5e-7)', '[7.5e-7, 0.000001]']);
    assert.deepEqual(labelsOf(await toSvg(tiny)).map((label) => label.split(':')[0]), rangesOf(html));
  }

  // 1000 이상 경계도 k로 줄이지 않는다. 1250이 1.3k가 되면 경계가 바뀌어 읽힌다.
  const large = await buildFigure(ranged(['bins 1000 2000 4', 'sample 1250']), { strict: true });
  assert.deepEqual(rangesOf(await toHtml(large, 'large')), ['[1000, 1250)', '[1250, 1500)', '[1500, 1750)', '[1750, 2000]']);
});

test('histogram_with_no_observations_has_no_bin_text_or_metadata_and_count_heights_stay_integers', async () => {
  const empty = await buildFigure(ranged(['bins 0 1 4 measure=probability', 'sample -', 'sample -']), { strict: true });
  const svg = await toSvg(empty);
  const html = await toHtml(empty, 'empty');
  assert.deepEqual([labelsOf(svg), rangesOf(html), cellsOf(html), keysOf(html)], [[], [], [], [[]]]);
  assert.doesNotMatch(svg, /chart-histogram-bin|data-value/);

  // 건수는 계산값이 아니라 센 값이다. decimals를 적어도 건수에는 소수점을 붙이지 않는다.
  const counted = await buildFigure(ranged(['decimals 2', 'bins 0 1 2', 'sample 0.2', 'sample 0.7', 'sample 0.8']), { strict: true });
  assert.deepEqual(labelsOf(await toSvg(counted)), ['[0.00, 0.50): 1 관측 건수 (1건)', '[0.50, 1.00]: 2 관측 건수 (2건)']);
});

test('histogram_cards_have_no_chart_frames_so_no_frame_text_carries_unformatted_heights', async () => {
  // 히스토그램 표본은 값에 묶을 수 없어 재생 프레임이 없다. 프레임이 생기면 이 시험이 먼저 바뀌어야 한다.
  const result = await buildFigure(`${ranged(['bins 0 1 3 measure=density', 'sample 0.1', 'sample 0.5', 'sample 0.9'])}scene "재생" mode=once\n  reveal c\n`, { strict: true });
  assert.deepEqual(JSON.parse(PLAYER_CALL.exec(await toHtml(result, 'frames'))[1]).chartFrames, {});
  await assert.rejects(buildFigure(ranged(['bins 0 1 3', 'sample ms=depth'])), /sample/);
});
