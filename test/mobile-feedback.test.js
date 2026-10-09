// 사용자 모바일 검수: 고정된 행 이름, 선명한 값, 번호 대비, 종료 표식, 트래픽 회복.
// 원본은 이 파일 안에 둔다(예제 파일에 기대지 않는다). 재생기에는 재생 단추가 없어 가짜 시계만 흘리고, Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast } from '../src/contrast.js';
import { toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';
import { themeColor, withFolder } from './helpers.js';

// 글자 대비 기준(docs/design/docs-integration.md 대비 기준 표)
const TEXT_CONTRAST = 4.5;

// `#rrggbb`를 브라우저가 계산해 주는 `rgb(r, g, b)` 글로
const rgbOf = (hex) => `rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

// 트래픽이 몰려 대기열이 쌓였다가 줄어드는 그림. 큐 pending이 같은 이름의 값을 스스로 가진다.
// 선이 의미 라벨과 번호를 고정으로 갖고, 빠른 박자 이동은 글 없는 점이다(짧은 이동 글의 경고는 test/traffic-label-final.test.js가 따로 지킨다).
const TRAFFIC_SURGE = [
  'daphnis 2',
  'title "트래픽 급증과 회복"',
  'box client "클라이언트"',
  'queue pending "대기열" slots=12',
  'box worker1 "작업자 1"',
  'box worker2 "작업자 2"',
  'value received "받은 요청" on=client',
  'value done1 "처리 1" on=worker1',
  'value done2 "처리 2" on=worker2',
  'client -> pending "요청" no=1',
  'pending -> worker1 "처리" no=2',
  'pending -> worker2 "처리" no=3',
  'scene "평상시" mode=once',
  '  client -> pending time=300ms set="received+1, pending+1"',
  '  pending -> worker1 time=300ms set="pending-1, done1+1"',
  'scene "급증" mode=once keep="pending, received, done1, done2"',
  ...Array.from({ length: 5 }, () => '  client -> pending time=200ms set="received+1, pending+1"'),
  'scene "정체" mode=once keep="pending, received, done1, done2"',
  '  wait 1s',
  'scene "회복" mode=once keep="pending, received, done1, done2"',
  ...Array.from({ length: 5 }, () => '  pending -> worker2 time=200ms set="pending-1, done2+1"'),
  '',
].join('\n');

// 시도 횟수는 장면을 건너 이어지고 저장은 한 번만 일어난다(값 유지 keep).
const DYNAMIC_CARDS = [
  'daphnis 2',
  'box web "웹"',
  'box api "API"',
  'store db "DB"',
  'value attempts "시도" on=api',
  'value rows "주문 행" on=db',
  'web -> api',
  'api -> db',
  'scene "첫 시도" mode=once',
  '  web -> api "주문" time=300ms set="attempts+1"',
  'scene "다시 시도" mode=once keep="attempts"',
  '  web -> api "주문" time=300ms set="attempts+1"',
  'scene "저장" mode=once keep="attempts"',
  '  api -> db "저장" time=300ms set="rows+1"',
  'scene "끝" mode=once keep="attempts, rows"',
  '  show db "저장됨"',
  '',
].join('\n');

const BAR = [
  'daphnis 2',
  'title "배포 전후 API 오류율"',
  'chart errors "엔드포인트별 5xx 오류율" bar {',
  '  x "5xx 오류율(%)"',
  '  decimals 2',
  '  series before "배포 전" role=compare',
  '  series after "배포 후" role=main',
  '  row "GET /products" before=0.42 after=0',
  '  row "GET /orders" before=1.38 after=0.71',
  '  row "POST /orders" before=2.24 after=1.12',
  '}',
  'view main plot {',
  '  errors',
  '}',
  'scene "배포 전에서 후로" mode=once',
  '  reveal errors.before',
  '  wait 1s',
  '  reveal errors.after',
  '',
].join('\n');

const BOX = [
  'daphnis 2',
  'title "엔드포인트별 응답 시간 분포"',
  'chart spread "응답 시간 분포" box {',
  '  x "응답 시간(ms)"',
  '  row "GET /products" min=8 q1=14 median=22 q3=27 max=64',
  '  row "GET /orders" min=22 q1=41 median=230 q3=283 max=640',
  '  row "POST /payments" min=180 q1=260 median=610 q3=820 max=1900',
  '}',
  'view main plot {',
  '  spread',
  '}',
  'scene "전체 분포" mode=static',
  '  wait 1s',
  '',
].join('\n');

// 순서 보기의 생성과 소멸. 소멸 표식은 마지막 메시지 화살촉에서 떨어져 있다.
const LIFECYCLE = [
  'daphnis 2',
  'box client "Client"',
  'box worker "Worker"',
  'client -> worker',
  'view g graph {',
  '  client worker',
  '}',
  'view s sequence {',
  '  client worker',
  '}',
  'scene "생명주기" mode=once',
  '  client -> worker "create" create',
  '  activate worker',
  '  worker -> client "done" dashed',
  '  deactivate worker',
  '  client -> worker "destroy" destroy',
  '',
].join('\n');

// 근거: 이슈 #118 완료 조건 "값은 음수가 되지 않고 상한을 넘지 않으며 요청은 잃지 않는다". 값 시간표가 장면마다 마지막으로 가진 값
// cost: time O(v), heap O(1), stack O(1)
// vars: v = 값 시간표 줄 수
// basis: estimate
const finalValue = (timeline, id, si) => {
  const row = timeline.values.find((value) => value.id === id && value.si === si);
  return Number(row.changes.at(-1)?.[1] ?? row.initial);
};

test('traffic_surge_builds_a_backlog_then_drains_it_without_losing_requests', async () => {
  const { timeline, warnings } = await buildFigure(TRAFFIC_SURGE);
  assert.deepEqual(warnings, []);
  assert.equal(finalValue(timeline, 'pending', 0), 0);
  assert.ok(finalValue(timeline, 'pending', 1) > 0);
  assert.equal(finalValue(timeline, 'pending', 2), finalValue(timeline, 'pending', 1));
  assert.equal(finalValue(timeline, 'pending', 3), 0);
  assert.ok(finalValue(timeline, 'done2', 3) > 0);
  assert.equal(finalValue(timeline, 'received', 3), finalValue(timeline, 'done1', 3) + finalValue(timeline, 'done2', 3));
  assert.ok(timeline.values.filter((row) => row.id === 'pending').every((row) => row.changes.every(([, value]) => Number(value) >= 0 && Number(value) <= 12)));
});

test('dynamic_cards_keep_attempts_and_finish_with_one_saved_order', async () => {
  const { timeline, warnings } = await buildFigure(DYNAMIC_CARDS);
  assert.deepEqual(warnings, []);
  assert.equal(finalValue(timeline, 'attempts', 3), 2);
  assert.equal(finalValue(timeline, 'rows', 3), 1);
});

describe('mobile visual feedback in Chrome', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser?.close();
  });

  // cost: time O(page), heap O(page), stack O(1), io page
  // vars: page = 페이지 생성과 브라우저 실행 비용
  // basis: estimate
  async function visit(source, body, { colorScheme = 'light', width = 390 } = {}) {
    const built = await buildFigure(source);
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'page.html'), await toHtml(built, 'mobile'));
      const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme });
      try {
        await page.clock.install({ time: 0 });
        await page.goto(`file://${join(folder, 'page.html')}`);
        await page.evaluate(() => document.fonts.ready);
        await page.clock.runFor(400);
        await body(page, built);
      } finally {
        await page.close();
      }
    });
  }

  test('chart_titles_and_row_labels_stay_still_while_bars_reveal', async () => {
    await visit(BAR, async (page) => {
      const positions = () => page.locator('.chart-title, .chart-label').evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility === 'visible').map((el) => ({ text: el.textContent, y: el.getBoundingClientRect().y - el.ownerSVGElement.getBoundingClientRect().y })));
      const initial = await positions();
      assert.ok(initial.length > 0, '제목과 행 이름이 보인다');
      for (let frame = 0; frame < 30; frame += 1) {
        await page.clock.runFor(200);
        assert.deepEqual(await positions(), initial);
      }
      const mark = await page.locator('.cs-1 rect.grow:not([fill="none"])').first().evaluate((el) => ({ fill: getComputedStyle(el).fill, stroke: getComputedStyle(el).stroke }));
      // 둘째 범주 색은 노랑(비교 데이터 색 data.compare)이고 윤곽은 같은 계열의 다른 색이다
      assert.equal(mark.fill, rgbOf(themeColor('light', 'data.compare')));
      assert.notEqual(mark.stroke, mark.fill);
    });
  });

  test('numbers_keep_their_token_ink_and_contrast_on_the_badge_and_tall_cards_are_not_covered', async () => {
    for (const mode of ['light', 'dark']) await visit(TRAFFIC_SURGE, async (page) => {
      const styles = await page.locator('.number').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
      const [ink, fill] = [themeColor(mode, 'figure.number-ink'), themeColor(mode, 'figure.number-fill')];
      assert.ok(styles.length >= 3, `번호 ${styles.length}개`);
      assert.ok(styles.every((style) => style === rgbOf(ink)), `${mode}: ${JSON.stringify(styles)} / ${rgbOf(ink)}`);
      assert.equal(await page.locator('.number-pill').first().evaluate((el) => getComputedStyle(el).fill), rgbOf(fill));
      assert.ok(contrast(ink, fill) >= TEXT_CONTRAST, `${mode}: 번호와 알약 대비 ${contrast(ink, fill).toFixed(2)}`);
      const boxes = await page.evaluate(() => ({ canvas: document.querySelector('.fl-canvas').getBoundingClientRect().bottom, foot: document.querySelector('.fl-foot').getBoundingClientRect().top, overflow: document.documentElement.scrollWidth - innerWidth }));
      assert.ok(boxes.foot >= boxes.canvas);
      assert.equal(boxes.overflow, 0);
    }, { colorScheme: mode });
  });

  // 넓은 배치와 좁은 배치는 따로 만든 SVG 두 벌이고 화면 폭에 따라 하나만 문서에 있다(docs/design/charts.md 좁은 화면)
  test('box_values_use_backgrounds_without_strokes_over_the_glyphs', async () => {
    for (const width of [1280, 390]) await visit(BOX, async (page) => {
      const values = page.locator('.dp-panel svg .chart-value');
      assert.deepEqual(await values.allTextContents(), ['중앙값 22', '중앙값 230', '중앙값 610'], `${width}px`);
      assert.ok((await values.evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))).every((stroke) => stroke === 'none'), `${width}px`);
      assert.equal(await page.locator('.dp-panel svg .chart-text-bg').count(), 3, `${width}px`);
    }, { width });
  });

  test('destruction_mark_uses_the_line_style_and_clears_the_arrow_tip', async () => {
    await visit(LIFECYCLE, async (page, built) => {
      const sequence = (list) => list.filter((item) => item.panel === 1);
      const mark = sequence(built.scene.destructions)[0];
      const end = sequence(built.scene.edges).at(-1).points.at(-1);
      assert.ok(Math.abs(end.x - mark.x) >= 12);
      const styles = await page.locator('.fl-destruction').evaluate((el) => ({ stroke: getComputedStyle(el).stroke, width: getComputedStyle(el).strokeWidth, cap: getComputedStyle(el).strokeLinecap }));
      const line = await page.locator('.lifeline').first().evaluate((el) => getComputedStyle(el).stroke);
      assert.equal(styles.stroke, line);
      assert.equal(styles.cap, 'round');
      assert.equal(styles.width, '1.75px');
    });
  });
});
