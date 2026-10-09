// 시각 수정: 목록에서 고른 테마가 목록 밖에서 따로 열린 재생 화면에도 이어진다. 목록이 기억한 선택(localStorage)을 같은 키로 읽고, 그림마다 테마 단추를 두지 않는다. 내려받은 정본은 그대로 바이트가 같다.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toGallery, toHtml } from '../src/html.js';
import { launchChrome } from './chrome.js';

const SOURCE = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "s" mode=static\n  a -> b time=300ms\n';

describe('gallery theme bridge', () => {
  let browser;
  let server;
  let origin;
  let html;
  before(async () => {
    browser = await launchChrome();
    const figure = await buildFigure(SOURCE);
    html = await toHtml(figure, 'api');
    const files = { '/index.html': toGallery([{ name: 'api', href: 'api', kind: 'flow', title: 'API' }], '예제'), '/api.html': html };
    server = createServer((request, response) => {
      const file = files[request.url.split('?')[0]];
      response.writeHead(file ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(file ?? '');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await browser.close();
    server.close();
  });

  const pageBackground = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = (page) => page.evaluate(() => [document.documentElement.getAttribute('data-theme'), document.documentElement.style.colorScheme]);

  async function pick(page, mode) {
    await page.goto(`${origin}/index.html`);
    await page.click(`.theme button[data-mode="${mode}"]`);
    await page.waitForFunction((value) => localStorage.getItem('daphnis-theme') === value, mode);
  }

  // 근거: 목록에서 라이트를 고르고 `열기`로 연 재생 화면이 시스템 다크를 따르지 않고 라이트다
  test('a light choice in the gallery opens the standalone viewer light even when the system is dark', async () => {
    const page = await browser.newPage({ colorScheme: 'dark' });
    await pick(page, 'light');
    await page.goto(`${origin}/api.html`);
    assert.deepEqual(await theme(page), ['light', 'light']);
    const light = await pageBackground(page);
    const dark = await browser.newPage({ colorScheme: 'dark' });
    await dark.goto(`${origin}/api.html`);
    assert.notEqual(light, await pageBackground(dark), '아무것도 고르지 않은 시스템 다크와 배경이 다르다');
    assert.deepEqual(await theme(dark), [null, '']);
    await dark.close();
    await page.close();
  });

  // 근거: 다크를 고르면 시스템이 라이트여도 다크이고, 시스템을 고르면 시스템 설정을 따른다
  test('a dark choice follows into the viewer and the system choice follows the system', async () => {
    const page = await browser.newPage({ colorScheme: 'light' });
    await pick(page, 'dark');
    await page.goto(`${origin}/api.html`);
    assert.deepEqual(await theme(page), ['dark', 'dark']);
    await pick(page, 'system');
    await page.goto(`${origin}/api.html`);
    assert.deepEqual(await theme(page), [null, '']);
    await page.close();
  });

  // 근거: 목록 안 iframe은 기존처럼 목록이 보내는 메시지를 따른다
  test('the embedded viewer still follows the gallery message', async () => {
    const page = await browser.newPage({ colorScheme: 'dark' });
    await pick(page, 'light');
    await page.waitForFunction(() => document.querySelector('iframe').style.height !== '');
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
    await page.click('.theme button[data-mode="dark"]');
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    await page.close();
  });

  // 근거: 그림 도구 막대에 테마 단추가 없다. 내려받기와 전체 화면(그리고 전체 화면의 확대 단추)뿐이다
  test('the figure toolbar has no theme buttons', async () => {
    const page = await browser.newPage();
    await page.goto(`${origin}/api.html`);
    const labels = await page.locator('.fl-view-tools button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    assert.deepEqual(labels.filter((label) => /테마|라이트|다크/.test(label ?? '')), []);
    assert.equal(await page.locator('.theme').count(), 0);
    await page.close();
  });

  // 근거: 테마 읽기는 정본 템플릿의 고정 글이고 저장된 값에 기대지 않는다. 같은 그림은 늘 같은 바이트다
  test('the document bytes do not depend on any saved theme', async () => {
    const again = await toHtml(await buildFigure(SOURCE), 'api');
    assert.equal(again, html);
    assert.match(html, /localStorage\.getItem\('daphnis-theme'\)/);
    assert.doesNotMatch(html, /data-theme="(?:light|dark)"/, '문서에 저장된 선택이 박혀 있지 않다');
  });
});
