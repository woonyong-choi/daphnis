// 좁은 화면 차트 시험이 같이 쓰는 도구: 차트 판 하나의 화면 상태 읽기와 폭 바꾸기. 재생기 객체(window.probe)를 쓰지 않고 눈에 보이는 DOM만 읽는다.
import { readState } from './chrome.js';

// 글자가 읽히는 가장 작은 화면 크기(px). 차트 글자 역할 중 가장 작은 메타 글자(11)다. 좁은 화면은 글자를 줄이지 않고 이름과 값을 줄 바꿔 좁은 배치로 다시 놓으며, 좁히지 못하는 입력만 판 안에서 옆으로 민다.
export const READABLE_PX = 11;
const SIZE_TOLERANCE = 0.05;

// cost: time O(t²), heap O(t), stack O(1), io page
// vars: t = 판 안 글자 수
// basis: estimate
/**
 * 차트 판(.dp-panel) 하나의 지금 화면 상태. 글자마다 화면 크기(글자 크기 × SVG 배율)와 상자를 재고, 서로 겹친 글자 쌍과 값 글자를 모은다.
 * 좁히지 못해 판 안에서 옆으로 밀리는 경우는 정상이므로 판 밖으로 나간 글자는 오류가 아니고, 페이지가 넘치지 않는지(pageOverflow)와 판이 스스로 미는지(panelScrolls)를 따로 잰다.
 */
export function readChartPanel(page, selector = '.dp-panel') {
  return page.evaluate((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    const svg = panel.querySelector('svg');
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const shown = [...svg.querySelectorAll('text')].filter((el) => getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().width > 0);
    const texts = shown.map((el) => ({ text: el.textContent, size: parseFloat(getComputedStyle(el).fontSize) * scale, box: el.getBoundingClientRect(), classes: el.getAttribute('class') ?? '' }));
    const overlaps = texts.flatMap((a, i) => texts.slice(i + 1).filter((b) => Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1).map((b) => [a.text, b.text]));
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      panelScrolls: panel.scrollWidth - panel.clientWidth > 1,
      panelIsReachable: panel.getAttribute('tabindex') === '0' && panel.getAttribute('role') === 'region',
      minSize: Math.min(...texts.map((t) => t.size)),
      overlaps,
      values: texts.filter((t) => /\bchart-value\b/.test(t.classes)).map((t) => t.text),
      ticks: texts.filter((t) => /\bchart-tick\b/.test(t.classes)).map((t) => t.text),
      rules: svg.querySelectorAll('.chart-rule').length,
      // 기준선 조각마다 화면 왼쪽 끝(px, 0.5 단위). 좁은 배치가 기준선을 행마다 끊어 그려도 모두 같은 자리면 모든 행을 지나는 공통 기준선 하나다.
      ruleLefts: [...new Set([...svg.querySelectorAll('.chart-rule')].map((el) => Math.round(el.getBoundingClientRect().left * 2) / 2))],
    };
  }, selector);
}

const FROZEN_AT_MS = 60_000;

// cost: time O(page), heap O(page), stack O(1), io 1
// vars: page = 브라우저 페이지 비용
// basis: estimate
/** 가짜 시계를 문서를 열기 전에 멈춰 두고 html을 연 { page, errors }. 시계는 page.clock.runFor로만 흐르고, 쪽 오류는 errors에 모인다. */
export async function openPaused(browser, html, options) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(FROZEN_AT_MS);
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

/** 화면 폭을 바꾸고 브라우저가 resize 알림을 내 재생기가 배치를 고를 때까지 기다린다. 폭이 이미 같으면 기다리지 않는다. */
export async function resizeTo(page, width, height = 900) {
  const resized = page.evaluate((wanted) => (innerWidth === wanted ? undefined : new Promise((resolve) => addEventListener('resize', resolve, { once: true }))), width);
  await page.setViewportSize({ width, height });
  await resized;
}

/** 장면 번호와 읽을 수 있는 크기(11px) 하한을 함께 확인할 때 쓰는 화면 상태 한 장. */
export const stateOf = async (page, selector) => ({ ...(await readChartPanel(page, selector)), scene: (await readState(page)).scene });

export const isReadable = (size) => size >= READABLE_PX - SIZE_TOLERANCE;
