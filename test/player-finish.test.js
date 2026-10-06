// 재생 끝에서는 결과를 유지하고 명시한 반복만 처음으로 돌아간다(#162).
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const FLOW = 'flow right\nbox a "A"\nbox b "B"\nvalue n "Count" on=b\non b n+1\na -> b\nstep "First"\n  a -> b time=300ms\nstep "Last"\n  a -> b time=300ms\n';
const BAR = 'chart bar\nspeed 1s\nseries a "A"\nrow "R" a=3\n';

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
async function withPlayer(browser, source, body) {
  const result = await buildFigure(source);
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'page.html'), await toHtml(result, 'finish'));
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: 0 });
    await page.goto(`file://${join(folder, 'page.html')}`);
    await body(page, result.timeline);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

describe('player finish', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  before(async () => { browser = await chromium.launch({ executablePath: CHROME }); });
  after(async () => { await browser.close(); });

  // 근거: #162. 마지막 단계·값을 유지하고 다시 재생만 시간표 처음으로 이동한다.
  test('player_finishes_once_holds_values_and_replays_from_the_first_scene', async () => {
    await withPlayer(browser, FLOW, async (page, timeline) => {
      await page.getByRole('button', { name: '재생', exact: true }).click();
      await page.clock.runFor(timeline.total + 300);
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '다시 재생');
      assert.equal(await page.locator('.fl-position').textContent(), '2 / 2');
      const visible = () => page.locator('[data-v][opacity="1"]').allTextContents();
      const endValues = await visible();
      assert.ok(endValues.length > 0);
      await page.clock.runFor(timeline.total * 2);
      assert.deepEqual(await visible(), endValues);
      assert.equal(await page.locator('.fl-position').textContent(), '2 / 2');
      await page.getByRole('button', { name: '다시 재생', exact: true }).click();
      assert.equal(await page.locator('.fl-position').textContent(), '1 / 2');
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '일시정지');
    });
  });

  // 근거: #162. 반복은 기본 꺼짐이고, 켜면 끝에서 되돌며 끄면 그 회차 끝에 멈춘다.
  test('player_repeat_is_explicit_and_scene_selection_stays_paused', async () => {
    await withPlayer(browser, FLOW, async (page, timeline) => {
      const repeat = page.getByRole('button', { name: '반복', exact: true });
      assert.equal(await repeat.getAttribute('aria-pressed'), 'false');
      await repeat.click();
      await page.locator('.fl-pause').click();
      await page.clock.runFor(timeline.total + 300);
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '일시정지');
      await repeat.click();
      await page.clock.runFor(timeline.total + 300);
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '다시 재생');
      await page.getByRole('tab', { name: 'First' }).click();
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '재생');
      await page.clock.runFor(timeline.total);
      assert.equal(await page.locator('.fl-position').textContent(), '1 / 2');
    });
  });

  // 근거: #162. 단계 없는 차트도 유한하게 드러나고, 정지·배속·재개를 거쳐 결과를 유지한다.
  test('player_stepless_chart_holds_its_complete_shape_after_playback', async () => {
    await withPlayer(browser, BAR, async (page) => {
      await page.locator('.fl-pause').click();
      await page.clock.runFor(200);
      await page.locator('.fl-pause').click();
      await page.clock.runFor(2000);
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '재생');
      await page.locator('.fl-rate').click();
      await page.locator('.fl-pause').click();
      await page.clock.runFor(2000);
      assert.equal(await page.locator('.fl-pause').getAttribute('aria-label'), '다시 재생');
      const animations = await page.locator('svg.fl').evaluate((svg) => svg.getAnimations({ subtree: true }).filter((a) => a.animationName?.startsWith('chart-')).map((a) => ({ state: a.playState, iterations: a.effect.getTiming().iterations })));
      assert.ok(animations.length > 0);
      assert.ok(animations.every((a) => a.state === 'finished' && a.iterations === 1));
    });
  });
});
