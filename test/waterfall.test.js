// 근거: charts.md 워터폴. 합계는 재입력하지 않고, 중간 합계 뒤에도 같은 누계를 잇는다.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { chartModelOf, chartOf, chartSource, withFolder } from './helpers.js';

const doc = (lines, tail = '') => `daphnis 2\n${chartSource('waterfall', lines)}${tail}`;
const HEADER = ['x "시간(ms)"'];
const ROWS = ['row "A" value=100', 'row "B" value=-30', 'total "중간"', 'row "C" value=20', 'total "최종"'];
const SOURCE = doc([...HEADER, ...ROWS]);

test('waterfall_intermediate_totals_do_not_reset_or_add_to_the_running_sum', async () => {
  const result = await buildFigure(SOURCE, { strict: true });
  const model = chartModelOf(result);
  assert.deepEqual(model.ledger.map(({ from, to }) => [from, to]), [[0, 100], [100, 70], [0, 70], [70, 90], [0, 90]]);
  assert.deepEqual(model.rows.map((row) => row.values.value), [100, -30, undefined, 20, undefined]);
  const html = await toHtml(result, 'waterfall');
  assert.match(html, /<th scope="row">중간<\/th><td>합계<\/td><td>자동 계산<\/td><td>70<\/td>/);
  assert.match(html, /100 − 30 = 70/);
  assert.doesNotMatch(await toSvg(result), /NaN|Infinity/);
});

test('waterfall_decimal_accumulation_preserves_small_changes_and_exact_cancellation', async () => {
  const result = await buildFigure(doc([...HEADER, 'row "A" value=0.1', 'row "B" value=0.2', 'total "합"', 'row "C" value=-0.3', 'total "영"']), { strict: true });
  assert.deepEqual(chartModelOf(result).ledger.map((row) => row.to), [0.1, 0.3, 0.3, 0, 0]);
  const large = await buildFigure(doc([...HEADER, 'row "A" value=100000000000000', 'row "B" value=0.125', 'total "합"']), { strict: true });
  assert.equal(chartModelOf(large).ledger[2].to, 100000000000000.125);
  await assert.rejects(buildFigure(doc([...HEADER, 'row "A" value=100000000000000', 'row "B" value=0.001'])), /too small to represent/);
});

test('waterfall_signed_and_zero_values_keep_zero_based_totals_and_continuous_connectors', async () => {
  const result = await buildFigure(doc([...HEADER, 'total "시작"', 'row "손실" value=-5', 'row "없음" value=0', 'total "부족"', 'row "회복" value=8', 'total "끝"']), { strict: true });
  const { body } = chartOf(result);
  assert.deepEqual(chartModelOf(result).ledger.map((row) => row.to), [0, -5, -5, -5, 3, 3]);
  // 모든 행은 막대와 영점 표시선을 둘 다 가진 안정 슬롯이고, 영점 표시선은 막대 길이가 0일 때만 굵기가 있다.
  const zeroMarks = [...body.matchAll(/<line [^>]*stroke-width="([\d.]+)"[^>]*class="chart-waterfall-zero"/g)].map((m) => Number(m[1]));
  assert.equal(zeroMarks.length, 6);
  assert.equal(zeroMarks.filter((width) => width > 0).length, 2, '길이 0인 행(시작 합계, 변화 없음)만 영점 표시선이 보인다');
  assert.equal((body.match(/chart-waterfall-connector/g) ?? []).length, 5);
  const allBars = [...body.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)"[^>]*class="chart-waterfall-bar"/g)].map((m) => [Number(m[1]), Number(m[3])]);
  assert.equal(allBars.length, 6);
  assert.deepEqual(allBars.map(([, width]) => width > 0), [false, true, false, true, true, true], '길이 0인 막대도 요소는 있다');
  const boxes = allBars.filter(([, width]) => width > 0);
  assert.equal(boxes.length, 4);
  assert.deepEqual(boxes[0], boxes[1], '손실 막대와 음수 합계는 같은 두 끝을 갖는다');
  assert.match(body, /transform-origin: right center/);
  const zero = await buildFigure(doc([...HEADER, 'row "없음" value=0', 'total "합"']), { strict: true });
  assert.ok(chartModelOf(zero).ledger.every((row) => row.to === 0));
});

test('waterfall_json_rows_match_inline_changes_and_computed_totals', async () => {
  await withFolder(async (folder) => {
    const source = doc([...HEADER, 'data "rows.json"']);
    const path = join(folder, 'rows.json');
    writeFileSync(path, JSON.stringify([{ label: 'A', value: 100 }, { label: 'B', value: -30 }, { label: '중간', total: true }, { label: 'C', value: 20 }, { label: '최종', total: true }]));
    assert.equal(chartOf(await buildFigure(source, { baseDir: folder, strict: true })).body, chartOf(await buildFigure(SOURCE)).body);
    for (const record of [{ label: 'x', total: 'true' }, { label: 'x', total: true, value: 3 }, { label: 'x' }, { value: 1 }, { label: 'x', value: '1' }]) {
      writeFileSync(path, JSON.stringify([record]));
      await assert.rejects(buildFigure(source, { baseDir: folder }), undefined, JSON.stringify(record));
    }
  });
});

// 근거: charts.md 빠진 값 `-`. JSON의 null은 행 줄의 `value=-`와 같은 빠진 증감이고 0이 아니다. 누계는 그 행부터 알 수 없다.
test('waterfall_json_null_is_a_missing_change_like_the_inline_dash_and_the_running_total_is_unknown_from_there', async () => {
  await withFolder(async (folder) => {
    const lines = ['row "A" value=10', 'row "B" value=-', 'row "C" value=5', 'total "T"'];
    writeFileSync(join(folder, 'rows.json'), JSON.stringify([{ label: 'A', value: 10 }, { label: 'B', value: null }, { label: 'C', value: 5 }, { label: 'T', total: true }]));
    const inline = await buildFigure(doc([...HEADER, ...lines]), { strict: true });
    const fromData = await buildFigure(doc([...HEADER, 'data "rows.json"']), { baseDir: folder, strict: true });

    assert.equal(chartOf(fromData).body, chartOf(inline).body);
    assert.deepEqual(chartModelOf(inline).ledger.map(({ to }) => to), [10, null, null, null], '0이 아니고 알 수 없다');
    assert.doesNotMatch(chartOf(inline).body, /NaN|Infinity|undefined/);
    assert.notEqual(chartOf(inline).body, chartOf(await buildFigure(doc([...HEADER, 'row "A" value=10', 'row "B" value=0', 'row "C" value=5', 'total "T"']))).body, '빠진 증감은 0 증감과 다르게 그려진다');
  });
});

test('waterfall_rejects_cumulative_overflow_ambiguous_totals_and_incompatible_options', async () => {
  for (const [source, message] of [
    [doc([...HEADER, 'row "A" value=900000000000000', 'row "B" value=200000000000000']), /cumulative.*under/],
    [doc([...HEADER, `row "A" value=0.${'0'.repeat(306)}1`, `row "B" value=-0.${'0'.repeat(307)}9`]), /cumulative.*at least/],
    [doc([...HEADER, ...ROWS, 'total "최종"']), /appears twice/],
    [doc([...HEADER, ...ROWS, 'total "다른" value=90']), /write a total/],
    [doc([...HEADER, ...ROWS, 'row "기타" value=-x']), /number|value/],
    [doc([...HEADER, ...ROWS, 'row "기타" value=3 value.low=2 value.high=4']), /not a value/],
    [doc([...HEADER, ...ROWS, 'series s "S"']), /takes 0 series/],
    [doc(['scale log', ...HEADER, ...ROWS]), /log/],
    [doc(['zero off', ...HEADER, ...ROWS]), /zero off/],
    [doc([...HEADER, ...ROWS], 'scene "선택" mode=once\n  light c "없음"\n'), /not in the chart/],
    [`daphnis 2\n${chartSource('scatter', ['total "x"', 'point "p" x=1 y=1'])}`, /only for waterfall/],
  ]) await assert.rejects(buildFigure(source), message, message.toString());
});
