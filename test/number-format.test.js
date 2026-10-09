// 출력 숫자 서식: 실행 환경(Node 버전)마다 달라지는 부동소수 끝자리가 파일 바이트에 남지 않는다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { createClock } from '../src/animate/clock.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { SHARE_PLACES } from '../src/chart/scale.js';
import { roundedNumbers, roundTo } from '../src/format.js';
import { histogramValue } from '../src/histogram.js';
import { DECIMALS_MAX } from '../src/source/grammar.js';
import { roundCoord } from '../src/text.js';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const NOISE = 1e-12;
const NOISY_MATH = ['sqrt', 'hypot', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'cbrt'];
// 소수 자릿수가 이보다 길면 부동소수 끝자리가 샌 것이다(keyTimes의 다섯 자리가 가장 길다)
const LONGEST_DECIMALS = 5;
// 글꼴 토큰 같은 정본 글자값은 계산 결과가 아니라서 검사에서 뺀다
const CUSTOM_PROPERTY = /--[\w-]+: [^;]*;/g;
// 사람이 읽는 글 칸: 접근성 이름, 제목, SVG 글, 표 칸(여는 태그부터 닫는 태그까지, 안에 다른 태그가 없는 것만)
const VISIBLE_TEXT = /aria-label="[^"]*"|<title>[^<]*<\/title>|<(text|td|th)\b[^>]*>[^<]*<\/\1>/g;
// 원 조각의 원자료 비율(값 ÷ 합계)을 담은 속성 하나만 뺀다. 그림 숫자가 아니라 반올림하지 않는다.
// SVG와 HTML 그림 마크업에는 `data-fraction="0.3076923076923077"`, HTML 재생기 데이터(JSON)의 차트 프레임에는 `"data-fraction":"0.3076923076923077"`으로 들어간다.
// 값 자리는 숫자 글자만 받아서 이 패턴이 보이는 글, 좌표, 표 칸을 지울 수 없다.
const FRACTION_VALUE = '[0-9.eE+-]+';
const RAW_FRACTION = new RegExp(`data-fraction="${FRACTION_VALUE}"|"data-fraction":"${FRACTION_VALUE}"`, 'g');
const MARKUP_FRACTION = new RegExp(`data-fraction="(${FRACTION_VALUE})"`, 'g');
const FRAME_FRACTION = /"data-fraction":"/g;
// 재생기 데이터는 문서 끝 `figurePlay(그림, JSON)` 호출에 한 번 들어간다(JSON.stringify 뒤 `<`만 <로 바꾼다)
const PLAYER_CALL = /figurePlay\(document\.querySelector\('\.fl-figure'\), (.*)\);\n<\/script>/s;

const sources = readdirSync(EXAMPLES).filter((f) => f.endsWith('.dap'));

// 히스토그램 구조 자료는 보이는 글이 아니라서 반올림하지 않는다. data-value는 계산 전 높이(막대 높이와 구간표 칸의 원값, 시험이 읽어 면적 합을 잰다)이고,
// rowKeys의 `x=왼쪽 끝`은 `light x=값`이 구간을 찾는 이름이라 반올림하면 다른 구간과 같아질 수 있다. 정규식으로 숫자꼴을 넓게 지우지 않고,
// 모형에서 계산한 정확한 글자(구간마다 `data-value="높이"`, 차트마다 `"rowKeys":[...]`)만 뺀다. 같은 글자가 아닌 긴 숫자는 그대로 관문에 걸린다.
function histogramMetadata(result) {
  const charts = result.figure.nodes.filter((node) => node.shape === 'chart' && node.plot.chartType === 'histogram').map((node) => node.plot.chart);
  return charts.flatMap((chart) => [`"rowKeys":${JSON.stringify(chart.bins.map((bin) => `x=${bin.lower}`))}`, ...chart.bins.map((bin) => `data-value="${histogramValue(bin, chart)}"`)]);
}

// cost: time O(m·n), heap O(n), stack O(1)
// vars: m = 흔드는 Math 함수 수, n = 원본 수
// basis: estimate
// Math 함수 결과에 noise를 더해 두 Node 버전의 끝자리 차이를 흉내 내고 body를 돌린 뒤 되돌린다.
async function withNoisyMath(noise, body) {
  const originals = NOISY_MATH.map((name) => [name, Math[name]]);
  for (const [name, original] of originals) Math[name] = (...args) => original(...args) + noise;
  try {
    return await body();
  } finally {
    for (const [name, original] of originals) Math[name] = original;
  }
}

// cost: time O(build), heap O(out), stack O(1), io 1
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 예제 하나의 SVG와 HTML 글.
async function render(file) {
  const result = await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES });
  return { svg: await toSvg(result, { name: file }), html: await toHtml(result, file) };
}

// 근거: 이슈 #96 "Node 26과 22의 SVG 바이트가 다르다". 끝자리가 1e-12 흔들려도 같은 바이트여야 한다
test('outputs_are_byte_equal_when_calculation_results_wobble_by_1e-12', async () => {
  for (const file of sources) {
    const plain = await render(file);
    const wobbled = await withNoisyMath(NOISE, () => render(file));

    assert.equal(wobbled.svg, plain.svg, `${file} svg`);
    assert.equal(wobbled.html, plain.html, `${file} html`);
  }
});

// 근거: 이슈 #96 "출력 좌표와 keyTimes를 정해진 자릿수로 반올림". 어떤 그림 숫자(좌표, 길이, 시각)도 정해진 자릿수보다 길지 않다.
// 보이는 글(접근성 이름, 제목, 표 칸), 좌표, keyTimes는 모두 이 관문 아래에 있다. 빼는 것은 구조 자료 둘뿐이다.
// 하나는 원 조각의 data-fraction(SVG 속성과 HTML 프레임 JSON의 같은 이름)이다. 그림 숫자가 아니라 값 ÷ 합계의 원자료 비율이고, 아래 시험들이 모형과 프레임마다 맞는지 잰다.
// 다른 하나는 히스토그램의 data-value와 rowKeys다(histogramMetadata). 모형에서 계산한 정확한 글자만 빼고, 같은 값이 보이는 글에서 정해진 자릿수로 적혔는지는 histogram-normalization 시험이 잰다.
// 자릿수 상한은 글 종류에 따라 둘이다. 좌표, 크기, keyTimes는 DIGITS 상한(5)이다. 사람이 읽는 차트 값 글자(접근성 이름, 제목, SVG 글, 표 칸)는 차트 숫자 서식이 쓰는 `decimals` 상한(DECIMALS_MAX, 6)이다.
// 값 글자도 이 상한을 넘으면 걸리므로 반올림하지 않은 부동소수(0.003220858895705515)는 어느 쪽에도 남을 수 없다.
test('outputs_never_carry_more_decimals_than_the_fixed_digits', async () => {
  const tooLong = new RegExp(`\\d\\.\\d{${LONGEST_DECIMALS + 1},}`);
  const tooLongForText = new RegExp(`\\d\\.\\d{${DECIMALS_MAX + 1},}`);
  for (const file of sources) {
    const result = await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES });
    const { svg, html } = { svg: await toSvg(result, { name: file }), html: await toHtml(result, file) };
    const exact = histogramMetadata(result);

    for (const [kind, text] of [['svg', svg], ['html', html]]) {
      const stripped = exact.reduce((rest, metadata) => rest.split(metadata).join(''), text.replace(CUSTOM_PROPERTY, '').replace(RAW_FRACTION, ''));
      const noisyText = [...stripped.matchAll(VISIBLE_TEXT)].map((m) => m[0]).find((span) => tooLongForText.test(span));
      assert.equal(noisyText, undefined, `${file} ${kind} 값 글자: ${noisyText}`);
      const found = stripped.replace(VISIBLE_TEXT, '').match(new RegExp(`.{0,40}${tooLong.source}.{0,10}`));
      assert.equal(found, null, `${file} ${kind}: ${found?.[0]}`);
    }
  }
});

// 근거: 원 조각의 data-fraction은 원자료 비율이다. 출력에 끝자리가 새도 되는 이유는 값 ÷ 합계가 정확히 반올림된 하나의 부동소수라서 Node 버전이 달라도 같은 글자이기 때문이다(위 1e-12 흔들림 시험이 바이트 동일을 지킨다).
test('pie_slice_fraction_metadata_is_the_exact_ratio_of_the_values_and_sums_to_one', async () => {
  let checked = 0;
  for (const file of sources) {
    const result = await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES });
    const parts = result.figure.nodes.filter((node) => node.shape === 'chart').flatMap((node) => node.plot.chart.parts ?? []);
    if (!parts.length) continue;
    const { svg } = await render(file);
    const attributes = [...svg.matchAll(/data-fraction="([^"]*)"/g)].map((m) => Number(m[1]));
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    const isBound = result.figure.nodes.some((node) => node.shape === 'chart' && node.plot.chart.rows.some((row) => Object.keys(row.bind ?? {}).length > 0));

    for (const [index, part] of parts.entries()) assert.ok(Math.abs(part.fraction - part.value / total) < 1e-12, `${file} 조각 ${index}: ${part.fraction} ≠ ${part.value}/${total}`);
    assert.equal(attributes.length, parts.length, `${file}: 조각마다 하나`);
    assert.ok(attributes.every((fraction) => Number.isFinite(fraction) && fraction >= 0 && fraction <= 1), `${file}: 비율은 0 이상 1 이하다`);
    assert.ok(Math.abs(attributes.reduce((sum, fraction) => sum + fraction, 0) - 1) < 1e-9, `${file}: 비율의 합이 1이다`);
    // 묶인 값이 있으면 그림의 비율은 재생이 끝난 값으로 계산하므로 시작 값의 모형과 다르다. 묶이지 않은 원은 모형과 글자까지 같다.
    if (!isBound) assert.deepEqual(attributes, parts.map((part) => part.fraction), `${file}: 조각마다 모형의 비율이다`);
    checked += 1;
  }
  assert.ok(checked >= 2, '원과 도넛 예제를 모두 본다');
});

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 재생기 데이터 값 수, d = 중첩 깊이
// basis: estimate
// 재생기 데이터에서 차트 프레임 묶음(카드 id → { marks, frames }). 넓은 배치와 좁은 배치(responsive)의 것을 모두 돌려준다.
function chartFramesOf(html) {
  const data = JSON.parse(PLAYER_CALL.exec(html)[1]);
  return [data.chartFrames, data.responsive?.data.chartFrames].filter(Boolean);
}

// 근거: HTML 재생기 데이터의 차트 프레임(JSON)에도 같은 data-fraction이 문자열로 들어간다. 프레임은 묶인 값이 바뀔 때마다 하나라서, 모든 프레임이 그 프레임의 값으로 계산한 비율이어야 한다.
// 전체 정밀도로 두는 이유는 SVG 속성과 같다. 이 값은 보이는 숫자가 아니라 값 ÷ 합계 하나가 정확히 반올림된 부동소수이고, 어디에도 따로 반올림한 사본이 없어 재생 결과와 어긋날 수 없다. 보이는 퍼센트는 aria-label과 입력 데이터 표가 정해진 자릿수로 따로 적는다.
// 그래서 여기서는 끝과 처음을 견주지 않고 프레임마다 합이 1인지와 그 프레임의 보이는 퍼센트 글과 같은 값인지를 잰다.
test('pie_slice_fraction_in_every_html_frame_is_finite_between_0_and_1_sums_to_one_and_matches_the_frames_percent', async () => {
  let boundCards = 0;
  for (const file of sources) {
    const result = await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES });
    const cards = new Map(result.figure.nodes.filter((node) => node.shape === 'chart' && node.plot.chart.parts).map((node) => [node.id, node.plot.chart]));
    const html = await toHtml(result, file);
    let slicesInFrames = 0;

    for (const chartFrames of chartFramesOf(html)) {
      for (const [cardId, { frames }] of Object.entries(chartFrames)) {
        const chart = cards.get(cardId);
        // 다른 종류의 묶인 차트(선 등)는 data-fraction이 없다. 있었다면 아래 JSON 개수 검사가 잡는다.
        if (!chart) continue;
        const places = chart.decimals ?? SHARE_PLACES;
        const fractionsOf = frames.map((frame) => Object.values(frame).filter(({ attrs }) => 'data-fraction' in attrs));
        boundCards += 1;

        for (const [f, slices] of fractionsOf.entries()) {
          const where = `${file} ${cardId} 프레임 ${f}`;
          const fractions = slices.map(({ attrs }) => Number(attrs['data-fraction']));
          assert.equal(slices.length, chart.parts.length, `${where}: 조각마다 하나`);
          assert.ok(fractions.every((fraction) => Number.isFinite(fraction) && fraction >= 0 && fraction <= 1), `${where}: 비율은 0 이상 1 이하다 ${fractions}`);
          assert.ok(Math.abs(fractions.reduce((sum, fraction) => sum + fraction, 0) - 1) < 1e-9, `${where}: 비율의 합이 1이다 ${fractions}`);
          for (const [i, { attrs }] of slices.entries()) {
            const shown = /· ([0-9.]+)%$/.exec(attrs['aria-label']);
            assert.ok(shown, `${where} 조각 ${i}: 보이는 퍼센트가 있다 ${attrs['aria-label']}`);
            assert.ok(Math.abs(Number(shown[1]) - fractions[i] * 100) <= 0.5 * 10 ** -places + 1e-9, `${where} 조각 ${i}: ${shown[1]}% ≠ ${fractions[i]}`);
          }
          slicesInFrames += slices.length;
        }
        // 프레임 하나뿐이면 위 검사가 값이 바뀌는 쪽을 보지 못한다. 묶인 원은 프레임마다 비율이 달라야 한다.
        assert.ok(new Set(fractionsOf.map((slices) => slices.map(({ attrs }) => attrs['data-fraction']).join())).size > 1, `${file} ${cardId}: 프레임마다 비율이 다르다`);
      }
    }
    // 뺀 속성이 프레임에서 읽은 조각 수와 정확히 같아야 한다. 이 밖의 곳에 같은 이름이 숨어 있으면 위 구조 검사가 보지 못하므로 실패한다.
    assert.equal(html.match(FRAME_FRACTION)?.length ?? 0, slicesInFrames, `${file}: JSON의 data-fraction은 읽은 프레임 조각뿐이다`);

    // 그림 마크업(SVG 속성 꼴)의 비율도 그림 하나마다(조각 수 단위) 합이 1이다.
    const markup = [...html.matchAll(MARKUP_FRACTION)].map((m) => m[1]);
    const parts = [...cards.values()][0]?.parts.length;
    if (!parts) continue;
    assert.equal(markup.length % parts, 0, `${file}: 마크업 비율은 그림 하나에 조각 수만큼이다`);
    for (let at = 0; at < markup.length; at += parts) {
      const group = markup.slice(at, at + parts);
      assert.ok(Math.abs(group.reduce((sum, fraction) => sum + Number(fraction), 0) - 1) < 1e-9, `${file}: 마크업 비율의 합이 1이다 ${group}`);
    }
  }
  assert.ok(boundCards >= 1, '값에 묶인 도넛 예제를 본다');
});

// 근거: 이슈 #96. 반올림 경계(12.25, 0.000005)가 1e-12 위아래 어느 쪽이어도 같은 값
test('rounding_is_stable_on_the_half_boundary', () => {
  const clock = createClock(1000000);

  for (const noise of [-NOISE, 0, NOISE]) {
    assert.equal(roundCoord(12.25 + noise), 12.3);
    assert.equal(roundCoord(0.05 + noise), 0.1);
    assert.equal(clock.keyTime(5 + noise * 1e6), clock.keyTime(5));
    assert.equal(clock.percent(5 + noise * 1e6), clock.percent(5));
  }
});

// 근거: 이슈 #103 완료 조건 "재생기 데이터와 SVG에 비유한 숫자가 들어가지 않는다". JSON.stringify가 null로 바꿔 숨기지 않고 직렬화 직전에 오류로 끝낸다
test('serializing_a_non_finite_number_fails_instead_of_writing_null_NaN_or_Infinity', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => roundTo(bad, 5), RangeError, String(bad));
    assert.throws(() => JSON.stringify({ t1: bad }, roundedNumbers), RangeError, String(bad));
  }
  assert.equal(JSON.stringify({ t1: 1.5, none: null }, roundedNumbers), '{"t1":1.5,"none":null}');
});
