// 재생기 시험이 같이 쓰는 도구: 실제 Chrome 열기, 시계를 멈춘 채 문서 열기, 재생기 안쪽 상태 읽기. 컴파일러(src/build.js)에 기대지 않는다.
// Chrome이 없으면 시험을 건너뛰지 않고 실패한다(경로는 CHROME_PATH로 바꾼다).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 재생기 객체를 window.probe로 꺼내 안쪽 상태를 읽는다.
export const CAPTURE = 'const makePlayer = createPlayer; createPlayer = (...args) => (window.probe = makePlayer(...args));\n';
// 가짜 시계를 문서를 열기 전에 멈춰 두는 시각. 이 뒤로는 runFor로만 흐른다.
const FROZEN_AT_MS = 60_000;
// 가짜 시계의 한 프레임(ms). 시계가 프레임 시각에 맞춰지므로 시각 오차는 한 프레임을 넘지 않는다.
export const FRAME_MS = 1000 / 60;

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/** 실제 Chrome을 연다. 실행 파일이 없으면 시험이 실패한다. */
export function launchChrome() {
  assert.ok(existsSync(CHROME), `Chrome이 없다: ${CHROME}`);
  return chromium.launch({ executablePath: CHROME });
}

// cost: time O(s), heap O(s), stack O(1), io 1
// vars: s = SVG 원소 수
// basis: estimate
/** 재생기 안쪽 상태와 눈에 보이는 상태 한 장. */
export function readState(page) {
  return page.evaluate(() => {
    const { clock, scene, frame, stage } = window.probe;
    const { elapsed, isPlaying, wantsPlay, ended } = clock;
    return {
      elapsed,
      isPlaying,
      wantsPlay,
      ended,
      scene,
      phase: frame?.phase,
      seg: frame?.seg,
      d: frame?.d,
      segElapsed: frame?.elapsed,
      pulses: frame?.pulses,
      values: [...stage.view.querySelectorAll('[data-v][opacity="1"]')].map((el) => el.textContent),
      packets: stage.packetLayers.flatMap((layer) => [...layer.children]).filter((el) => el.style.opacity !== '0').length,
      overlays: stage.overlays.map((list) => (list?.length ? Number(list[0].getAttribute('opacity')) : 0)),
      selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      tabsHidden: document.querySelector('.fl-foot').hidden,
      full: document.querySelector('.fl-figure').classList.contains('full'),
    };
  });
}

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
/**
 * 가짜 시계를 건 새 페이지에 html을 열어 body(page)를 돌린다. 쪽 오류가 있으면 실패한다.
 * 가짜 시계는 설치만 하면 실제 시간으로 흘러 문서가 열리는 동안 재생기가 몇 프레임 먼저 돈다. 그래서 문서를 열기 전에 멈춰 두고 runFor로만 흘린다.
 */
export async function withPage(browser, html, options, body) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, ...options });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(FROZEN_AT_MS);
  await page.setContent(html);
  await body(page);
  assert.deepEqual(errors, []);
  await page.close();
}

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
/** withPage와 같되 쪽 오류를 실패로 보지 않고 모아 돌려준다. 잘못된 데이터가 오류로 끝나는지 잴 때 쓴다. */
export async function openWithErrors(browser, html) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(FROZEN_AT_MS);
  await page.setContent(html);
  await page.close();
  return errors;
}
