// 차트 입력표의 의미, 안전한 텍스트, 모바일·키보드 접근(docs/design/charts.md 입력 데이터 표).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';
import { chartSource, withFolder } from './helpers.js';

const SERIES = ['series a "A"', 'series b "B"'];
// 종류, 블록 안 입력 줄, 표 머리글, 첫 행의 칸
const CASES = [
  ['waterfall', ['row "A" value=3', 'total "합계"'], ['항목', '종류', '입력 증감', '누계(계산)'], ['A', '증감', '3', '3']],
  ['histogram', ['bins 0 2 2', 'sample 1'], ['관측 순서', 'x(ms)'], ['1', '1']],
  ['bar', [...SERIES, 'missing "미측정"', 'row "r" a=1 a.low=0 a.high=2 b=- rule=3'], ['항목', 'A', 'A 하한', 'A 상한', 'B', '행 기준'], ['r', '1', '0', '2', '미측정', '3']],
  ['stacked', [...SERIES, 'row "r" a=3 b=4'], ['항목', 'A', 'B'], ['r', '3', '4']],
  ['dumbbell', [...SERIES, 'row "r" a=3 b=4'], ['항목', 'A', 'B'], ['r', '3', '4']],
  ['difference', ['series a "A"', 'row "r" a=-2 a.low=-3 a.high=-1'], ['항목', 'A', 'A 하한', 'A 상한'], ['r', '-2', '-3', '-1']],
  ['box', ['row "r" min=1 q1=2 median=3 q3=4 max=5'], ['항목', '최솟값', '제1사분위', '중앙값', '제3사분위', '최댓값'], ['r', '1', '2', '3', '4', '5']],
  ['line', ['series a "A"', 'point x=1 a=2'], ['x(ms)', 'A'], ['1', '2']],
  ['area', ['series a "A"', 'point x=1 a=2', 'point x=2 a=3'], ['x(ms)', 'A'], ['1', '2']],
  ['scatter', ['series a "A"', 'point "r" x=1 y=2 series=a'], ['항목', 'x(ms)', 'y(ms)', '계열'], ['r', '1', '2', 'A']],
  ['heatmap', ['cell "r" "c" 1'], ['행', '열', '값'], ['r', 'c', '1']],
];

describe('chart data', () => {
  let browser;
  before(async () => { browser = await launchChrome(); });
  after(async () => { await browser.close(); });

  // 근거: charts.md 입력 데이터 표. 모든 차트의 값 의미와 15px 이상 글자, 모바일 바깥 넘침 없음, Enter 조작.
  test('toHtml_all_chart_tables_preserve_values_and_open_with_keyboard_at_mobile_and_desktop_widths', async () => {
    await withFolder(async (folder) => {
      for (const [kind, lines, headers, row] of CASES) {
        const result = await buildFigure(`daphnis 2\n${chartSource(kind, ['x "x(ms)"', 'y "y(ms)"', ...lines])}`);
        writeFileSync(join(folder, 'page.html'), await toHtml(result, kind));
        for (const colorScheme of ['light', 'dark']) for (const width of [390, 768, 1280]) {
          const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme });
          await page.goto(`file://${join(folder, 'page.html')}`);
          await page.locator('.fl-data summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('.fl-data').getAttribute('open'), '');
          assert.deepEqual(await page.locator('.fl-data table').first().locator('thead th').allTextContents(), headers, kind);
          assert.deepEqual(await page.locator('.fl-data tbody tr').first().locator('th,td').allTextContents(), row, kind);
          const measured = await page.locator('.fl-data').evaluate((el) => ({ font: parseFloat(getComputedStyle(el.querySelector('td')).fontSize), overflow: document.documentElement.scrollWidth - innerWidth }));
          assert.ok(measured.font >= 15, `${kind}: ${measured.font}px`);
          assert.ok(measured.overflow <= 0, `${kind}: page overflow ${measured.overflow}`);
          for (const region of await page.locator('.fl-data-scroll').all()) {
            await page.keyboard.press('Tab');
            assert.equal(await region.evaluate((el) => document.activeElement === el), true);
            const scrollable = await region.evaluate((el) => el.scrollWidth - el.clientWidth > 1);
            if (scrollable) {
              await page.keyboard.press('ArrowRight');
              await page.waitForFunction(() => document.activeElement.scrollLeft > 0, null, { timeout: 1500 });
              assert.ok(await region.evaluate((el) => el.scrollLeft > 0), `${kind} ${colorScheme}: keyboard scroll`);
            }
          }
          await page.locator('.fl-data summary').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('.fl-data').getAttribute('open'), null);
          await page.close();
        }
      }
    });
  });

  // 근거: charts.md 입력 데이터 표. 문자열은 마크업으로 실행하지 않고 결측과 없는 구간을 구분한다.
  test('toHtml_table_escapes_labels_and_distinguishes_absent_interval_from_missing_value', async () => {
    const source = `daphnis 2\n${chartSource('bar', ['x "값(ms)"', 'series a "<img>"', 'row "A&B" a=2 a.low=1 a.high=3', 'row "없음" a=-'])}`;
    const html = await toHtml(await buildFigure(source), 'table');
    assert.match(html, /<th scope="col">&lt;img&gt;<\/th>/);
    assert.match(html, /<th scope="row">A&amp;B<\/th>/);
    assert.match(html, /<th scope="row">없음<\/th><td>값 없음<\/td><td>해당 없음<\/td><td>해당 없음<\/td>/);
    const flow = await toHtml(await buildFigure('daphnis 2\nbox a "A"\n'), 'flow');
    assert.ok(!flow.includes('<details class="fl-data">'));
  });
});
