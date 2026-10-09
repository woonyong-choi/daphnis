// 재생기 시작 위치: 화면이 캔버스보다 좁을 때 처음 화면과 양끝 탐색(docs/design/playback.md 재생기).
// 실제 Chrome에서 재고, Chrome이 없으면 시험이 실패한다. 원본은 이 파일 안에 둔다(예제 파일에 기대지 않는다).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';
import { withFolder } from './helpers.js';

const SETTLE_MS = 300;
// 그림보다 좁은 화면, 그림보다 넓지만 캔버스보다 좁은 화면
const NARROW = 600;
const MIDDLE = 1200;
const EDGE_TOLERANCE = 1;
// 가로로 긴 흐름. `aspect 8`로 가로 비율을 허용하면 도형 여덟이 NARROW보다 넓고 MIDDLE보다 좁게(약 788px) 놓인다.
const NAMES = ['주문 접수', '결제 확인', '재고 예약', '배송 준비', '출고 처리', '운송 중', '배송 완료', '정산 마감'];
const WIDE_FLOW = ['daphnis 2', 'title "긴 이벤트 흐름"', 'aspect 8', ...NAMES.map((name, i) => `box n${i} "${name}"`), ...NAMES.slice(1).map((_, i) => `n${i} -> n${i + 1}`), 'scene "흐름" mode=once', '  n0 -> n1', ''].join('\n');

// 그림 안 도형 상자가 화면 안에서 차지하는 가로 범위
const shapeSpan = (page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll('svg.fl .fl-node')].map((n) => n.getBoundingClientRect());
    return { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)), width: document.documentElement.clientWidth };
  });

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// 원본의 HTML 재생기를 width 화면에서 열어 body(page, result)를 돌린다.
function withPlayer(browser, source, width, body) {
  return withFolder(async (folder) => {
    const result = await buildFigure(source);
    writeFileSync(join(folder, 'page.html'), await toHtml(result, 'wide'));
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${join(folder, 'page.html')}`);
    await page.waitForTimeout(SETTLE_MS);
    await body(page, result);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

describe('player start position', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 이슈 #63 "넓은 캔버스 재생기 시작 위치". 그림보다 좁은 화면에서 첫 화면은 그림의 왼쪽 끝부터 보이고, 양끝으로 끝까지 간다
  test('player_wide_canvas_narrow_screen_starts_at_the_left_edge_and_reaches_both_ends', async () => {
    await withPlayer(browser, WIDE_FLOW, NARROW, async (page, result) => {
      assert.ok(result.scene.width > NARROW, `그림 폭 ${result.scene.width}이 시험 화면(${NARROW})보다 넓어야 한다`);
      const first = await shapeSpan(page);
      assert.ok(first.left >= -EDGE_TOLERANCE, `첫 화면에서 그림 왼쪽이 ${first.left}px 잘린다`);

      await page.evaluate(() => document.querySelector('.fl-canvas').scrollTo(0, 0));
      const start = await shapeSpan(page);
      await page.evaluate(() => document.querySelector('.fl-canvas').scrollTo(1e6, 0));
      const end = await shapeSpan(page);

      assert.ok(start.left >= -EDGE_TOLERANCE, '왼쪽 끝까지 가도 도형이 잘린다');
      assert.ok(end.right <= end.width + EDGE_TOLERANCE, `오른쪽 끝까지 가도 도형이 ${end.right - end.width}px 잘린다`);
    });
  });

  // 근거: 이슈 #63. 그림이 화면에 다 들어오면(캔버스보다 좁은 화면) 가운데 정렬을 그대로 둔다
  test('player_screen_wider_than_the_figure_keeps_the_figure_centered', async () => {
    await withPlayer(browser, WIDE_FLOW, MIDDLE, async (page, result) => {
      assert.ok(result.scene.width < MIDDLE, `그림 폭 ${result.scene.width}이 시험 화면(${MIDDLE})보다 좁아야 한다`);
      const { left, right, width } = await shapeSpan(page);

      assert.ok(left >= -EDGE_TOLERANCE && right <= width + EDGE_TOLERANCE, `그림이 ${left}~${right}px로 화면(${width})을 벗어난다`);
      assert.ok(Math.abs(left - (width - right)) <= 40, `좌우 여백이 ${left}, ${width - right}로 다르다`);
    });
  });
});
