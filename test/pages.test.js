// 페이지: 목록 쪽(gallery)과 문서 미리보기가 브라우저에서 보이는 모양(docs/design/playback.md 문서 미리보기, layout.md 카드 머리).
// Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { toDocument, toGallery } from '../src/html.js';
import { values } from '../src/tokens.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const SKIP = CHROME ? false : 'Chrome이 없다';
const FIGURES = [{ name: 'call-registers', title: '호출 중 레지스터 값의 변화', kind: 'flow', isChart: false, href: 'call-registers' }];
const WIDTH = 1400;
const GAP_TOLERANCE = 0.5;

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// HTML을 연 페이지로 body(page)를 돌린다. 끝나면 임시 폴더를 지운다.
function withPage(browser, html, body) {
  return withFolder(async (folder) => {
    writeFileSync(join(folder, 'page.html'), html);
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, colorScheme: 'dark' });
    await page.goto(`file://${join(folder, 'page.html')}`);
    await body(page);
    await page.close();
  });
}

describe('pages', { skip: SKIP }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 버그 #18 "카드 머리의 제목과 파일 이름이 붙어 나옴": 제목, 파일 이름, 꼬리표 사이는 space.3이고 한 줄에 놓인다
  test('cardHead_title_name_and_kind_are_apart_by_the_token_gap_on_one_line', async () => {
    for (const html of [toGallery(FIGURES, '예제'), toDocument(FIGURES, '예제')]) {
      await withPage(browser, html, async (page) => {
        const [title, name, kind] = await Promise.all(['h2 .title', 'h2 .name', 'h2 .kind'].map((selector) => page.locator(selector).first().boundingBox()));

        assert.ok(name.x - (title.x + title.width) >= values.space['3'] - GAP_TOLERANCE, `제목과 파일 이름 사이 ${name.x - (title.x + title.width)}`);
        assert.ok(kind.x - (name.x + name.width) >= values.space['3'] - GAP_TOLERANCE, `파일 이름과 꼬리표 사이 ${kind.x - (name.x + name.width)}`);
        for (const box of [name, kind]) assert.ok(Math.abs(box.y + box.height / 2 - (title.y + title.height / 2)) < title.height, '한 줄에 놓인다');
      });
    }
  });

  // 근거: 설계 playback.md 요구사항 "목록 쪽 테마 단추가 목록과 iframe 그림을 함께 바꾼다"(루트 color-scheme과 고른 값 저장)
  test('gallery_theme_buttons_set_the_root_color_scheme_and_remember_the_choice', async () => {
    await withPage(browser, toGallery(FIGURES, '예제'), async (page) => {
      const labels = await page.locator('.theme button').allTextContents();
      await page.click('.theme button[data-mode="light"]');

      assert.deepEqual(labels, ['시스템', '라이트', '다크']);
      assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('mutoscope-theme')), 'light');
    });
  });
});
