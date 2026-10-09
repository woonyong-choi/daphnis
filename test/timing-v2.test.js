// 시간 계약: 논리 시각과 표시 시각을 따로 둔다. 논리 시각(ms, 재생 속도 1)에는 효과 시간이 없고, 표시 길이는 컴파일러가 장면마다 한 번 정한다(timeline.presentation).
// D = max((T - t0) / s, (마지막 펄스 - t0) / s + 400, (마지막 선 이탈 - t0) / s + 400). 400은 표시 ms라 s로 나누지 않는다. 재생기와 움직이는 SVG가 같은 값을 읽는다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { arrivalOffsetMs } from '../src/easing.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, readState } from './chrome.js';
import { playerHtml } from './player-compiled.js';

const doc = (body) => `daphnis 2\n${body}`;
const HEAD = 'box a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\n';
const hop = (mode, extra = '', speed = 1) => doc(`${HEAD}scene "s" mode=${mode} speed=${speed}\n  a -> b time=750ms ${extra}\n`);
const durationsOf = (svg) => [...svg.matchAll(/dur="([\d.]+)s"/g)].map((m) => Number(m[1]) * 1000);

describe('timing: compile', () => {
  // 근거: 이동 하나 750ms의 표시 길이. 논리 750, 표시 1150(1배), 775(2배), 1900(0.5배)
  test('one 750ms hop is 750 logical ms and 1150 or 775 or 1900 display ms at speed 1 or 2 or 0.5', async () => {
    for (const [speed, display] of [[1, 1150], [2, 775], [0.5, 1900]]) {
      const { timeline } = await buildFigure(hop('once', '', speed));
      assert.deepEqual(timeline.segs.map((s) => [s.t0, s.t1]), [[0, 750]], '논리 길이는 속도와 효과 시간과 상관없다');
      assert.deepEqual(timeline.presentation, [display], `speed ${speed}`);
    }
  });

  // 근거: 박자는 서로 붙어 이어진다. 첫 박자도 이동 시간 최소가 없고 박자 뒤 머묾도 없다
  test('beats run back to back with no entry minimum, no hold and no scene-end pad', async () => {
    const { timeline } = await buildFigure(doc(`${HEAD}scene "s" mode=once\n  a -> b time=300ms\n  b -> c time=500ms\n`));
    assert.deepEqual(timeline.segs.map((s) => [s.t0, s.t1]), [[0, 300], [300, 800]]);
    assert.equal(timeline.total, 800);
    assert.deepEqual(timeline.presentation, [1200], '마지막 효과 400ms만 표시 시간에 더해진다');
    const two = await buildFigure(doc(`${HEAD}scene "a" mode=once\n  a -> b time=300ms\nscene "b" mode=once\n  b -> c time=500ms\n`));
    assert.deepEqual(two.timeline.segs.map((s) => [s.t0, s.t1]), [[0, 300], [300, 800]], '다음 장면은 논리 끝에서 시작한다. 표시 꼬리를 기다리지 않는다');
  });

  // 근거: 적은 wait와 for=는 그대로 지킨다(논리 시간이고 speed로 나뉜다)
  test('an authored wait and for= are honored exactly in logical time', async () => {
    const waited = await buildFigure(doc(`${HEAD}scene "s" mode=once speed=2\n  a -> b time=500ms\n  wait 2s\n  b -> c time=500ms\n`));
    assert.deepEqual(waited.timeline.segs.map((s) => [s.t0, s.t1]), [[0, 500], [500, 2500], [2500, 3000]]);
    assert.deepEqual(waited.timeline.presentation, [3000 / 2 + 400]);
    const flow = await buildFigure(doc(`${HEAD}scene "s" mode=once for=5s\n  track a -> b time=700ms\n`));
    assert.deepEqual(flow.timeline.segs.map((s) => [s.t0, s.t1]), [[0, 5000]]);
    assert.deepEqual(flow.timeline.presentation, [5000], '장면 길이 5000이 마지막 도착 700 + 400보다 길다');
  });

  // 근거: 효과 출처. 장면 끝 시각에 닿는 점도 그 장면의 후광이고 꼬리가 표시 길이에 든다. 끝 뒤에 닿는 점은 잘리고 후광이 없다
  test('an arrival exactly at for= keeps its pulse and its tail, and one past the end has none', async () => {
    const exact = await buildFigure(doc(`${HEAD}value n "n" on=b from=0\non b n+1\nscene "s" mode=once for=1s\n  track a -> b time=1s\n`));
    assert.deepEqual(exact.timeline.segs[0].pulses, [{ id: 'b', at: 1000 }], 'for=와 같은 시각의 도착은 이 장면의 사건이다');
    assert.deepEqual(exact.timeline.pulses.map((p) => [p.key, p.at, p.si]), [['value:0', 1000, 0]]);
    assert.deepEqual(exact.timeline.presentation, [1400], '도착 1000 + 꼬리 400');
    const past = await buildFigure(doc(`${HEAD}scene "s" mode=once for=1s\n  track a -> b time=1200ms\n`));
    assert.equal(past.timeline.segs[0].pulses?.length ?? 0, 0);
    assert.deepEqual(past.timeline.presentation, [1400], '잘린 점도 1000에 선을 떠나므로 선 알약 꼬리가 있다');
  });

  // 근거: 값이 장면 끝에 바뀌어도 그 장면의 마지막 모습이다. 차트 틀도 같다
  test('a value change exactly at the scene end is part of that scene and its final chart frame', async () => {
    const source = doc('box a "A"\nstore db "DB"\nvalue q "q" on=db from=0\nchart c "차트" bar {\n  series s "값"\n  row "r" s=q\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\nscene "s" mode=once\n  a -> db time=1200ms set="q+7"\n');
    const { timeline, scene } = await buildFigure(source);
    assert.deepEqual(timeline.values[0].changes, [[1200, '7']]);
    const periods = timeline.charts.c.rows[0].periods;
    assert.deepEqual(periods.map((p) => [p[0], p[1], p[2]]), [[0, 1200, 0], [1200, 1200, 1]], '끝 시각의 변화가 길이 0인 마지막 틀 구간이다');
    assert.deepEqual(periods.at(-1)[3].length > 0, true, '바뀐 표식이 있어 후광이 장면 끝 시각에 있다');
    assert.ok(timeline.pulses.some((p) => p.key.startsWith('chart:c:') && p.at === 1200 && p.si === 0));
    assert.deepEqual(timeline.presentation, [1600], '끝 시각의 변화도 400ms 꼬리를 갖는다');
    assert.equal(scene.chartFrames.c.frames.length, 2);
  });

  // 근거: 효과는 값이나 표식이 실제로 바뀐 것, 점이 닿은 것, 선에서 점이 떠난 것뿐이다. 켜기, 보이기, 지우기, 드러내기는 상태라 꼬리가 없다
  test('light, show, clear and reveal are state and add no tail', async () => {
    const lit = await buildFigure(doc(`${HEAD}scene "s" mode=once\n  light a\n`));
    assert.deepEqual(lit.timeline.segs.map((s) => [s.t0, s.t1]), [[0, 0]]);
    assert.deepEqual(lit.timeline.presentation, [0], '움직임도 효과도 없는 장면의 표시 길이는 0이다');
    const shown = await buildFigure(doc(`${HEAD}scene "s" mode=once\n  show a "글"\n  wait 1s\n`));
    assert.deepEqual(shown.timeline.presentation, [1000]);
  });

  // 근거: 옛 머묾 토큰을 읽지 않는다
  test('the legacy dwell, step-end and caption tokens are not read by any source file', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? (name === 'design-theme' || name === 'icons' ? [] : walk(join(dir, name))) : [join(dir, name)]));
    for (const file of walk('src').filter((f) => /\.js$/.test(f) && !/src\/tokens\.js$/.test(f))) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /duration\.dwell|duration\['(?:step-end|caption-fade|dwell-per-char|dwell-max)'\]|DWELL|labelShifts|edgesOn|edgesAt/, file);
    }
  });

  // 근거: SVG와 HTML이 같은 표시 길이를 쓴다. 한 값(timeline.presentation)을 읽는다
  test('the animated svg and the html player read the same display length', async () => {
    for (const speed of [1, 2, 0.5]) {
      const result = await buildFigure(hop('loop', '', speed));
      const svg = await toSvg(result, { scene: 0 });
      assert.ok(durationsOf(svg).every((ms) => ms === result.timeline.presentation[0]), `${durationsOf(svg)} ${result.timeline.presentation}`);
      assert.match(await toHtml(result, 'scene'), new RegExp(`"presentation":\\[${result.timeline.presentation[0]}\\]`));
    }
  });
});

describe('timing: edges', () => {
  const edgeWindows = async (source) => {
    const { timeline } = await buildFigure(source);
    const { hopLegs } = await import('../src/animate/legs.js');
    return timeline.segs.flatMap((seg) => seg.hops.flatMap((h) => hopLegs(h).map((leg) => ({ edge: leg.edge, from: seg.t0 + (h.at ?? 0) + leg.from, to: seg.t0 + (h.at ?? 0) + leg.to }))));
  };

  // 근거: 선은 점이 올라 있는 동안만 활성이다. 점이 지나간 선을 켜 두는 표시가 없다
  test('a single hop occupies its edge only during its leg and no edge marks remain', async () => {
    assert.deepEqual(await edgeWindows(hop('once')), [{ edge: 0, from: 0, to: 750 }]);
    const { timeline } = await buildFigure(hop('once'));
    assert.deepEqual(timeline.marks, {});
    assert.equal(timeline.segs[0].edgesOn, undefined);
  });

  // 근거: 여러 선을 지나는 흐름과 역방향, 사라지는 점
  test('a multi-leg track, a reverse hop and a lost dot occupy exactly their legs', async () => {
    const track = await edgeWindows(doc(`${HEAD}scene "s" mode=once for=3s\n  track a -> b -> c time=1s\n`));
    assert.equal(track.length, 2);
    assert.ok(track[0].to <= track[1].from + 1e-6, '선마다 자기 구간이다');
    assert.deepEqual([...new Set(track.map((w) => w.edge))].length, 2);
    const lost = await edgeWindows(doc(`${HEAD}scene "s" mode=once for=3s\n  track a -> b -> c time=1s lost=25%\n`));
    assert.deepEqual(lost.map((w) => w.edge), [0], '사라진 뒤 구간의 선은 켜지지 않는다');
    assert.ok(Math.abs(lost[0].to - arrivalOffsetMs(0.25, 1000)) < 1e-6, `끊는 시각 ${lost[0].to}`);
  });

  // 근거: 한 점이 나가는 시각에 다른 점이 같은 선에 들어서면 선은 이어서 켜진다
  test('an exit and an entry on one edge at the same time give one continuous window', async () => {
    const windows = await edgeWindows(doc(`${HEAD}scene "s" mode=once\n  a -> b time=500ms\n  a -> b time=500ms\n`));
    assert.deepEqual(windows, [{ edge: 0, from: 0, to: 500 }, { edge: 0, from: 500, to: 1000 }]);
  });
});

describe('timing: player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  // 가짜 시계를 건 새 페이지. requestAnimationFrame 호출 수를 세는 틀을 문서가 열리기 전에 건다.
  async function open(html, options, body) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, ...options });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(60_000);
    await page.evaluate(() => {
      window.rafCalls = 0;
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        window.rafCalls++;
        return request(callback);
      };
    });
    await page.setContent(html);
    await body(page);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const presentation = (page) => page.evaluate(() => window.probe.scenes[window.probe.scene].presentationMs);

  // 근거: 표시 길이는 컴파일러가 정한 값이고, 한 번 장면은 그 길이에서 마지막 모습에 서며 더는 프레임을 요청하지 않는다
  test('a once scene settles at its compiled display length and then requests no frame', async () => {
    for (const [speed, display] of [[1, 1150], [2, 775], [0.5, 1900]]) {
      const { html } = await playerHtml(hop('once', '', speed));
      await open(html, {}, async (page) => {
        assert.equal(await presentation(page), display);
        await page.clock.runFor(display - 40);
        assert.equal((await readState(page)).ended, false, `${speed}배: 길이 직전은 재생 중`);
        await page.clock.runFor(120);
        const done = await readState(page);
        assert.deepEqual([done.ended, done.isPlaying, done.phase], [true, false, 'final']);
        const calls = await page.evaluate(() => window.rafCalls);
        await page.clock.runFor(3000);
        assert.equal(await page.evaluate(() => window.rafCalls), calls, '끝난 장면은 프레임을 요청하지 않는다');
      });
    }
  });

  // 근거: 반복의 한 바퀴는 표시 길이이고 바퀴가 돌 때마다 후광 없이 처음으로 돌아간다
  test('a loop of a 750ms hop repeats every 1150ms and resets with no emphasis', async () => {
    const { html } = await playerHtml(doc(`${HEAD}value n "n" on=b from=0\nscene "s" mode=loop\n  a -> b time=750ms set="n+1"\n`));
    await open(html, {}, async (page) => {
      assert.equal(await presentation(page), 1150);
      await page.clock.runFor(1150 * 2 + 20);
      const state = await readState(page);
      assert.equal(state.isPlaying, true);
      assert.ok(state.d < 100, `두 바퀴 뒤 다시 처음 가까이다: ${state.d}`);
      assert.deepEqual(state.pulses, {}, '바퀴 경계에 후광이 남지 않는다');
    });
  });

  // 근거: 길이 0인 장면(켜기만 있는 장면)은 곧바로 마지막 모습이고 켜 둔 표시가 있다. 프레임을 요청하지 않고 길이로 나누지 않는다
  test('a light-only scene is final at once with its light on and spins no frame', async () => {
    for (const mode of ['once', 'loop', 'static']) {
      const { html } = await playerHtml(doc(`${HEAD}scene "s" mode=${mode}\n  light a\n`));
      await open(html, {}, async (page) => {
        assert.equal(await presentation(page), 0);
        const state = await readState(page);
        assert.deepEqual([state.ended, state.isPlaying, state.phase], [true, false, 'final'], mode);
        assert.deepEqual(await page.evaluate(() => window.probe.frame.held.lit), ['a']);
        const calls = await page.evaluate(() => window.rafCalls);
        await page.clock.runFor(2000);
        assert.equal(await page.evaluate(() => window.rafCalls), calls, `${mode}: 길이 0 장면은 프레임을 요청하지 않는다`);
      });
    }
  });

  // 근거: 정지의 마지막 모습에서 선은 모두 중립이고 보통 알약은 투명하지 않으며 활성 색만 0이다
  test('the static final state has every edge neutral and a visible untinted normal pill', async () => {
    const { html } = await playerHtml(doc(`${HEAD.replace('a -> b\n', 'a -> b "요청"\n')}scene "s" mode=static\n  a -> b time=750ms\n`));
    await open(html, {}, async (page) => {
      const read = await page.evaluate(() => ({ current: [...document.querySelectorAll('.fl-edge.is-current')].length, opacity: getComputedStyle(document.querySelector('#l-0')).opacity, textOpacity: getComputedStyle(document.querySelector('#l-0 .edgelabel')).opacity, tint: Number(document.querySelector('#l-0').style.getPropertyValue('--pill-tint') || 0), on: document.querySelector('#l-0').classList.contains('on') }));
      assert.deepEqual(read, { current: 0, opacity: '1', textOpacity: '1', tint: 0, on: false });
    });
  });
});
