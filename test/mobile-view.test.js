// 근거: 모바일 전체 화면은 조작부를 뺀 실제 공간에 그림 전체를 맞추고, 방향 전환 뒤에도 끝이 잘리지 않는다(docs/design/playback.md 화면).
// 재생기에는 재생 단추, 설명 글, 배속 메뉴가 없다. 도구 막대는 내려받기와 전체 화면(그리고 전체 화면의 확대 단추)이고 아래 장면 탭이 단계를 고른다. Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toDocument, toGallery, toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { launchChrome } from './chrome.js';
import { withFolder } from './helpers.js';

// 값이 바뀌는 카드와 선이 있는 그림. 장면이 둘이라 탭이 나온다.
const SOURCE = [
  'daphnis 2',
  'title "카드와 값"',
  'box web "웹"',
  'box api "API"',
  'store db "DB"',
  'value stock "재고" on=db from=9',
  'on db stock-1',
  'web -> api',
  'api -> db',
  'scene "주문" mode=loop',
  '  web -> api "주문" time=600ms',
  '  api -> db "저장" time=600ms',
  'scene "끝" mode=static',
  '  show db "저장 끝"',
  '',
].join('\n');
// 사람이 읽을 수 있는 가장 작은 글자 크기(px). 공통 글자 역할 11px 이상이다.
const MIN_TEXT_PX = 10.99;
// 눌러 쓰는 영역의 가장 작은 높이(px)
const MIN_TARGET_PX = 44;

// cost: time O(v·page), heap O(page), stack O(1), io v
// vars: v = 화면 방향 수, page = 브라우저 페이지 비용
// basis: estimate
test('mobile_fullscreen_fits_the_whole_figure_between_controls_after_rotation', async () => {
  const result = await buildFigure(SOURCE);
  const browser = await launchChrome();
  try {
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'page.html'), await toHtml(result, 'mobile'));
      const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
      await page.goto(`file://${join(folder, 'page.html')}`);
      await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
      await page.locator('.fl-full').click();
      for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const bounds = await page.evaluate(() => {
          const canvas = document.querySelector('.fl-canvas');
          const box = canvas.getBoundingClientRect();
          const svg = canvas.querySelector('svg.fl').getBoundingClientRect();
          return { canvasTop: box.top, canvasBottom: box.bottom, svgTop: svg.top, svgBottom: svg.bottom, extraX: canvas.scrollWidth - canvas.clientWidth, extraY: canvas.scrollHeight - canvas.clientHeight };
        });
        assert.ok(bounds.svgTop >= bounds.canvasTop && bounds.svgBottom <= bounds.canvasBottom + 1, JSON.stringify(bounds));
        assert.ok(bounds.extraX <= 1 && bounds.extraY <= 1, JSON.stringify(bounds));
      }
      await page.locator('.fl-full').click();
      assert.equal(await page.locator('.fl-figure').evaluate((el) => el.classList.contains('full')), false);
      await page.close();
    });
  } finally {
    await browser.close();
  }
});

// cost: time O(page), heap O(page), stack O(1), io 1
// vars: page = 브라우저 페이지 비용
// basis: estimate
test('mobile_gallery_fullscreen_without_browser_api_covers_the_viewport_and_returns_to_the_card', async () => {
  const result = await buildFigure(SOURCE);
  const browser = await launchChrome();
  try {
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'page.html'), await toHtml(result, 'mobile'));
      writeFileSync(join(folder, 'index.html'), toGallery([{ name: 'mobile', href: 'page', title: '카드' }], '모바일 검수'));
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.goto(`file://${join(folder, 'index.html')}`);
      const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
      await frame.waitForSelector('.fl-full');
      await frame.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
      await frame.locator('.fl-full').click();
      await page.waitForFunction(() => document.querySelector('iframe.full'));
      const full = await page.locator('iframe').boundingBox();
      assert.deepEqual(full, { x: 0, y: 0, width: 390, height: 844 });
      await frame.locator('.fl-full').click();
      await page.waitForFunction(() => !document.querySelector('iframe.full'));
      assert.ok((await page.locator('iframe').boundingBox()).width < 390);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'visible');
      await page.close();
    });
  } finally {
    await browser.close();
  }
});

// 근거: docs-integration.md. 축소 SVG 미리보기에서 모바일 읽기 화면으로 이동할 수 있어야 한다.
// cost: time O(page), heap O(page), stack O(1), io 1
// vars: page = 브라우저 페이지 비용
// basis: estimate
test('mobile_document_preview_opens_a_readable_player_from_the_image_or_link', async () => {
  const result = await buildFigure(SOURCE);
  const browser = await launchChrome();
  try {
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'page.html'), await toHtml(result, 'mobile'));
      writeFileSync(join(folder, 'page.svg'), await toSvg(result));
      writeFileSync(join(folder, 'document.html'), toDocument([{ name: 'mobile', href: 'page', title: '모바일 문서 미리보기' }], '모바일 검수'));
      const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
      await page.goto(`file://${join(folder, 'document.html')}`);
      const link = page.getByRole('link', { name: '글자를 크게 보고 재생하기' });
      assert.ok((await link.boundingBox()).height >= MIN_TARGET_PX);
      assert.equal(await page.locator('.figure a').getAttribute('href'), await link.getAttribute('href'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('.figure a').click();
      await page.waitForSelector('svg.fl');
      const minimum = await page.locator('svg.fl text').evaluateAll((texts) => Math.min(...texts.map((text) => parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a)));
      assert.ok(minimum >= MIN_TEXT_PX, `mobile text ${minimum}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.close();
    });
  } finally {
    await browser.close();
  }
});

// 근거: 긴 장면 이름도 페이지 넘침 없이 장면 탭 안에서 줄바꿈되어야 한다. 설명 글과 재생 단추가 없어져 탭과 도구 막대만 본다.
// cost: time O(v·page), heap O(page), stack O(1), io v
// vars: v = 화면 폭과 삽입 여부 조합 수, page = 브라우저 페이지 비용
// basis: estimate
test('mobile_long_scene_names_do_not_clip_the_tabs_or_the_tool_bar', async () => {
  const source = 'daphnis 2\nbox a "API"\nscene "request_transaction_confirmation_callback_https://example.com/api/transactions/confirmation/callback/1234567890" mode=once\n  show a "확인"\nscene "두 번째 장면도 길게 쓴다 https://example.com/api/transactions" mode=once\n  show a "다시"\n';
  const result = await buildFigure(source);
  const browser = await launchChrome();
  try {
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'page.html'), await toHtml(result, 'mobile'));
      writeFileSync(join(folder, 'index.html'), toGallery([{ name: 'mobile', href: 'page' }], '모바일'));
      for (const width of [320, 390]) for (const embedded of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 568 }, isMobile: true, hasTouch: true });
        await page.goto(`file://${join(folder, embedded ? 'index.html' : 'page.html')}`);
        const frame = embedded ? await (await page.locator('iframe').elementHandle()).contentFrame() : page;
        await frame.getByRole('tab').first().waitFor();
        await frame.evaluate(() => document.fonts.ready);
        const clipped = await frame.evaluate(() => [...document.querySelectorAll('.fl-foot, .fl-tabs, .fl-tabs [role="tab"], .fl-view-tools')].filter((el) => {
          const box = el.getBoundingClientRect();
          return el.scrollWidth > el.clientWidth + 1 || box.left < 0 || box.right > innerWidth;
        }).map((el) => el.className));
        assert.deepEqual(clipped, [], JSON.stringify({ width, embedded, clipped }));
        await frame.getByRole('tab').nth(1).click();
        assert.equal(await frame.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true');
        await page.close();
      }
    });
  } finally {
    await browser.close();
  }
});
