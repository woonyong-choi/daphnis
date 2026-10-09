// 근거: 제어 구획의 선택·반복·병렬 시간표가 실제 브라우저의 현재 선과 일치해야 한다(docs/design/playback.md, docs/design/figure-kinds.md 구획).
// 원본은 이 파일 안에 둔다(예제 파일에 기대지 않는다). 재생기에는 재생 단추와 배속 메뉴가 없어 가짜 시계만 흘리고, Chrome이나 WebKit이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { launchChrome, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';

const HEAD = 'daphnis 2\nbox a "클라이언트"\nbox b "서버"\nbox c "저장소"\na -> b\na -> c\nb -> c\nview g graph {\n  a b c\n}\nview s sequence {\n  a b c\n}\nscene "실행" mode=once\n';
const SOURCES = {
  alternative: HEAD + 'fragment alt "재고" choose="있음" {\nbranch "있음" {\na -> b "주문" time=400ms\nb -> a "확인" time=400ms\n}\nbranch "없음" {\na -> c "대기" time=400ms\n}\n}\n',
  retry: HEAD + 'fragment loop "재시도" times=3 {\na -> b "요청" time=400ms\nb -> a "응답" time=500ms\n}\n',
  parallel: HEAD + 'fragment par "동시 요청" {\nbranch "빠른 요청" {\na -> b "빠름" time=400ms\nb -> a "완료" time=400ms\n}\nbranch "느린 요청" {\na -> c "느림" time=2s\nc -> a "완료" time=400ms\n}\n}\na -> b "합류 뒤" time=400ms\n',
  optional: HEAD + 'fragment opt "추가 인증" run=on {\na -> b "인증" time=400ms\nb -> a "결과" time=500ms\n}\nfragment opt "감사 기록" run=off {\nb -> c "기록" time=300ms\n}\na -> c "계속" time=300ms\n',
};
// 사람이 읽을 수 있는 가장 작은 글자 크기(px). 공통 글자 역할 11px 이상이다.
const MIN_TEXT_PX = 10.99;
// 시간표 길이 뒤에 재생기가 마지막 모습을 보이고 끝나기까지 기다리는 넉넉한 시간(ms)
const END_TAIL_MS = 5000;

// cost: time O(h²), heap O(h), stack O(1), io h
// vars: h = 펼친 이동 수
// basis: estimate
// 이동마다 가운데 시각에서 가짜 시계를 멈추고 지금 이동 중인 선(`is-current`)이 시간표가 정한 선과 같은지 본다. 끝까지 흘리면 한 번 재생하는 장면이 끝난다.
async function checkMoves(page, timeline) {
  const moves = timeline.segs.flatMap((seg) => seg.hops.map((hop) => ({ edge: hop.edge, start: seg.t0 + (hop.at ?? 0), end: seg.t0 + (hop.at ?? 0) + hop.ms })));
  const samples = [...new Set(moves.map((move) => (move.start + move.end) / 2))].sort((a, b) => a - b);
  let elapsed = 0;
  for (const time of samples) {
    await page.clock.runFor(time - elapsed);
    elapsed = time;
    const expected = [...new Set(moves.filter((move) => time >= move.start && time < move.end).map((move) => move.edge))].sort((a, b) => a - b);
    const actual = await page.locator('g.fl-edge.is-current').evaluateAll((els) => els.filter((el) => el.id.startsWith('e-')).map((el) => Number(el.id.slice(2))).sort((a, b) => a - b));
    assert.deepEqual(actual, expected, `at ${time}ms`);
  }
  // 재생기의 장면은 시간표 길이 뒤 마지막 모습까지 이어진 다음 끝난다. 넉넉히 흘리고 끝난 장면 시각이 시간표 길이 이상인지 본다.
  await page.clock.runFor(timeline.total - elapsed + END_TAIL_MS);
  const state = await readState(page);
  assert.equal(state.ended, true, '한 번 재생하는 장면이 끝난다');
  assert.ok(state.d >= timeline.total, `끝난 장면 시각 ${state.d}ms가 시간표 길이 ${timeline.total}ms 이상이다`);
}

test('sequence_controls_play_only_the_selected_repeated_or_concurrent_edges', async () => {
  const browser = await launchChrome();
  try {
    for (const name of ['alternative', 'retry', 'parallel']) {
      const { html, result } = await playerHtml(SOURCES[name], { baseDir: 'test' });
      await withPage(browser, html, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, (page) => checkMoves(page, result.timeline));
    }
  } finally {
    await browser.close();
  }
});

for (const [name, launch] of [['chrome', launchChrome], ['webkit', () => webkit.launch()]]) {
  test(`${name}_optional_sequence_shows_the_choice_and_never_plays_skipped_messages`, async () => {
    const { html, result } = await playerHtml(SOURCES.optional, { baseDir: 'test' });
    const browser = await launch();
    try {
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
        await withPage(browser, html, { viewport: { width, height: 900 }, colorScheme }, async (page) => {
          await page.evaluate(() => document.fonts.ready);
          const fit = await page.evaluate(() => {
            // 판마다 SVG가 하나라서 구획이 든 순서 보기 판을 문서 전체에서 찾는다
            const svgs = [...document.querySelectorAll('svg.fl')];
            const frames = svgs.flatMap((svg) => [...svg.querySelectorAll('.fl-fragment')]);
            const inside = frames.every((frame) => {
              const box = frame.querySelector('rect').getBBox();
              return [...frame.querySelectorAll('text')].every((text) => {
                const t = text.getBBox();
                return t.x >= box.x && t.y >= box.y && t.x + t.width <= box.x + box.width && t.y + t.height <= box.y + box.height;
              });
            });
            return { inside, labels: frames.map((frame) => frame.getAttribute('aria-label')), overflow: document.documentElement.scrollWidth > innerWidth, minText: Math.min(...svgs.flatMap((svg) => [...svg.querySelectorAll('text')]).map((text) => parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a)) };
          });
          assert.equal(fit.inside, true, `${colorScheme} ${width}`);
          assert.equal(fit.overflow, false, `${colorScheme} ${width}`);
          assert.ok(fit.minText >= MIN_TEXT_PX, `${colorScheme} ${width}: ${fit.minText}`);
          assert.match(fit.labels[0], /재생/);
          assert.match(fit.labels[1], /생략/);
          await checkMoves(page, result.timeline);
        });
      }
      const skipped = await playerHtml(`${HEAD}fragment opt "조건" run=off {\na -> b "미실행"\n}\n`, { baseDir: 'test' });
      assert.equal(skipped.result.timeline.segs.flatMap((seg) => seg.hops).length, 0);
      await withPage(browser, skipped.html, { viewport: { width: 320, height: 900 } }, async (page) => {
        assert.match(await page.locator('.fl-fragment').first().getAttribute('aria-label'), /생략/);
        assert.equal(await page.locator('g.fl-edge.is-current').count(), 0, '생략한 메시지는 재생하지 않는다');
      });
    } finally {
      await browser.close();
    }
  });
}
