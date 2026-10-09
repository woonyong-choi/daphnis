// 값 재생기 시험이 같이 쓰는 도구: 재생기 화면의 값 글자와 펄스 읽기, 가짜 시계로 프레임 모으기, 값 상태 묶기, 장면 탭 고르기.
// 재생기는 가짜 시계로만 흐르고(chrome.js withPage) 재생 단추가 없어 장면 탭이 단계를 고른다.
import { readState } from './chrome.js';

// SMIL을 풀고 재생기를 재는 간격(ms)
export const PROBE_MS = 25;

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/** 지금 재생기 화면의 값 줄마다 보이는 글자(data-t)와 펄스 세기(밝힘 면의 불투명도). 보이는 줄만 [값 줄 번호, 글, 세기]로 담는다. */
export const valuesNow = (page) =>
  page.evaluate(() => {
    const rows = [...new Set([...document.querySelectorAll('[data-v]')].map((el) => el.dataset.v))];
    return rows.flatMap((vi) => {
      const text = [...document.querySelectorAll(`[data-v="${vi}"]`)].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.t);
      const flash = Math.max(0, ...[...document.querySelectorAll(`[data-vf="${vi}"]`)].map((el) => Number(el.getAttribute('opacity'))));
      return text.length || flash > 0 ? [[Number(vi), [...new Set(text)].join('|'), flash]] : [];
    });
  });

// cost: time O(F), heap O(F), stack O(1), io F
// vars: F = 프레임 수
// basis: estimate
/** 가짜 시계를 stepMs씩 흘리며 { d(장면 안 표시 시각), scene, values } 목록을 모은다. until(frames)가 true가 되거나 limitMs가 다하면 멈춘다. */
export async function runFrames(page, { limitMs, stepMs = PROBE_MS, until = () => false }) {
  const frames = [];
  for (let t = stepMs; t <= limitMs && !until(frames); t += stepMs) {
    await page.clock.runFor(stepMs);
    const state = await readState(page);
    frames.push({ d: state.d ?? state.elapsed, scene: state.scene, values: await valuesNow(page) });
  }
  return frames;
}

// cost: time O(F), heap O(F), stack O(1)
// vars: F = 프레임 수
// basis: estimate
/**
 * 같은 상태가 이어지는 프레임을 하나로 묶은 값 상태 목록. 펄스 세기가 오르내리는 동안의 프레임 수는 배속에 따라 달라서 세지 않고 펄스가 켜졌는지만 본다.
 * 펄스는 표시 시간(80/80/240ms)이라 배속이 빠르면 이웃한 값 변화의 펄스가 겹쳐 합쳐지므로, 배속을 견줄 때는 글자만 본다(withFlash false).
 */
export const statesOf = (frames, withFlash = true) =>
  frames.reduce((states, { values }) => {
    const state = JSON.stringify(values.map(([vi, text, flash]) => (withFlash ? [vi, text, flash > 0] : [vi, text])));
    return states.length && states.at(-1) === state ? states : [...states, state];
  }, []);

/** 장면 탭을 눌러 si번 장면에 들어선다. 장면이 하나뿐이면 탭 줄이 숨어 있고 처음 열 때 첫 장면에 들어서 있으므로 아무것도 하지 않는다. */
export async function tab(page, si) {
  const tabs = page.getByRole('tab');
  if ((await tabs.count()) === 0) {
    if (si !== 0) throw new Error(`장면 탭이 없는데 ${si}번 장면을 골랐다`);
    return;
  }
  await tabs.nth(si).click();
}

/** 장면 si의 값 줄 [행, 문서 전체 번호] 목록. */
export const sceneRows = (timeline, si) => timeline.values.map((row, vi) => [row, vi]).filter(([row]) => row.si === si);

/** 문서를 가리거나(true) 다시 보이게(false) 한다. 가려지면 재생기 시계가 얼고, 다시 보이면 튀지 않고 이어진다. */
export const setHidden = (page, isHidden) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, isHidden);
