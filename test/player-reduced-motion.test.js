// 움직임 줄이기(prefers-reduced-motion): 장면에 들어가면 마지막 모습으로 멈추고, 실행 중에 켜면 바로 마지막 모습으로 멈추며, 꺼도 저절로 재생하지 않는다(docs/design/playback.md 재생기).
// 실제 Chrome에서 재생기 상태와 Web Animations 상태, 계산된 스타일로 잰다. 재생 단추가 없어 가짜 시계만 흘리고, Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { launchChrome, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';

const BAR = 'daphnis 2\nchart c "차트" bar {\n  x "Value(ms)"\n  series s "S"\n  row "A" s=1\n}\nscene "하나" mode=once\n  reveal c.s\n';
const LINE = 'daphnis 2\nchart c "차트" line {\n  x "Week"\n  y "Rate"\n  series a "A"\n  point x=1 a=3\n  point x=2 a=5\n  point x=3 a=4\n}\nscene "하나" mode=once\n  reveal c.a\n';
// 장면마다 계열을 드러낸다. 장면의 reveal에 나온 계열은 그 장면이 시작할 때 숨는다(charts.md).
const TWO_SCENES = 'daphnis 2\npace 2s\nchart c "차트" bar {\n  x "Value(ms)"\n  series a "A"\n  series b "B"\n  row "R" a=1 b=2\n}\nscene "One" mode=once\n  reveal c.a\n  reveal c.b\nscene "Two" mode=loop\n  reveal c.a\n  reveal c.b\n';
const SAMPLE_MS = 600;
const SETTLE_MS = 300;
const REDUCE = { reducedMotion: 'reduce' };

// 차트 움직임(CSS 애니메이션)의 지금 상태. 보류 중인 pause()와 play()가 끝난 뒤에 잰다.
const motion = (page) =>
  page.evaluate(async () => {
    const animations = document.getAnimations({ subtree: true }).filter((a) => a.animationName?.startsWith('chart-'));
    await Promise.all(animations.map((a) => a.ready));
    return { times: animations.map((a) => a.currentTime), states: animations.map((a) => a.playState) };
  });

// 막대 폭, 선 경로, 값 글자, 점이 완성 상태인지. 자라는 움직임이 걸린 요소의 계산된 스타일과 상자 크기로 잰다.
const grownState = (page) =>
  page.evaluate(() => {
    const shown = (el) => !el.classList.contains('hidden') && !el.closest('.hidden');
    const bad = [];
    for (const el of document.querySelectorAll('svg.fl .grow')) {
      if (!shown(el)) continue;
      const box = el.getBBox();
      const drawn = el.getBoundingClientRect().width / (box.width * el.getScreenCTM().a);
      if (getComputedStyle(el).transform !== 'none' || Math.abs(drawn - 1) > 0.01) bad.push(`grow ${getComputedStyle(el).transform} ${drawn}`);
    }
    for (const el of document.querySelectorAll('svg.fl .draw')) if (shown(el) && parseFloat(getComputedStyle(el).strokeDashoffset) !== 0) bad.push(`draw ${getComputedStyle(el).strokeDashoffset}`);
    for (const el of document.querySelectorAll('svg.fl .wipe')) if (shown(el) && getComputedStyle(el).clipPath !== 'none' && getComputedStyle(el).clipPath !== 'inset(0px)') bad.push(`wipe ${getComputedStyle(el).clipPath}`);
    for (const el of document.querySelectorAll('svg.fl .pop, svg.fl .late, svg.fl .dot')) if (shown(el) && getComputedStyle(el).opacity !== '1') bad.push(`${el.getAttribute('class')} ${getComputedStyle(el).opacity}`);
    return bad;
  });

// 계열 i가 보이는지(드러냈는지). 숨긴 계열은 `hidden` class를 갖는다(불투명도는 `duration.fast` 동안 전환하므로 장면에 들어선 직후의 값으로는 알 수 없다).
const seriesShown = (page, i) => page.evaluate((n) => [...document.querySelectorAll(`svg.fl .cs-${n}`)].every((el) => !el.classList.contains('hidden')), i);

describe('player reduced motion', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(page), heap O(page), stack O(1), io page
  // vars: page = 페이지 하나를 여는 비용
  // basis: estimate
  // 원본의 재생기를 설정(options)대로 가짜 시계로 열어 body(page)를 돌린다.
  async function withPlayer(source, options, body) {
    const { html } = await playerHtml(source, { baseDir: 'test' });
    await withPage(browser, html, { viewport: { width: 1400, height: 900 }, ...options }, async (page) => {
      await page.clock.runFor(SETTLE_MS);
      await body(page);
    });
  }

  // 근거: 이슈 #105, 설계 playback.md 재생기: 움직임 줄이기가 켜진 채 장면에 들어가면 방식과 상관없이 고른 장면의 마지막 모습만 보이고 시계는 멈춘다
  test('player_reduced_motion_opens_a_scene_at_its_final_look_with_no_progressing_animation', async () => {
    for (const source of [BAR, LINE]) {
      await withPlayer(source, REDUCE, async (page) => {
        const first = await motion(page);
        await page.clock.runFor(SAMPLE_MS);
        const second = await motion(page);
        const state = await readState(page);

        assert.equal(state.phase, 'final', '마지막 모습이다');
        assert.equal(state.isPlaying, false, '시계가 멈췄다');
        assert.ok(second.states.every((s) => s !== 'running'), `진행하는 움직임이 있다: ${second.states}`);
        assert.deepEqual(second.times, first.times, '시간이 지나며 currentTime이 변한다');
        assert.deepEqual(await grownState(page), []);
      });
    }
  });

  // 근거: 같은 근거. 반복하는 장면(`mode=loop`)도 움직임 줄이기에서는 반복하지 않고 마지막 모습에서 멈춘다. 이 그림에서 두 계열은 모두 reveal에 나와 보통은 처음에 숨는다
  test('player_reduced_motion_shows_a_loop_scene_at_its_final_look_with_every_revealed_series_grown', async () => {
    await withPlayer(TWO_SCENES, undefined, async (page) => {
      await page.getByRole('tab', { name: 'Two' }).click();
      assert.equal(await seriesShown(page, 1), false, '움직임 줄이기 없이는 reveal에 나온 계열이 장면 시작에 숨는다');
    });
    await withPlayer(TWO_SCENES, REDUCE, async (page) => {
      await page.getByRole('tab', { name: 'Two' }).click();
      await page.clock.runFor(SETTLE_MS);
      const first = await motion(page);
      await page.clock.runFor(SAMPLE_MS);
      const second = await motion(page);
      const state = await readState(page);

      assert.equal(state.scene, 1);
      assert.equal(state.isPlaying, false, '반복하는 장면도 시계가 멈춘다');
      assert.ok(second.states.every((s) => s !== 'running'), second.states.join());
      assert.deepEqual(second.times, first.times);
      assert.equal(await seriesShown(page, 0), true);
      assert.equal(await seriesShown(page, 1), true, '마지막 모습에서는 드러낸 계열이 모두 보인다');
      assert.deepEqual(await grownState(page), []);
    });
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 재생 중에 설정이 켜지면 반복 장면도 바로 마지막 모습으로 바꾸고 시계를 멈춘다
  test('player_reduced_motion_turned_on_while_playing_stops_at_the_final_look_of_the_current_scene', async () => {
    await withPlayer(TWO_SCENES, undefined, async (page) => {
      await page.clock.runFor(SETTLE_MS);
      assert.equal((await readState(page)).isPlaying, true, '켜기 전에는 재생 중이다');
      assert.notEqual((await grownState(page)).length, 0, '켜기 전에는 자라는 중이어야 한다');

      await page.emulateMedia(REDUCE);
      await page.clock.runFor(SETTLE_MS);
      const first = await motion(page);
      await page.clock.runFor(SAMPLE_MS);
      const second = await motion(page);
      const state = await readState(page);

      assert.equal(state.scene, 0, '장면을 바꾸지 않는다');
      assert.equal(state.isPlaying, false);
      assert.ok(second.states.every((s) => s !== 'running'), second.states.join());
      assert.deepEqual(second.times, first.times);
      assert.equal(await seriesShown(page, 1), true);
      assert.deepEqual(await grownState(page), []);
    });
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 꺼져도 저절로 재생하지 않고 다음에 장면에 들어갈 때 그 방식을 따른다
  test('player_reduced_motion_turned_off_does_not_start_playing_until_a_scene_is_entered_again', async () => {
    for (const source of [BAR, TWO_SCENES]) {
      await withPlayer(source, REDUCE, async (page) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.clock.runFor(SAMPLE_MS);
        const state = await readState(page);

        assert.equal(state.isPlaying, false, '꺼져도 저절로 재생하지 않는다');
        assert.ok((await motion(page)).states.every((s) => s !== 'running'));
        assert.deepEqual(await grownState(page), []);
      });
    }
    await withPlayer(TWO_SCENES, REDUCE, async (page) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.getByRole('tab', { name: 'Two' }).click();
      assert.equal((await readState(page)).isPlaying, true, '꺼진 뒤 장면에 들어가면 그 장면의 방식으로 재생한다');
    });
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 움직임 줄이기에서 장면을 옮기면 들어간 장면이 마지막 모습으로 보이고 앞 장면의 값과 시각을 가져가지 않는다
  test('player_reduced_motion_scene_change_shows_the_entered_scene_at_its_final_look', async () => {
    await withPlayer(TWO_SCENES, REDUCE, async (page) => {
      await page.getByRole('tab', { name: 'Two' }).click();
      await page.clock.runFor(SETTLE_MS);

      assert.equal((await readState(page)).scene, 1);
      assert.equal(await seriesShown(page, 0), true);
      assert.equal(await seriesShown(page, 1), true);
      assert.ok((await motion(page)).states.every((s) => s !== 'running'));
      assert.equal((await readState(page)).isPlaying, false);
      assert.deepEqual(await grownState(page), []);

      await page.getByRole('tab', { name: 'One' }).click();
      await page.clock.runFor(SETTLE_MS);
      const back = await readState(page);

      assert.deepEqual([back.scene, back.isPlaying, back.phase], [0, false, 'final'], '돌아간 장면도 마지막 모습이다');
      assert.deepEqual(await grownState(page), []);
    });
  });
});
