// 표의 제약 줄·외래 키 연결과 이동 글상자를 모바일에서 함께 검사한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { tightView } from '../src/canvas.js';
import { buildFigure, reflowFigure } from '../src/build.js';
import { chipStateAt } from '../src/chip-motion.js';
import { sizeChip } from '../src/chip.js';
import { flattenRoute } from '../src/route.js';
import { figureViewBounds } from '../src/html/view-bounds.js';
import { toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';
import { openPaused } from './mobile-chart.js';

// 제약 줄(NOT NULL, ON DELETE CASCADE)을 가진 외래 키 표와, 긴 이동 글이 표 칸 사이를 오가는 장면
const SOURCE = `daphnis 2
title "주문과 항목의 제약"
table orders "주문" {
  id bigint pk
  customer_id bigint required
}
table items "주문 항목" {
  id bigint pk
  order_id bigint fk=orders.id required ondelete=cascade
  note text nullable
}
orders.customer_id -> items.note
scene "항목 삽입" mode=once
  items.order_id -> orders.id "주문이 있는지 확인하고 항목을 저장한다" time=2s
  orders.customer_id -> items.note "고객 메모를 항목에 복사한다" time=2s
`;
const FLOW_FIXTURES = ['tracks.dap', 'lost-status-legs.dap'];
const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];

// cost: time O(h·f·p), heap O(p), stack O(1)
// vars: h = 이동 수, f = 프레임 수, p = 경로 지점 수
// basis: estimate
test('mobile_bounds_keep_every_planned_chip_frame_inside_the_view', async () => {
  const original = await buildFigure(SOURCE);
  const narrow = await reflowFigure(original, { layoutWidth: 320 });
  const bounds = figureViewBounds(narrow);
  const old = tightView(narrow.scene.width, narrow.scene.height);
  assert.ok(bounds.x + bounds.w > old.x + old.w, '기존 고정 잘라내기 영역보다 이동 글상자가 더 나간다');
  assertPlannedBounds(narrow, bounds);
  for (const file of FLOW_FIXTURES) {
    const result = await buildFigure(readFileSync(new URL(`fixtures/flow/${file}`, import.meta.url), 'utf8'));
    assertPlannedBounds(result, figureViewBounds(result));
  }
});

// cost: time O(h·f·p), heap O(p), stack O(1)
// vars: h = 이동 수, f = 프레임 수, p = 경로 지점 수
// basis: estimate
function assertPlannedBounds(narrow, bounds) {
  for (const seg of narrow.timeline.segs) for (const hop of seg.hops) {
    if (!hop.data) continue;
    const route = hop.track === undefined ? flattenRoute(narrow.scene.edges[hop.edge].points) : narrow.timeline.tracks[hop.track].route;
    for (let t = 0; t <= hop.ms; t += 10) {
      const { box } = chipStateAt({ route, hop, chip: sizeChip(hop.data) }, hop.chipPath, t);
      assert.ok(box.x >= bounds.x && box.y >= bounds.y && box.x + box.w <= bounds.x + bounds.w + 0.001 && box.y + box.h <= bounds.y + bounds.h + 0.001);
    }
  }
}

// cost: time O(r + p), heap O(r + p), stack O(1), io 1
// vars: r = 표 글자 수, p = 이동 글상자 수
// basis: estimate
// 표 칸 글자가 칸 안에 있고, 보이는 이동 글상자가 그림 안에 있으며, 페이지와 판이 옆으로 넘치지 않는지(판이 스스로 미는 것은 정상이라 판 안쪽 폭은 보지 않는다) 잰다.
async function assertTableFrame(page) {
  const result = await page.evaluate(() => {
    const svg = document.querySelector('.dp-panel svg');
    const bounds = svg.getBoundingClientRect();
    const inside = (b, outer) => b.left >= outer.left - 0.5 && b.right <= outer.right + 0.5 && b.top >= outer.top - 0.5 && b.bottom <= outer.bottom + 0.5;
    const rows = [...svg.querySelectorAll('.fl-part')];
    const contained = rows.every((row) => [...row.querySelectorAll('text')].every((text) => inside(text.getBoundingClientRect(), row.querySelector('rect').getBoundingClientRect())));
    const chips = [...svg.querySelectorAll('.fl-packet')].filter((packet) => Number(getComputedStyle(packet).opacity) > 0);
    return { contained, chips: chips.length, chipInside: chips.every((packet) => inside(packet.getBoundingClientRect(), bounds)), outer: document.documentElement.scrollWidth - innerWidth, rules: [...svg.querySelectorAll('.cell.rule')].map((el) => el.textContent) };
  });
  assert.ok(result.contained && result.chipInside && result.outer <= 0, JSON.stringify(result));
  assert.ok(result.rules.includes('NOT NULL') && result.rules.includes('ON DELETE CASCADE'));
  return result.chips;
}

for (const [name, launch] of ENGINES) {
  // cost: time O(v·f·page), heap O(page), stack O(1), io v·f
  // vars: v = 화면 조건 수, f = 검사 프레임 수, page = 브라우저 비용
  // basis: estimate
  test(`${name}_table_rules_and_moving_labels_fit_on_mobile`, async () => {
    const html = await toHtml(await buildFigure(SOURCE), '제약 표');
    const browser = await launch();
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430]) {
        const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme });
        let seen = await assertTableFrame(page);
        for (let i = 0; i < 30; i++) {
          await page.clock.runFor(100);
          seen += await assertTableFrame(page);
        }
        assert.ok(seen > 0, '이동 글상자가 한 프레임도 보이지 않으면 이 시험은 아무것도 재지 않는다');
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
}
