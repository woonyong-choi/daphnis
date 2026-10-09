// 누적 막대의 합계, 입력 제한, JSON 연결(docs/design/charts.md 누적 막대).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { chartOf, chartSource, withFolder } from './helpers.js';

const HEADER = ['x "시간(ms)"', 'series a "실행"', 'series b "대기"'];
const ROWS = ['row "요청" a=30 b=20', 'row "캐시" a=10 b=0'];
const doc = (lines, tail = '') => `daphnis 2\n${chartSource('stacked', lines)}${tail}`;
// 조각 사이에는 바탕이 드러나는 틈(space.2)이 있다.
const GAP = values.space['2'];

// 근거: charts.md 누적 막대. 길이는 개별 값, 위치는 앞 값의 합이고 조각 사이에 틈이 있으며 0에 최소 폭을 더하지 않는다.
test('buildFigure_stacked_segments_join_at_the_cumulative_value_with_a_gap_and_keep_zero_width', async () => {
  const result = await buildFigure(doc([...HEADER, ...ROWS]));
  const rects = [...chartOf(result).body.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)"[^>]+class="stack-segment grow"/g)].map((m) => ({ x: +m[1], y: +m[2], w: +m[3] }));
  assert.equal(rects.length, 4);
  assert.equal(rects[0].y, rects[1].y);
  assert.ok(Math.abs(rects[0].x + rects[0].w + GAP - rects[1].x) < 0.02, '다음 조각은 앞 조각 끝에서 틈 하나 뒤에 시작한다');
  assert.ok(Math.abs((rects[0].w + GAP) / (rects[1].w + GAP) - 1.5) < 0.001, '틈을 더한 길이는 값에 비례한다');
  assert.equal(rects[3].w, 0);
  assert.match(await toSvg(result), /\+ 2: 20 = 50/);
});

// 근거: charts.md 누적 막대의 입력 제한과 재생 순서 계약. 음수와 결측은 이제 받는다(부호 있는 누적, 결측 행은 막대 없이 안내 글). 모두 0인 행도 받는다(charts.md 빠진 값과 0: 값이 모두 0이어도 오류가 아니다)
test('buildFigure_stacked_rejects_undefined_totals_and_out_of_order_reveals', async () => {
  const cases = [
    [[...HEADER, 'row "r" a=2'], /needs b=value/],
    [[...HEADER, 'row "r" a=1 a.low=0 a.high=2 b=2'], /not a value/],
    [[...HEADER, 'row "r" a=600000000000000 b=600000000000000'], /stack total/],
    [['scale log', ...HEADER, ...ROWS], /scale log/],
  ];
  for (const [lines, expected] of cases) await assert.rejects(buildFigure(doc(lines)), (error) => error.problems?.some((p) => expected.test(p.message)), lines.join('|'));
  await assert.rejects(buildFigure(doc([...HEADER, ...ROWS], 'scene "뒤부터"\n  reveal c.b\n  reveal c.a\n')), (error) => error.problems?.some((p) => /displayed order/.test(p.message)));
  for (const lines of [[...HEADER, 'row "r" a=-1 b=2'], [...HEADER, 'row "r" a=- b=2'], [...HEADER, 'row "r" a=0 b=0']]) await buildFigure(doc(lines), { strict: true });
});

// 근거: charts.md data 출처와 빠진 값("-, null, 키 없음"은 모두 값 없음). 행과 JSON은 같은 수치, 이름, 합계로 렌더링하고, JSON의 null과 없는 키는 결측으로 받는다. 입력 줄 `row "r" a=2`는 `b=-`를 쓰지 않으면 값이 빠진 오류다.
test('buildFigure_stacked_json_matches_inline_and_reads_null_and_absent_keys_as_missing', async () => {
  await withFolder(async (folder) => {
    const file = join(folder, 'data.json');
    writeFileSync(file, JSON.stringify([{ label: '요청', a: 30, b: 20 }, { label: '캐시', a: 10, b: 0 }]));
    const inline = await buildFigure(doc([...HEADER, ...ROWS]));
    const json = await buildFigure(doc([...HEADER, 'data "data.json"']), { baseDir: folder });
    assert.equal(chartOf(json).body, chartOf(inline).body);
    // null과 없는 키는 모두 결측이라 같은 그림이다
    writeFileSync(file, JSON.stringify([{ label: '요청', a: 30, b: null }]));
    const nulled = await buildFigure(doc([...HEADER, 'data "data.json"']), { baseDir: folder, strict: true });
    writeFileSync(file, JSON.stringify([{ label: '요청', a: 30 }]));
    const absent = await buildFigure(doc([...HEADER, 'data "data.json"']), { baseDir: folder, strict: true });
    assert.equal(chartOf(absent).body, chartOf(nulled).body, '없는 키는 null과 같은 결측이다');
    await assert.rejects(buildFigure(doc([...HEADER, 'row "요청" a=30']), { baseDir: folder }), (error) => error.problems?.some((p) => /needs b=value/.test(p.message)), '입력 줄은 결측을 `b=-`로 적어야 한다');
  });
});
