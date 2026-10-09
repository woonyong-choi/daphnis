// 병합 필드의 논리 비율을 보존하면서 보이지 않는 단위 칸의 빈 폭을 줄인다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { toHtml } from '../src/html.js';
import { buildFigure, reflowFigure } from '../src/build.js';
import { values } from '../src/tokens.js';
import { launchChrome } from './chrome.js';
import { openPaused } from './mobile-chart.js';

const SOURCE = `daphnis 2
title "가상 주소를 VPN과 오프셋으로 나눈다"

grid va "가상 주소 (16비트)" cols=16 {
  item vpn "VPN (10비트)" col=0 cols=10
  item offset "오프셋 (6비트)" col=10 cols=6
}
grid pa "물리 주소 (16비트)" cols=16 {
  item pfn "PFN (10비트)" col=0 cols=10
  item offset "오프셋 (6비트)" col=10 cols=6
}
va -> pa "페이지 표 조회"
view main graph down

scene "나누기" mode=once
  light va.vpn
  light va.offset
scene "바꾸기" mode=once
  va -> pa "VPN을 PFN으로"
  light pa.pfn
  light pa.offset
`;
const PTE = `daphnis 2
title "페이지 표 항목의 필드"

box mmu "MMU" "주소 변환"
grid pte "페이지 표 항목 (PTE)" rows=4 cols=6 {
  item frame "프레임 번호" row=0 col=0 rows=2 cols=3
  item valid "V" row=0 col=3
  item dirty "D" row=0 col=4
  item ref "R" row=0 col=5
  item prot "권한 (읽기, 쓰기, 실행)" row=1 col=3 cols=3
  item note "참조 비트는 CPU가 접근할 때 켜고, 운영체제가 주기적으로 지워 최근에 쓰지 않은 페이지를 교체 후보로 고른다" row=2 col=0 rows=2 cols=5
}
mmu -> pte "조회"

scene "주소" mode=once
  light pte.frame
scene "상태" mode=once
  light pte.valid pte.dirty pte.ref
  light pte.note
`;
const sourceOf = (cols, body) => `daphnis 2\ngrid g "필드" cols=${cols} {\n${body}\n}\n`;

test('merged_address_fields_fit_without_changing_bit_ratios_labels_or_step_targets', async () => {
  const result = await buildFigure(SOURCE, { strict: true });
  const narrow = await reflowFigure(result, { layoutWidth: 320, strict: true });
  assert.ok(narrow.scene.width <= 320);
  for (const grid of result.scene.items) {
    const [page, offset] = grid.cells;
    assert.equal(page.w / offset.w, 10 / 6);
    assert.equal(page.cols, 10);
    assert.equal(offset.col, 10);
    assert.equal(offset.cols, 6);
    assert.equal(offset.lines.join(' '), '오프셋 (6비트)');
    assert.ok(offset.w >= values.size.grid.cell);
    assert.ok(offset.lines.length > 1);
  }
  assert.deepEqual(narrow.figure, result.figure);
  assert.deepEqual(narrow.timeline.segs.map((seg) => seg.partsOn), result.timeline.segs.map((seg) => seg.partsOn));
});

test('logical_field_width_can_grow_without_allocating_each_hidden_bit', async () => {
  const widths = [];
  for (const cols of [16, 1024, 1000000]) {
    const result = await buildFigure(sourceOf(cols, ` item a "상위" cols=${cols / 2}\n item b "하위" col=${cols / 2} cols=${cols / 2}`));
    const grid = result.scene.items[0];
    widths.push(grid.w);
    assert.equal(grid.cells[0].w, grid.cells[1].w);
    assert.equal(grid.cells[1].col, cols / 2);
  }
  assert.ok(Math.max(...widths) - Math.min(...widths) < 0.001);
});

test('unmerged_cells_and_empty_slots_keep_their_original_minimum_width', async () => {
  for (const body of [' item a "A" cols=3\n item b "B" col=3', ' item a "A" cols=2']) {
    const { scene } = await buildFigure(sourceOf(4, body));
    assert.ok(scene.items[0].unit.w >= values.size.grid.cell);
  }
});

test('buildFigure_mixed_grid_wraps_long_notes_without_widening_all_columns', async () => {
  const result = await buildFigure(PTE, { strict: true });
  const narrow = await reflowFigure(result, { layoutWidth: 320, strict: true });
  const grid = narrow.scene.items.find((item) => item.id === 'pte');
  assert.ok(narrow.scene.width <= 320);
  assert.ok(grid.unit.w >= values.size.grid.cell);
  for (const cell of grid.cells) {
    assert.equal(cell.w, cell.cols * grid.unit.w);
    assert.equal(cell.h, cell.rows * grid.unit.h);
    const source = result.figure.nodes.find((node) => node.id === 'pte').cells.find((item) => item.id === cell.id);
    assert.equal(cell.lines.join('').replace(/\s/g, ''), source.label.replace(/\s/g, ''));
  }
  assert.equal(grid.empties.reduce((sum, cell) => sum + cell.w * cell.h, 0), 2 * grid.unit.w * grid.unit.h);
  assert.deepEqual(narrow.figure, result.figure);
});

// cost: time O(c + t), heap O(c + t), stack O(1), io 1
// vars: c = 칸 수, t = 글자 요소 수
// basis: estimate
// 필드 칸 폭과 칸 안 글자 포함, 제목 위치, 가장 작은 글자 크기, 페이지가 넘치는지를 잰다. 칸 판이 스스로 옆으로 미는 것은 정상이라 판 안쪽 폭은 보지 않는다.
async function inspectFields(page) {
  return page.evaluate(() => {
    const svgs = [...document.querySelectorAll('.dp-panel svg')];
    const svg = svgs[0];
    const boxes = [...document.querySelectorAll('.dp-panel svg .fl-part')].map((part) => {
      const bounds = part.querySelector('.grid-cell').getBoundingClientRect();
      return { width: bounds.width, contained: [...part.querySelectorAll('text')].every((text) => { const box = text.getBoundingClientRect(); return box.left >= bounds.left - 0.1 && box.right <= bounds.right + 0.1 && box.top >= bounds.top - 0.1 && box.bottom <= bounds.bottom + 0.1; }) };
    });
    const base = svg.getBoundingClientRect();
    const titles = [...svg.querySelectorAll('.label')].map((text) => text.getBoundingClientRect().y - base.y);
    const minText = Math.min(...[...svg.querySelectorAll('text')].map((text) => parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a));
    return { boxes, titles, minText, height: base.height, outer: document.documentElement.scrollWidth - innerWidth };
  });
}

const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
for (const [name, launch] of ENGINES) for (const [kind, source, cols] of [['bits', SOURCE, [10, 6, 10, 6]], ['mixed', PTE, [3, 1, 1, 1, 3, 5]]]) {
  // cost: time O(v·page), heap O(page), stack O(1), io v
  // vars: v = 화면 조건 수, page = 브라우저 비용
  // basis: estimate
  test(`${name}_${kind}_fields_keep_their_ratio_and_titles_still_during_playback`, async () => {
    const html = await toHtml(await buildFigure(source), '필드');
    const browser = await launch();
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
        const { page, errors } = await openPaused(browser, html, { viewport: { width, height: 900 }, colorScheme });
        const before = await inspectFields(page);
        assertFieldFrame(before, cols);
        await page.getByRole('tab').nth(1).click();
        await page.clock.runFor(700);
        const playing = await inspectFields(page);
        assertFieldFrame(playing, cols);
        assert.deepEqual(playing.titles, before.titles);
        assert.equal(playing.height, before.height);
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 칸 수
// basis: estimate
function assertFieldFrame(frame, cols) {
  assert.ok(frame.outer <= 0 && frame.minText >= 10.99, JSON.stringify(frame));
  assert.ok(frame.boxes.every((box) => box.contained));
  // SVG 폭의 0.1px 반올림 오차를 기준 칸의 비율 환산에도 반영한다. 모형의 비율은 위에서 정확히 비교한다.
  assert.equal(frame.boxes.length, cols.length);
  for (let i = 0; i < frame.boxes.length; i++) {
    const expected = frame.boxes[0].width * cols[i] / cols[0];
    assert.ok(Math.abs(frame.boxes[i].width - expected) <= 0.1 * (1 + cols[i] / cols[0]));
  }
}
