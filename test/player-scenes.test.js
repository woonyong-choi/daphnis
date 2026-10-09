// 장면(단계) 재생 계약: 정지·한 번·반복, 같은 탭과 다시 들어가기, 보이지 않을 때와 움직임 줄이기, 전체 화면 보존, 후광과 알약, 여러 판에 그려진 같은 카드(docs/playback.md).
// 실제 Chrome에서 재생기 안쪽 시계와 눈에 보이는 그림을 함께 잰다. 문서는 손으로 적은 정본 시간표(test/player-fixture.js)이고 컴파일러를 거치지 않는다.
// 같은 계약을 컴파일러가 만든 문서로 재는 시험은 test/player-compiled.test.js다.
// 가짜 시계는 문서를 열기 전에 멈춰 두므로(chrome.js) 첫 상태는 늘 시간 0이다.
// 판 둘에 논리 도형 a와 c가 한 번씩 더 그려져 있어(도형 번호 0과 4, 2와 3) 값 글자 요소도 값마다 둘이다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { FRAME_MS, launchChrome, openWithErrors, readState, withPage } from './chrome.js';
import { YELLOW, fixtureHtml } from './player-fixture.js';

const ONCE = { mode: 'once' };
const LOOP = { mode: 'loop' };
const STATIC = { mode: 'static' };
// 첫 프레임이 시계의 기준이 되므로 흐른 시각은 가짜 시간보다 최대 한 프레임 모자라고, 프레임 사이에서 읽으면 한 프레임이 더 모자랄 수 있다.
const LAG_MS = 2 * FRAME_MS;
// 장면 0(One)의 표시 길이: 마지막 후광(도형 2, 논리 1100)이 400ms 더 보인 1500. 장면 1(Two)은 1100.
const ONE_MS = 1500;
const TWO_MS = 1100;
const RESCUE_MS = 5_000;
// 반복이 수십 번 도는 길이. 프레임마다 시각을 더하는 시계였다면 어긋남이 쌓였을 길이다.
const LONG_MS = 30_000;
// 가짜 시계 프레임 간격(ms). 프레임마다 읽는 시험이 이 간격으로 흘린다.
const STEP_MS = 16;

const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const setHidden = (page, hidden) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
// 시험이 따로 적은 후광 곡선(80ms 올라감, 80ms 유지, 240ms 내려옴). 재생기 코드를 부르지 않는다.
const envelope = (x) => (x < 0 ? 0 : x < 80 ? x / 80 : x < 160 ? 1 : x < 400 ? 1 - (x - 160) / 240 : 0);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`);
const within = (actual, from, to, message) => assert.ok(actual >= from && actual <= to, `${message ?? ''} ${actual} not in [${from}, ${to}]`);

describe('player scenes (hand-written canonical timeline)', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });
  const open = (scenes, options, body) => withPage(browser, fixtureHtml(scenes), options, body);

  // 근거: 장면 계약. 가짜 시계를 열기 전에 멈추면 첫 상태는 정확히 시간 0이다(시계가 열리는 동안 먼저 돌지 않는다)
  test('scene_initial_state_is_exactly_time_zero_when_the_clock_is_frozen_before_loading', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const first = await readState(page);
      assert.deepEqual([first.elapsed, first.isPlaying, first.wantsPlay, first.ended, first.phase, first.scene, first.seg, first.values], [0, true, true, false, 'play', 0, 0, ['0', '0']]);
      assert.equal(first.packets, 1, '시간 0에 첫 점이 출발점에 있다');
      assert.deepEqual(first.overlays.filter(Boolean), []);
    });
  });

  // 근거: 장면 계약. 정지(기본)는 처음부터 마지막 모습이고 시간이 흘러도 움직이지 않으며 점도 후광도 없다
  test('scene_static_shows_the_final_snapshot_without_packets_or_pulses_and_never_moves', async () => {
    await open([STATIC, STATIC], {}, async (page) => {
      const first = await readState(page);
      assert.deepEqual([first.isPlaying, first.wantsPlay, first.ended, first.phase, first.scene, first.seg, first.segElapsed, first.d, first.values], [false, false, true, 'final', 0, 1, 600, ONE_MS, ['1', '1']]);
      assert.deepEqual([first.packets, first.pulses, first.overlays.filter(Boolean)], [0, {}, []]);
      await page.clock.runFor(RESCUE_MS);
      assert.deepEqual(await readState(page), first);
      await tab(page, 'Two').click();
      const second = await readState(page);
      assert.deepEqual([second.scene, second.seg, second.ended, second.isPlaying, second.selected, second.values, second.packets], [1, 2, true, false, 'Two', ['2', '2'], 0]);
    });
  });

  // 근거: 정본 단계. 글 단계, 모르는 방식, 양수가 아닌 배율, 빠진 값은 기본값으로 받지 않고 오류다
  test('scene_invalid_steps_fail_loudly_instead_of_falling_back', async () => {
    const bad = [
      ['First', /steps\[0\].*객체/],
      [{ label: 'a', mode: 'bounce', speed: 1 }, /mode는 static, once, loop/],
      [{ label: 'a', mode: 'once', speed: 0 }, /speed는 양의 유한수/],
      [{ label: 'a', mode: 'once' }, /키는 정확히/],
    ];
    for (const [step, message] of bad) {
      const errors = await openWithErrors(browser, fixtureHtml(undefined, { steps: [step, { label: 'b', mode: 'once', speed: 1 }] }));
      assert.equal(errors.length, 1, JSON.stringify(step));
      assert.match(errors[0], message, JSON.stringify(step));
    }
  });

  // 근거: 장면 계약. 한 번은 들어가면 저절로 재생하고, 시각은 가짜 시간에 어긋나지 않으며, 끝나면 후광이 다 끝난 마지막 모습을 유지하고 다음 장면으로 넘어가지 않는다
  test('scene_once_autoplays_holds_the_final_after_the_effects_and_does_not_enter_the_next_scene', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await page.clock.runFor(300);
      const mid = await readState(page);
      within(mid.elapsed, 300 - LAG_MS, 300, '시계는 가짜 시간을 따른다');
      assert.deepEqual([mid.isPlaying, mid.ended, mid.packets, mid.seg], [true, false, 1, 0]);
      await page.clock.runFor(ONE_MS);
      const end = await readState(page);
      assert.deepEqual([end.scene, end.selected, end.ended, end.isPlaying, end.phase, end.packets, end.pulses, end.seg, end.values], [0, 'One', true, false, 'final', 0, {}, 1, ['1', '1']]);
      assert.deepEqual(end.overlays.filter(Boolean), []);
      await page.clock.runFor(RESCUE_MS);
      assert.deepEqual(await readState(page), end);
    });
  });

  // 근거: 장면 계약. 반복은 고른 장면 안에서만 돌고, 마지막 사건의 400ms 후광을 자르지 않으며, 시계는 어긋남 없이 절대 시각으로 흐른다
  test('scene_loop_keeps_the_pulse_tail_wraps_by_absolute_time_and_does_not_drift', async () => {
    await open([LOOP, ONCE], {}, async (page) => {
      await page.clock.runFor(ONE_MS - 100);
      const tail = await readState(page);
      within(tail.d, ONE_MS - 100 - LAG_MS, ONE_MS - 100);
      // 논리 도형 c의 후광은 논리 1100(표시 1100)에 시작해 아직 내려오는 중이다. 후광은 잘리지 않고, c가 그려진 두 곳(2번과 3번)의 겹침 선이 그 값을 그대로 쓴다.
      near(tail.pulses['node:c'], envelope(tail.d - 1100));
      assert.ok(tail.pulses['node:c'] > 0);
      near(tail.overlays[2], tail.pulses['node:c']);
      near(tail.overlays[3], tail.pulses['node:c']);
      assert.equal(tail.segElapsed, 600, '꼬리 동안 논리 시각은 끝에 머문다');
      await page.clock.runFor(300);
      const again = await readState(page);
      assert.deepEqual([again.scene, again.phase, again.isPlaying, again.pulses], [0, 'play', true, {}]);
      near(again.d, again.elapsed % ONE_MS);
      assert.ok(again.elapsed > ONE_MS, '시계는 반복마다 되돌리지 않는 절대 시각이다');
      assert.deepEqual(again.overlays.filter(Boolean), []);
      assert.equal(again.seg, 0);
      await page.clock.runFor(LONG_MS);
      const later = await readState(page);
      const total = ONE_MS - 100 + 300 + LONG_MS;
      within(later.elapsed, total - LAG_MS, total, '오래 돌아도 어긋남이 쌓이지 않는다');
      near(later.d, later.elapsed % ONE_MS);
      await tab(page, 'Two').click();
      await page.clock.runFor(TWO_MS + 3 * FRAME_MS);
      const once = await readState(page);
      assert.deepEqual([once.scene, once.ended, once.isPlaying], [1, true, false]);
      await tab(page, 'One').click();
      const back = await readState(page);
      assert.deepEqual([back.scene, back.elapsed, back.isPlaying, back.values, back.seg], [0, 0, true, ['0', '0'], 0]);
    });
  });

  // 근거: 장면 계약. 같은 활성 탭을 누르면 아무 일도 없고, 떠났다가 돌아오면 시간 0과 처음 값에서 다시 시작한다
  test('scene_same_tab_click_is_a_no_op_and_leaving_then_returning_resets', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await page.clock.runFor(900);
      const late = await readState(page);
      assert.equal(late.seg, 1);
      await tab(page, 'One').click();
      assert.deepEqual(await readState(page), late, '같은 탭이 상태를 바꿨다');
      await page.clock.runFor(ONE_MS);
      const finished = await readState(page);
      assert.equal(finished.ended, true);
      await tab(page, 'One').click();
      assert.deepEqual(await readState(page), finished);
      await tab(page, 'Two').click();
      const entered = await readState(page);
      assert.deepEqual([entered.scene, entered.seg, entered.elapsed, entered.values, entered.ended], [1, 2, 0, ['1', '1'], false]);
      await tab(page, 'One').click();
      const returned = await readState(page);
      assert.deepEqual([returned.scene, returned.seg, returned.elapsed, returned.ended, returned.values], [0, 0, 0, false, ['0', '0']]);
    });
  });

  // 근거: 장면 계약. speed는 이동 논리 시간만 바꾼다. 후광은 표시 시각으로 80ms 올라가고 장면 speed와 상관없다
  test('scene_speed_scales_travel_but_the_pulse_envelope_stays_in_display_time', async () => {
    await open([{ mode: 'once', speed: 2 }, ONCE], {}, async (page) => {
      await page.clock.runFor(400);
      const travel = await readState(page);
      // 표시 400 = 논리 800이라 둘째 박자(논리 600~1200) 안 200이다.
      assert.equal(travel.seg, 1);
      within(travel.segElapsed, 2 * (400 - LAG_MS) - 600, 2 * 400 - 600, '박자 안 논리 시각은 speed배');
    });
    await open([{ mode: 'once', speed: 2 }, ONCE], {}, async (page) => {
      // 도형 1의 후광은 논리 500이라 표시 250에 시작한다.
      await page.clock.runFor(250 + 60);
      const rise = await readState(page);
      const x = rise.d - 250;
      within(x, 0, 80 + FRAME_MS, '올라가는 구간 안');
      near(rise.overlays[1], envelope(x));
      assert.ok(rise.overlays[1] > 0 && rise.overlays[1] < 1 + 1e-9);
    });
  });

  // 근거: 장면 계약. 문서가 가려지면 시계를 얼리고, 다시 보이면 멈춘 자리에서 이어 간다
  test('scene_hidden_document_freezes_the_clock_and_resumes_without_a_jump', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await page.clock.runFor(700);
      const before = await readState(page);
      await setHidden(page, true);
      await page.clock.runFor(5000);
      const frozen = await readState(page);
      assert.deepEqual([frozen.elapsed, frozen.seg, frozen.isPlaying, frozen.wantsPlay], [before.elapsed, before.seg, false, true]);
      await setHidden(page, false);
      await page.clock.runFor(400);
      const resumed = await readState(page);
      within(resumed.elapsed - before.elapsed, 400 - LAG_MS, 400, '가려진 시간이 지나간 시각으로 더해졌다');
      assert.equal(resumed.isPlaying, true);
    });
  });

  // 근거: 장면 계약. 움직임 줄이기로 열면 방식과 상관없이 마지막 모습이고 움직이지 않는다
  test('scene_reduced_motion_opens_every_mode_at_the_final_state', async () => {
    await open([LOOP, ONCE], { reducedMotion: 'reduce' }, async (page) => {
      const first = await readState(page);
      assert.deepEqual([first.ended, first.isPlaying, first.wantsPlay, first.phase, first.packets, first.pulses, first.values], [true, false, false, 'final', 0, {}, ['1', '1']]);
      await page.clock.runFor(RESCUE_MS);
      assert.deepEqual(await readState(page), first);
      await tab(page, 'Two').click();
      const second = await readState(page);
      assert.deepEqual([second.ended, second.isPlaying, second.values, second.phase], [true, false, ['2', '2'], 'final']);
    });
  });

  // 근거: 장면 계약. 재생 중에 움직임 줄이기가 켜지면 바로 마지막 모습이 되고, 꺼도 다음 장면에 들어갈 때까지 다시 재생하지 않는다
  test('scene_reduced_motion_toggled_mid_play_settles_and_turning_it_off_does_not_replay', async () => {
    await open([LOOP, ONCE], {}, async (page) => {
      await page.clock.runFor(700);
      assert.equal((await readState(page)).isPlaying, true);
      // 미디어 쿼리 변화 알림은 브라우저가 프레임에서 전하므로 기다리는 동안 가짜 시계를 다시 흐르게 한다.
      await page.clock.resume();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => window.probe.clock.ended);
      const settled = await readState(page);
      assert.deepEqual([settled.isPlaying, settled.ended, settled.phase, settled.packets, settled.values, settled.pulses], [false, true, 'final', 0, ['1', '1'], {}], '반복 장면도 마지막 모습이다');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.clock.runFor(RESCUE_MS);
      await page.waitForTimeout(200);
      assert.deepEqual(await readState(page), settled);
      await tab(page, 'Two').click();
      const entered = await readState(page);
      assert.deepEqual([entered.scene, entered.isPlaying, entered.ended], [1, true, false]);
    });
  });

  // 근거: 장면 계약. 전체 화면(창을 덮는 대체 모양 포함)은 장면, 절대 시각, 값을 되돌리지 않고 Escape나 닫기는 재생에 영향이 없다
  test('scene_fullscreen_overlay_preserves_scene_time_and_state_and_escape_only_closes', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
      await tab(page, 'Two').click();
      await page.clock.runFor(400);
      const before = await readState(page);
      await page.getByRole('button', { name: '전체 화면', exact: true }).click();
      const full = await readState(page);
      assert.equal(full.full, true);
      assert.deepEqual([full.scene, full.seg, full.isPlaying, full.values, full.elapsed], [1, before.seg, true, before.values, before.elapsed], '열 때 시각이 되감기거나 건너뛰지 않았다');
      await page.clock.runFor(300);
      const moved = await readState(page);
      within(moved.elapsed - full.elapsed, 300 - LAG_MS, 300);
      await page.keyboard.press('Escape');
      const closed = await readState(page);
      assert.deepEqual([closed.full, closed.scene, closed.isPlaying, closed.ended], [false, 1, true, false]);
      assert.equal(closed.elapsed, moved.elapsed);
      await page.clock.runFor(TWO_MS);
      await page.getByRole('button', { name: '전체 화면', exact: true }).click();
      const held = await readState(page);
      assert.deepEqual([held.full, held.ended, held.values, held.pulses], [true, true, ['2', '2'], {}]);
      await page.getByRole('button', { name: '전체 화면 끝내기', exact: true }).click();
      const end = await readState(page);
      assert.deepEqual([end.full, end.values, end.elapsed], [false, ['2', '2'], held.elapsed]);
    });
  });

  // 근거: 사건 계약. 도착 후광은 도형의 기존 윤곽 위 겹침 선이다. 면이나 윤곽 굵기, 모양이 바뀌지 않는다
  test('event_arrival_pulse_is_an_overlay_on_the_existing_border_only', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const snapshot = () =>
        page.evaluate(() => {
          const node = document.querySelector('#n-1');
          const stroke = node.querySelector(':scope > .fl-stroke');
          const style = getComputedStyle(stroke);
          const box = node.getBBox();
          return { fill: style.fill, stroke: style.stroke, width: style.strokeWidth, box: [box.x, box.y, box.width, box.height], layers: node.children.length };
        });
      const before = await snapshot();
      // 도형 1의 후광은 표시 500에 시작하고 580부터 660까지 최대다. 프레임 오차를 두고 620 근처에서 잰다.
      await page.clock.runFor(500 + 120);
      const peak = await readState(page);
      assert.equal(peak.overlays[1], 1, `${peak.d}ms: ${peak.overlays[1]}`);
      const during = await snapshot();
      assert.deepEqual({ ...during, layers: 0 }, { ...before, layers: 0 }, '윤곽의 면, 색, 굵기, 상자가 그대로다');
      assert.equal(during.layers, before.layers + 1, '겹침 선 하나만 더해졌다');
      const same = await page.evaluate(() => {
        const node = document.querySelector('#n-1');
        const [stroke, overlay] = [node.querySelector(':scope > .fl-stroke'), node.querySelector(':scope > .fl-pulse')];
        const geometry = (el) => ['x', 'y', 'width', 'height', 'rx'].map((name) => el.getAttribute(name));
        return { geometry: [geometry(stroke), geometry(overlay)], width: [getComputedStyle(stroke).strokeWidth, getComputedStyle(overlay).strokeWidth], fill: getComputedStyle(overlay).fill, ids: node.querySelectorAll('[id]').length };
      });
      assert.deepEqual(same.geometry[0], same.geometry[1]);
      assert.equal(same.width[0], same.width[1]);
      assert.equal(same.fill, 'none');
      assert.equal(same.ids, 0);
    });
  });

  // 근거: 사건 계약. 값 배경 후광은 실제로 바뀐 값의 줄에만 켜지고, 바뀌지 않은 줄은 그대로다. 같은 카드가 두 판에 있으면 값 쓰기는 하나이고 두 그림이 같은 값으로 쓴다
  test('event_value_flash_is_local_to_the_changed_row_and_shared_by_every_instance', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      // 문서 순서: 판 0의 값 줄 0, 1, 판 1의 값 줄 0, 1
      const flashes = () => page.evaluate(() => [...document.querySelectorAll('[data-vf]')].map((el) => Number(el.getAttribute('opacity'))));
      await page.clock.runFor(1100 + 40);
      const state = await readState(page);
      const x = state.d - 1100;
      const [changed, other, copy, copyOther] = await flashes();
      near(changed, envelope(x));
      assert.ok(changed > 0);
      near(copy, changed, '다른 판에 그려진 같은 카드도 같은 세기다');
      assert.deepEqual([other, copyOther], [0, 0], '다른 장면의 값 줄은 켜지지 않는다');
      assert.deepEqual(state.values, ['1', '1']);
      await page.clock.runFor(ONE_MS);
      assert.deepEqual(await flashes(), [0, 0, 0, 0]);
    });
  });

  // 근거: 사건 계약. 차트 틀은 시각이 가리키는 틀로 바뀌고 달라진 표만 쓰이며 후광이 걸린다. 시간을 되돌리거나 건너뛰어도 같은 틀이다. 같은 차트가 두 판에 있으면 둘 다 같은 틀이다
  test('event_chart_frame_swap_touches_only_changed_marks_and_follows_the_time_in_both_directions', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await page.evaluate(() => {
        window.untouched = [];
        for (const el of document.querySelectorAll('[data-mark="b:0"]')) new MutationObserver((records) => window.untouched.push(...records.map((r) => r.attributeName))).observe(el, { attributes: true });
      });
      // 두 판의 차트 c1을 문서 순서로 읽는다(판 0, 판 1).
      const chart = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-chart="c1"]')].map((root) => {
            const [a, b, text] = [root.querySelector('[data-mark="a:0"]'), root.querySelector('[data-mark="b:0"]'), root.querySelector('[data-mark-text="a:0"]')];
            // 표식 a:0의 효과는 문서에 미리 들어 있는 겹침의 불투명도다(모양 겹침과 글 후광). 표식 b:0은 효과가 없고 겹침도 없다.
            const [shape, halo] = [root.querySelector('rect[data-pulse-of="a:0"]'), root.querySelector('text[data-pulse-of="a:0"]')];
            return { width: a.getAttribute('width'), cls: a.getAttribute('class'), extra: a.getAttribute('data-extra'), text: text.textContent, pulse: Number(shape.getAttribute('opacity')), halo: Number(halo.getAttribute('opacity')), overlayWidth: shape.getAttribute('width'), haloText: halo.textContent, other: b.dataset.pulseOf === undefined && !root.querySelector('[data-pulse-of="b:0"]') ? null : 1 };
          }),
        );
      const first = { width: '40', cls: 'bar', extra: null, text: '1', pulse: 0, halo: 0, overlayWidth: '40', haloText: '1', other: null };
      await page.clock.runFor(400);
      assert.deepEqual(await chart(), [first, first]);
      await page.clock.runFor(340);
      const swapped = await readState(page);
      const x = swapped.d - 700;
      assert.ok(x >= 0 && x < 80, `${swapped.d}`);
      const during = await chart();
      for (const instance of during) {
        assert.deepEqual([instance.width, instance.text, instance.extra, instance.other], ['80', '2', 'on', null]);
        assert.ok(Math.abs(instance.pulse - envelope(x)) < 1e-6, `${instance.pulse} / ${envelope(x)}`);
        assert.ok(Math.abs(instance.halo - envelope(x)) < 1e-6, '글 후광도 같은 세기다');
        assert.deepEqual([instance.overlayWidth, instance.haloText], ['80', '2'], '겹침은 표식의 지금 모양과 글을 따라간다');
      }
      assert.equal(during[0].cls, '', '틀에 없는 class는 이전 틀의 것이 남지 않는다');
      // 노랑 계열 표식: 효과 중에도 표식 자신의 노랑 칠과 노랑 계열 테두리는 그대로이고, 겹침은 노랑 계열 칠뿐이다(상태 파랑이 없다).
      const colors = await page.evaluate(() =>
        [...document.querySelectorAll('[data-chart="c1"]')].map((root) => ({
          base: [root.querySelector('rect[data-mark="a:0"]').getAttribute('fill'), root.querySelector('rect[data-mark="a:0"]').getAttribute('stroke')],
          overlay: root.querySelector('rect[data-pulse-of="a:0"]').getAttribute('style'),
          halo: root.querySelector('text[data-pulse-of="a:0"]').getAttribute('style'),
        })),
      );
      for (const { base, overlay, halo } of colors) {
        assert.deepEqual(base, [YELLOW.fill, YELLOW.border]);
        assert.ok(overlay.includes(`fill:${YELLOW.effect}`) && overlay.includes(`stroke:${YELLOW.effect}`) && !overlay.includes(YELLOW.tint), overlay);
        assert.ok(halo.includes(`stroke:${YELLOW.effect}`), halo);
        assert.ok(!/state-active/.test(overlay + halo));
      }
      await page.clock.runFor(ONE_MS);
      const last = { width: '80', cls: '', extra: 'on', text: '2', pulse: 0, halo: 0, overlayWidth: '80', haloText: '2', other: null };
      assert.deepEqual(await chart(), [last, last], '마지막 모습에는 후광이 없다');
      // 다른 장면으로 갔다 돌아오면 처음 틀로 돌아가고 이전 틀에만 있던 속성이 남지 않는다(시각을 되돌린 것과 같다).
      await tab(page, 'Two').click();
      await tab(page, 'One').click();
      assert.deepEqual(await chart(), [first, first]);
      assert.deepEqual(await page.evaluate(() => window.untouched), [], '바뀌지 않은 표는 한 번도 쓰이지 않았다');
    });
  });

  // 근거: 차트 틀. 이 장면에 시간표 행이 없는 차트는 장면에 들어서는 순간 처음 틀이다. 앞 장면의 마지막 틀이 남지 않는다
  test('event_chart_without_rows_in_the_scene_shows_frame_zero_on_entry', async () => {
    await open([ONCE, STATIC], {}, async (page) => {
      await page.clock.runFor(ONE_MS + 100);
      const widths = () => page.evaluate(() => [...document.querySelectorAll('[data-mark="a:0"]')].map((el) => el.getAttribute('width')));
      assert.deepEqual(await widths(), ['80', '80']);
      await tab(page, 'Two').click();
      assert.deepEqual(await widths(), ['40', '40']);
    });
  });

  // 근거: 사건 계약. 보통 고정 알약은 늘 보인다(불투명도 1). 점이 올라 있는 동안 알약의 활성 색이 1이고, 점이 떠난 뒤 400ms 동안 중립 색으로 부드럽게 돌아온다. 켜 둔 선(authored)은 이 색을 붙들지 않는다
  test('event_normal_fixed_pill_stays_opaque_and_only_its_active_tint_decays_to_neutral', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const read = () =>
        page.evaluate(() => {
          const [line, label] = [document.querySelector('#e-0'), document.querySelector('#l-0')];
          const text = label.querySelector('.edgelabel');
          const pill = label.querySelector('.pill');
          return { current: line.classList.contains('is-current'), on: label.classList.contains('on'), opacity: getComputedStyle(label).opacity, tint: Number(label.style.getPropertyValue('--pill-tint')), fill: getComputedStyle(text).fill, stroke: getComputedStyle(pill).stroke, textOpacity: getComputedStyle(text).opacity };
        });
      // 활성 색과 중립 색의 기준값: 같은 토큰을 직접 칠한 요소의 계산값
      const [active, muted] = await page.evaluate(() => {
        const probe = (fill) => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          el.style.fill = fill;
          document.querySelector('svg.fl').append(el);
          const value = getComputedStyle(el).fill;
          el.remove();
          return value;
        };
        return [probe('var(--color-state-active)'), probe('var(--color-muted)')];
      });
      assert.notEqual(active, muted);
      // 계산된 색은 직접 칠하면 rgb(0~255)이고 color-mix로 섞으면 color(srgb 0~1)라, 0~255 채널로 맞춰 거리를 잰다.
      const channels = (color) => (color.startsWith('color(') ? color.match(/[\d.]+/g).slice(0, 3).map((v) => Number(v) * 255) : color.match(/[\d.]+/g).slice(0, 3).map(Number));
      const distance = (fill) => {
        const [a, b] = [channels(fill), channels(muted)];
        return Math.hypot(...a.map((v, i) => v - b[i]));
      };
      const sameColor = (a, b) => Math.hypot(...channels(a).map((v, i) => v - channels(b)[i])) < 0.6;
      const frames = [];
      for (let t = 0; t < 1500; t += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        frames.push({ d: (await readState(page)).d, ...(await read()) });
      }
      assert.deepEqual([...new Set(frames.flatMap((f) => [f.opacity, f.textOpacity]))], ['1'], '보통 알약은 어느 프레임에서도 투명해지지 않는다');
      // 점이 올라 있는 동안(표시 0~500) 활성 색 그대로
      const during = frames.filter((f) => f.d > 30 && f.d < 480);
      assert.ok(during.length > 20);
      for (const f of during) assert.deepEqual([f.current, f.tint, sameColor(f.fill, active)], [true, 1, true], `${f.d}ms ${f.fill} / ${active}`);
      // 점이 떠난 뒤 400ms: 세기는 시각의 직선이고, 색은 중립으로 거리가 단조롭게 줄어든다
      const fading = frames.filter((f) => f.d > 520 && f.d < 880);
      assert.ok(fading.length > 15);
      for (const f of fading) near(f.tint, 1 - (f.d - 500) / 400, `${f.d}ms`);
      for (let i = 1; i < fading.length; i++) assert.ok(distance(fading[i].fill) <= distance(fading[i - 1].fill) + 1e-6, `${fading[i].d}ms에 색이 거꾸로 갔다`);
      assert.ok(distance(fading[0].fill) > distance(fading.at(-1).fill), '색이 실제로 줄었다');
      assert.ok(distance(fading.at(-1).fill) > 0 && distance(fading[0].fill) < distance(active), '활성과 중립 사이다');
      // 400ms가 끝난 뒤: 중립 색이다. 점이 지나간 선은 켜 두지 않으므로 on도 없고 활성 색은 0이며, 알약은 투명하지 않다
      const settled = frames.filter((f) => f.d > 920 && f.d < 1150);
      assert.ok(settled.length > 10);
      for (const f of settled) assert.deepEqual([f.current, f.on, f.tint, sameColor(f.fill, muted), f.opacity], [false, false, 0, true, '1'], `${f.d}ms: 지나간 선이 점이 없는 알약의 활성 색을 붙들었다`);
      const nearEnd = frames.filter((f) => f.d > 860 && f.d < 900);
      for (const f of nearEnd) assert.ok(distance(f.fill) < distance(active) * 0.2, `${f.d}ms: 끝나기 직전에 중립에 가깝다`);
    });
  });

  // 근거: 사건 계약. 조용한 알약(quiet)의 보임은 켜 둔 선이거나 활성 색이 남은 동안이다. 알약 불투명도 자체는 재생기가 건드리지 않고, 켜 둔 선은 활성 색을 붙들지 않는다
  test('event_quiet_pill_visibility_follows_the_held_edge_or_the_tint_and_never_holds_the_tint', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const read = () =>
        page.evaluate(() => {
          const label = document.querySelector('#l-1');
          return { shown: getComputedStyle(label).opacity, on: label.classList.contains('on'), tint: Number(label.style.getPropertyValue('--pill-tint')), inline: label.style.opacity };
        });
      const frames = [];
      for (let t = 0; t < 1500; t += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        frames.push({ d: (await readState(page)).d, ...(await read()) });
      }
      // 선 1은 점이 표시 600~1100에 있고 논리 600부터 1200까지 켜 둔 선이다.
      for (const f of frames.filter((x) => x.d < 580)) assert.deepEqual([f.shown, f.on, f.tint], ['0', false, 0], `${f.d}ms`);
      for (const f of frames.filter((x) => x.d > 640 && x.d < 1090)) assert.deepEqual([f.shown, f.on, f.tint], ['1', true, 1], `${f.d}ms`);
      // 점이 떠난 1100 뒤: 켜 둔 선(1200까지)이라 보이지만 활성 색은 줄어든다
      for (const f of frames.filter((x) => x.d > 1120 && x.d < 1190)) assert.ok(f.on && f.shown === '1' && f.tint < 1 && f.tint > 0.7, `${f.d}ms ${JSON.stringify(f)}`);
      for (const f of frames) assert.equal(f.inline, '', '재생기가 알약의 불투명도를 쓰지 않는다');
      // 표시 1500에 활성 색이 다 사라지고 장면이 마지막 모습이 된다. 마지막 모습은 장면 끝 직전까지 켜 둔 선을 그대로 보이되(조용한 알약이 보인다) 활성 색은 없다.
      await page.clock.runFor(200);
      assert.deepEqual(await read(), { shown: '1', on: true, tint: 0, inline: '' });
    });
  });

  // 근거: 사건 계약. 같은 시각에 나가고 들어서는 역방향 점이 같은 물리 선을 쓰면 선이 꺼지고 알약 색이 줄어드는 프레임이 없다
  test('event_reverse_handoff_on_the_same_physical_edge_never_dims_the_pill', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await tab(page, 'Two').click();
      // 장면 Two: 순방향 점이 표시 0~500, 역방향 점이 500~700에 같은 선 0을 지난다.
      const seen = [];
      for (let t = 0; t < 700 - STEP_MS; t += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        seen.push(await page.evaluate(() => ({ current: document.querySelector('#e-0').classList.contains('is-current'), tint: document.querySelector('#l-0').style.getPropertyValue('--pill-tint'), opacity: getComputedStyle(document.querySelector('#l-0')).opacity })));
      }
      assert.ok(seen.length > 30);
      assert.deepEqual(seen.filter((frame) => !frame.current || frame.tint !== '1' || frame.opacity !== '1'), [], '점이 이어 받는 동안 선이 꺼지거나 알약 색이 줄어들었다');
    });
  });

  // 근거: 같은 논리 카드가 여러 판에 그려지면 모든 그림이 같은 카드와 같은 후광을 갖는다. 카드 내용은 판마다 같은 시각에 바뀐다
  test('instances_the_same_logical_card_in_two_panels_stay_synchronized', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const cards = () => page.evaluate(() => [0, 4].map((i) => [0, 1].map((k) => document.querySelector(`#n-${i}-c${k}`).getAttribute('opacity'))));
      assert.deepEqual(await cards(), [['0', '0'], ['0', '0']]);
      await page.clock.runFor(150);
      assert.deepEqual(await cards(), [['1', '0'], ['1', '0']], '카드는 논리 도형 a 하나의 상태이고 두 그림이 같다');
      // 둘째 박자(논리 600~)에서 카드는 300 뒤인 900에 둘째 카드로 바뀐다.
      await page.clock.runFor(500);
      assert.deepEqual(await cards(), [['1', '0'], ['1', '0']]);
      await page.clock.runFor(300);
      assert.deepEqual(await cards(), [['0', '1'], ['0', '1']]);
      await page.clock.runFor(RESCUE_MS);
      // 도착 후광은 논리 사건 하나이고 c가 그려진 두 곳(2번과 3번)에 같은 세기로 그려졌다가 끝난다
      const overlays = await page.evaluate(() => [2, 3].map((i) => document.querySelectorAll(`#n-${i} > .fl-pulse`).length));
      assert.deepEqual(overlays, [1, 1]);
      assert.deepEqual((await readState(page)).overlays.filter(Boolean), []);
    });
    await open([ONCE, ONCE], {}, async (page) => {
      await page.clock.runFor(1100 + 100);
      const state = await readState(page);
      const level = envelope(state.d - 1100);
      assert.ok(level > 0);
      assert.deepEqual([state.overlays[2], state.overlays[3]], [state.pulses['node:c'], state.pulses['node:c']]);
      near(state.overlays[2], level);
      assert.equal(state.overlays[1], 0, '다른 도형은 후광이 없다');
    });
  });

  // 근거: 차트는 차트 id마다 따로 움직인다. 한 차트의 계열 보임과 행 밝히기가 다른 차트나 다른 판의 같은 차트 밖으로 번지지 않는다
  test('instances_chart_series_visibility_and_row_lights_are_scoped_per_chart_id', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const state = () =>
        page.evaluate(() => ({
          c1: [...document.querySelectorAll('[data-chart="c1"] .cs-0')].map((el) => el.classList.contains('hidden')),
          c2: [...document.querySelectorAll('[data-chart="c2"] .cs-0')].map((el) => el.classList.contains('hidden')),
          dim: [...document.querySelectorAll('[data-chart="c1"] .cr-1')].map((el) => el.classList.contains('dim')),
          lit: [...document.querySelectorAll('[data-chart="c1"] .cr-0')].map((el) => el.classList.contains('dim')),
        }));
      await page.clock.runFor(200);
      // 장면 One 처음 박자: c1은 계열이 보이고 c2는 숨는다. c1의 행 r0만 밝아 r1은 두 판 모두 흐려진다.
      assert.deepEqual(await state(), { c1: [false, false], c2: [true], dim: [true, true], lit: [false, false] });
      await page.clock.runFor(500);
      assert.deepEqual((await state()).dim, [false, false], '밝히기는 박자 0에만 있다');
      await tab(page, 'Two').click();
      assert.deepEqual(await state(), { c1: [false, false], c2: [false], dim: [false, false], lit: [false, false] });
    });
  });

  // 근거: 도형 이름 묶음(.fl-head)은 카드가 비어 있다가 차든 레이아웃이 움직이지 않는다
  test('instances_the_head_group_does_not_move_between_an_empty_and_a_filled_card', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const head = () => page.evaluate(() => [0, 4].map((i) => ({ transform: getComputedStyle(document.querySelector(`#n-${i} .fl-head`)).transform, cls: document.querySelector(`#n-${i} .fl-head`).getAttribute('class'), box: JSON.stringify(document.querySelector(`#n-${i}`).getBBox()) })));
      const empty = await head();
      await page.clock.runFor(150);
      const filled = await head();
      assert.deepEqual(filled, empty);
      for (const item of filled) assert.deepEqual([item.transform, item.cls], ['none', 'fl-head']);
    });
  });

  // 근거: 점은 그 선이 있는 판의 점 층에 놓인다
  test('instances_a_packet_is_drawn_in_the_panel_of_its_edge', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      await page.clock.runFor(100);
      const layers = await page.evaluate(() => [...document.querySelectorAll('.fl-packets')].map((layer) => layer.querySelectorAll('.fl-packet').length));
      assert.deepEqual(layers, [1, 0]);
    });
  });

  // 근거: 켜진 도형(.on)은 시간표가 합친 구간을 따른다. 같은 논리 도형은 모든 그림이 함께 켜지고 꺼진다
  test('instances_lit_nodes_follow_the_compiled_ranges_for_every_drawing_of_the_card', async () => {
    await open([ONCE, ONCE], {}, async (page) => {
      const lit = () => page.evaluate(() => [0, 1, 2, 3, 4].map((i) => document.querySelector(`#n-${i}`).classList.contains('on')));
      await page.clock.runFor(100);
      assert.deepEqual(await lit(), [true, false, false, false, true]);
      await page.clock.runFor(700);
      assert.deepEqual(await lit(), [false, true, false, false, false]);
    });
  });
});
