// 근거: charts.md 히스토그램은 축·제목을 고정하고 막대 높이만 0에서 자란다. 재생은 장면 시계를 따르므로 가짜 시계를 흘려 잰다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { histogramValue } from '../src/histogram.js';
import { toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';
import { chartModelOf, chartSource } from './helpers.js';
import { isReadable, openPaused, readChartPanel } from './mobile-chart.js';

const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
const open = openPaused;
// 표의 이름은 차트 제목 뒤에 "구간별 집계 표"가 붙는다.
const TABLE = '[aria-label$="구간별 집계 표"]';
// 첫 장면 "자람"은 차트 전체가 자라는 박자와 잠깐의 대기뿐이다(빈 장면은 오류다).
const GROW = 'scene "자람" mode=once\n  wait 1s\n';
const histogram = (lines, tail = GROW) => `daphnis 2\n${chartSource('histogram', lines, { title: '지연 분포' })}${tail}`;
// 구간 다섯 개(Sturges)에 8, 3, 2, 1, 2건이 들어가는 표본 열여섯 개
const AUTO_SAMPLES = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 2.2, 2.8, 3.4, 4.4, 5.6, 7, 8.5, 10];
const AUTO = histogram(['x "지연(ms)"', 'y "관측(건)"', 'bins auto', ...AUTO_SAMPLES.map((value) => `sample ${value}`)]);
// 구간 넷에 1, 1, 2, 2건이 들어가는 표본
const NORMALIZED_SAMPLES = [0.1, 0.35, 0.6, 0.65, 0.9, 0.95];
const normalized = (measure) => histogram(['x "지연(ms)"', `y "${measure === 'density' ? '확률밀도(1/ms)' : '비율(0~1)'}"`, `bins 0 1 4 measure=${measure}`, ...NORMALIZED_SAMPLES.map((value) => `sample ${value}`)], `${GROW}scene "선택" mode=once\n  light c x=0.5\n`);

// cost: time O(b), heap O(b), stack O(1), io 1
// vars: b = 막대 수
// basis: estimate
// 지금 화면의 첫 막대와 제목의 위치와 크기(자라는 중의 막대는 변환까지 반영한 화면 값이다).
function measureGrowth(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.dp-panel svg');
    const bar = svg.querySelector('.chart-histogram-bin').getBoundingClientRect();
    const title = svg.querySelector('.chart-title').getBoundingClientRect();
    return { height: bar.height, bottom: bar.bottom, width: bar.width, title: { x: title.x, y: title.y } };
  });
}

// 장면 시작에서 growMs/4가 지난 모습과 다 자란 모습을 재서, 막대 높이만 자라고 바닥선, 막대 폭, 제목은 그대로인지 확인한다.
async function assertGrowthKeepsFrame(page, growMs, label) {
  await page.clock.runFor(growMs / 4);
  const first = await measureGrowth(page);
  await page.clock.runFor(growMs);
  const last = await measureGrowth(page);

  assert.ok(first.height > 0 && first.height < last.height, `${label}: ${JSON.stringify({ first, last })}`);
  assert.ok(Math.abs(first.bottom - last.bottom) < 0.1 && Math.abs(first.width - last.width) < 0.1, label);
  assert.deepEqual(first.title, last.title, label);
}

// cost: time O(page), heap O(page), stack O(1), io 1
// vars: page = 브라우저 페이지 비용
// basis: estimate
test('histogram_vertical_reveal_keeps_the_baseline_width_and_title_fixed_on_mobile', async () => {
  const source = histogram(['x "지연(ms)"', 'y "관측(건)"', 'bins 0 10 5', ...AUTO_SAMPLES.map((value) => `sample ${value}`)], `${GROW}scene "선택" mode=once\n  light c x=2\n`);
  const result = await buildFigure(source);
  const browser = await launchChrome();
  try {
    const { page, errors } = await open(browser, await toHtml(result, 'histogram'), { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    await assertGrowthKeepsFrame(page, result.timeline.growMs, '모바일');
    await page.getByRole('tab', { name: '선택', exact: true }).click();
    // 밝힌 구간(x=2, 둘째 구간)만 선명하고 나머지는 흐려진다.
    const dim = await page.evaluate(() => [...document.querySelectorAll('.dp-panel svg [data-chart="c"] [class*="cr-"]')].filter((el) => !el.classList.contains('ink')).map((el) => [el.getAttribute('class').match(/cr-(\d+)/)[1], el.classList.contains('dim')]));
    assert.ok(dim.some(([row, isDim]) => row === '1' && !isDim), `밝힌 구간: ${JSON.stringify(dim)}`);
    assert.ok(dim.some(([row, isDim]) => row === '0' && isDim), `흐린 구간: ${JSON.stringify(dim)}`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});

// 근거: 자동 구간도 공통 차트의 고정 제목·막대 성장·원시 데이터 읽기 계약을 따른다.
for (const [engine, launch] of ENGINES) {
  test(`histogram_auto_${engine}_keeps_titles_fixed_and_data_readable_across_viewports`, async () => {
    const result = await buildFigure(AUTO, { strict: true });
    const html = await toHtml(result, 'automatic');
    const browser = await launch();
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
        const { page, errors } = await open(browser, html, { viewport: { width, height: 900 }, colorScheme });
        await assertGrowthKeepsFrame(page, result.timeline.growMs, `${colorScheme} ${width}px`);
        await page.locator('.fl-data summary').click();
        assert.match(await page.locator('.fl-data').innerText(), /Sturges.*적용 5개/);
        const counts = await page.locator(`${TABLE} tbody td`).allTextContents();
        assert.deepEqual(counts.map(Number), [8, 3, 2, 1, 2]);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally { await browser.close(); }
  });
}

// 근거: 좁은 화면은 글자를 줄이거나 구간을 누락하지 않고 같은 데이터를 판 안에서 옆으로 밀어 읽는다.
for (const [engine, launch] of ENGINES) {
  test(`histogram_${engine}_narrow_view_keeps_all_bins_and_text_readable_without_collisions`, async () => {
    const browser = await launch();
    const sources = [
      AUTO,
      normalized('probability'),
      normalized('density'),
      histogram(['x "매우 긴 가로축 설명과 단위(ms)"', 'y "요청 관측 건수의 자세한 설명(건)"', 'bins 100000000000000 100000000000010 8', 'rule 1 "한 건 이상 관측된 구간"', 'sample 100000000000000', 'sample 100000000000010']),
      histogram(['x "응답 지연(ms)"', 'y "요청 수(건)"', 'bins 0 100 100', 'rule 100000000000000 "큰 기준값"', 'sample 0', 'sample 100']),
    ];
    try {
      for (const source of sources) {
        const result = await buildFigure(source, { strict: true });
        const html = await toHtml(result, '모바일 분포');
        for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
          const { page, errors } = await open(browser, html, { viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
          const state = await readChartPanel(page);
          const counts = await page.evaluate(() => [...document.querySelectorAll('.dp-panel svg .chart-histogram-bin')].map((el) => Number(el.dataset.count)));

          assert.equal(state.pageOverflow <= 0, true, JSON.stringify({ engine, width, state }));
          assert.deepEqual(state.overlaps, [], `${engine} ${colorScheme} ${width}px`);
          assert.ok(isReadable(state.minSize), `${engine} ${colorScheme} ${width}px: 가장 작은 글자 ${state.minSize}px`);
          assert.deepEqual(counts, chartModelOf(result).bins.map((bin) => bin.count));
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}

// 근거: 정규화는 높이·눈금만 바꾸며 원시 건수, 기준선, 강조와 고정 제목을 보존한다.
for (const [engine, launch] of ENGINES) {
  test(`histogram_normalized_${engine}_keeps_fractional_ticks_data_and_growth_consistent`, async () => {
    const browser = await launch();
    try {
      for (const measure of ['probability', 'density']) {
        const result = await buildFigure(normalized(measure), { strict: true });
        const html = await toHtml(result, measure);
        const model = chartModelOf(result);
        const expected = model.bins.map((bin) => histogramValue(bin, model));
        for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
          const { page, errors } = await open(browser, html, { viewport: { width, height: 900 }, colorScheme });
          await assertGrowthKeepsFrame(page, result.timeline.growMs, `${measure} ${colorScheme} ${width}px`);
          await page.locator('.fl-data summary').click();
          assert.deepEqual((await page.locator(`${TABLE} tbody tr td:first-of-type`).allTextContents()).map(Number), [1, 1, 2, 2]);
          assert.deepEqual(await page.locator(`${TABLE} td[data-value]`).evaluateAll((cells) => cells.map((cell) => Number(cell.dataset.value))), expected);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.equal(await page.locator(TABLE).evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, `${engine} ${measure} ${width}: normalized table should fit`);
          assert.deepEqual(errors, []);
          await page.close();
        }
      }
    } finally { await browser.close(); }
  });
}
