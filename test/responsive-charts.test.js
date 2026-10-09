// 좁은 화면에서 일반 차트가 가로로 밀리지 않고 글이 읽히는 크기로 보이는지 잰다. 컴파일 단계(좁은 배치가 같은 사건 시간표를 쓰는가)와 실제 Chrome(320, 390, 430)을 함께 본다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure, reflowFigure } from '../src/build.js';
import { COMPACT_WIDTH } from '../src/canvas.js';
import { toHtml } from '../src/html.js';
import { values } from '../src/tokens.js';
import { launchChrome, readState, withPage } from './chrome.js';
import { MIXED, playerHtml } from './player-compiled.js';
import { CHARTS } from './responsive-charts-fixture.js';

const PHONES = [320, 390, 430];
const FLOOR = values.simple2['micro-size'];
// 값에 묶인 막대 차트가 그래프 카드와 차트 판에 함께 있는 그림에 쓰는 시간표 필드 가운데 좁은 배치에서 달라지는 것
const GEOMETRY = ['tracks', 'chipPath', 'gaps', 'pace', 'chipFade'];

// 시간표에서 길 기하(배치마다 다른 것)를 지운 사본
function withoutGeometry(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => (GEOMETRY.includes(key) ? undefined : item)));
}

describe('responsive charts: compile', () => {
  for (const [type, source] of Object.entries(CHARTS)) {
    test(`${type}_gets_a_narrow_build_that_fits_the_compact_width`, async () => {
      const wide = await buildFigure(source);
      assert.ok(wide.scene.panels[0].box.w > COMPACT_WIDTH, '넓은 배치는 컨테이너보다 넓다');
      const html = await toHtml(wide, 'static');
      assert.match(html, /<template class="fl-narrow">/, '차트 보기만 있는 그림도 좁은 배치를 싣는다');
      const narrow = await reflowFigure(wide, { chartWidth: COMPACT_WIDTH });
      assert.ok(narrow.scene.panels[0].box.w <= COMPACT_WIDTH, `${type}: ${narrow.scene.panels[0].box.w}`);
    });
  }

  test('a_document_without_a_wide_panel_gets_no_narrow_build', async () => {
    const small = await buildFigure('daphnis 2\nbox a "A"\n');
    assert.ok(small.scene.panels[0].box.w <= COMPACT_WIDTH);
    assert.doesNotMatch(await toHtml(small, 'static'), /<template class="fl-narrow">/);
  });

  test('the_narrow_build_keeps_the_canonical_timeline_and_chart_frames', async () => {
    const wide = await buildFigure(MIXED);
    const narrow = await reflowFigure(wide, { layoutWidth: COMPACT_WIDTH, chartWidth: COMPACT_WIDTH });
    assert.deepEqual(withoutGeometry(narrow.timeline), withoutGeometry(wide.timeline), '사건, 시각, 값, 강조는 배치와 무관하다');
    assert.deepEqual(narrow.timeline.charts, wide.timeline.charts, '프레임 구간과 바뀐 표식이 같다');
    assert.equal(narrow.scene.chartFrames.load.frames.length, wide.scene.chartFrames.load.frames.length);
    assert.deepEqual(narrow.scene.chartFrames.load.marks, wide.scene.chartFrames.load.marks, '표식 이름은 같다');
    assert.deepEqual(narrow.timeline.pulses, wide.timeline.pulses);
    const widths = narrow.scene.plots.map((plot) => plot.width);
    assert.deepEqual(widths, [COMPACT_WIDTH]);
  });

  test('the_chart_width_comes_from_the_tokens_not_a_literal', () => {
    assert.equal(COMPACT_WIDTH, values.size['figure-compact-width'] - 2 * values.simple2['page-gutter']);
  });

  test('a_graph_and_a_plot_get_the_narrow_width_and_a_graph_keeps_its_wide_card_when_timing_cannot_be_kept', async () => {
    const wide = await buildFigure(MIXED);
    const narrow = await reflowFigure(wide, { layoutWidth: COMPACT_WIDTH, chartWidth: COMPACT_WIDTH });
    const [graph] = narrow.scene.panels;
    assert.ok(graph.box.w < wide.scene.panels[0].box.w, '그래프도 좁아진다');
  });

  test('a_donut_prints_one_decimal_for_its_calculated_shares', async () => {
    const result = await buildFigure(CHARTS.donut);
    const body = result.scene.plots[0].chart.body;
    assert.match(body, /13 · 31\.0%/, '계산한 비율은 한 자리다');
    assert.doesNotMatch(body, /\d\.\d{3,}%/);
    const authored = await buildFigure(CHARTS.donut.replace('donut "예시 데이터" {', 'donut "예시 데이터" {\n  decimals 2'));
    assert.match(authored.scene.plots[0].chart.body, /13\.00 · 30\.95%/, '머리 줄 decimals가 있으면 그것을 쓴다');
  });
});

describe('responsive charts: Chrome', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  // 한 문서를 주어진 화면 폭으로 열고 판마다 넘침, 글 크기, 표시 배율을 읽는다.
  async function measure(source, width, colorScheme = 'light') {
    const html = await toHtml(await buildFigure(source), 'static');
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent(html);
    const read = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('.dp-panel')].map((panel) => {
        const svg = panel.querySelector('svg');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const texts = [...svg.querySelectorAll('text')].map((text) => parseFloat(getComputedStyle(text).fontSize) * scale);
        return { view: panel.dataset.view, over: panel.scrollWidth - panel.clientWidth, scale, minText: Math.min(...texts), svg: svg.getBoundingClientRect().toJSON(), box: svg.viewBox.baseVal.width };
      });
      return { layout: document.querySelector('.dp-panels').dataset.layout ?? 'wide', panels, hint: !document.querySelector('.fl-scroll-hint').hidden };
    });
    await page.close();
    assert.deepEqual(errors, []);
    return read;
  }

  for (const [type, source] of Object.entries(CHARTS)) {
    test(`${type}_fits_320_390_and_430_at_the_real_scale_with_the_11px_floor`, async () => {
      for (const width of PHONES) {
        const read = await measure(source, width);
        assert.equal(read.layout, 'narrow', `${type} ${width}`);
        const [panel] = read.panels;
        assert.ok(panel.over <= 1, `${type} ${width}: ${panel.over}px 밀린다`);
        assert.ok(Math.abs(panel.scale - 1) < 0.01, `${type} ${width}: 표시 배율 ${panel.scale}`);
        assert.ok(panel.minText >= FLOOR - 0.01, `${type} ${width}: 가장 작은 글 ${panel.minText}px`);
        assert.equal(read.hint, false, `${type} ${width}: 밀림 안내가 없다`);
      }
    });
  }

  test('a_donut_stays_inside_its_svg_at_390_and_the_wide_build_is_kept_on_desktop', async () => {
    const html = await toHtml(await buildFigure(CHARTS.donut), 'static');
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.setContent(html);
    const inside = await page.evaluate(() => {
      const svg = document.querySelector('.dp-panel svg').getBoundingClientRect();
      return [...document.querySelectorAll('.dp-panel .chart-part')].every((part) => {
        const box = part.getBoundingClientRect();
        return box.left >= svg.left - 1 && box.right <= svg.right + 1;
      });
    });
    assert.equal(inside, true, '도넛 조각이 모두 SVG 안에 있다');
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForFunction(() => document.querySelector('.dp-panels').dataset.layout === 'wide');
    await page.close();
  });

  test('two_consecutive_fits_at_390_keep_the_narrow_layout_and_resizing_back_returns_to_wide', async () => {
    const html = await toHtml(await buildFigure(CHARTS.ecdf), 'static');
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.setContent(html);
    for (let k = 0; k < 3; k++) {
      await page.evaluate(() => dispatchEvent(new Event('resize')));
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout), 'narrow', `${k}번째 맞춤`);
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForFunction(() => (document.querySelector('.dp-panels').dataset.layout ?? 'wide') === 'wide');
    await page.close();
  });

  test('the_mixed_document_reads_at_390_with_graph_and_plot_in_the_narrow_build_and_no_page_shrink', async () => {
    const read = await measure(MIXED, 390);
    assert.equal(read.layout, 'narrow');
    for (const panel of read.panels) {
      assert.ok(Math.abs(panel.scale - 1) < 0.01, `${panel.view}: 표시 배율 ${panel.scale}`);
      assert.ok(panel.minText >= FLOOR - 0.01, `${panel.view}: ${panel.minText}px`);
    }
    const plot = read.panels.find((panel) => panel.view === 'chart');
    assert.ok(plot.over <= 1, '차트 판은 밀리지 않는다');
  });

  test('resizing_to_390_and_back_keeps_scene_elapsed_and_the_chart_values_of_a_mixed_document_also_through_fullscreen', async () => {
    const { html } = await playerHtml(MIXED);
    const resizeTo = async (page, width) => {
      const resized = page.evaluate((wanted) => (innerWidth === wanted ? undefined : new Promise((resolve) => addEventListener('resize', resolve, { once: true }))), width);
      await page.setViewportSize({ width, height: 800 });
      await resized;
    };
    const chartTexts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-chart="load"]')].map((root) => [...root.querySelectorAll('[data-mark-text]')].map((el) => el.textContent).join(',')));
    await withPage(browser, html, { viewport: { width: 1200, height: 800 } }, async (page) => {
      await page.clock.runFor(1100);
      const before = await readState(page);
      const wideTexts = await chartTexts(page);
      await resizeTo(page, 390);
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout), 'narrow');
      const narrow = await readState(page);
      assert.deepEqual([narrow.scene, narrow.elapsed], [before.scene, before.elapsed]);
      assert.deepEqual(await chartTexts(page), wideTexts, '같은 시각의 차트 값은 배치와 무관하다');
      await page.getByRole('button', { name: '전체 화면', exact: true }).click();
      await resizeTo(page, 1000);
      await page.getByRole('button', { name: '전체 화면 끝내기', exact: true }).click();
      await resizeTo(page, 390);
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout), 'narrow', '전체 화면을 나와도 좁은 폭에서는 좁은 배치다');
      const reentered = await readState(page);
      assert.equal(reentered.scene, before.scene);
      assert.ok(reentered.elapsed >= narrow.elapsed);
      await resizeTo(page, 1200);
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout), 'wide');
    });
  });

  test('a_long_unbroken_legend_name_wraps_inside_the_narrow_chart', async () => {
    const long = 'x'.repeat(60);
    const source = CHARTS.bar.replace('series a "읽기"', `series a "${long}"`);
    for (const width of PHONES) {
      const read = await measure(source, width);
      assert.ok(read.panels[0].over <= 1, `${width}: ${read.panels[0].over}px 밀린다`);
    }
  });
});
