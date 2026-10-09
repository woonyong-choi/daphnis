// 조건과 대기의 결과가 움직이는 SVG와 HTML 재생기에서 같다(docs/design/playback.md 이벤트 순서, 대기가 끝나는 때).
// 대기가 풀린 시각과 시간 초과 분기 이동의 점을 SMIL 값과 재생기 화면의 점, 켜진 선에서 25ms 간격으로 읽어 시간표의 이동 시각에 맞추고,
// 문서 가림(일시정지), 장면 배속, 장면 직접 선택, 되풀이가 값과 점의 결과를 바꾸지 않는지 본다. 재생 단추와 배속 메뉴는 없다.
// 시나리오 원본은 test/fixtures/flow/ 에 있고 when-wait.test.js와 같다. Chrome이 없으면 시험이 실패한다(경로는 CHROME_PATH로 바꾼다).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';
import { discreteAt, packetsOf } from './smil.js';
import { sameState, sceneModel, timelineStateAt } from './value-display.js';
import { PROBE_MS, setHidden, tab, valuesNow } from './value-player.js';

const NAMES = ['mutex-wait', 'queue-wait', 'circuit-breaker', 'deadlock-wait'];
// keyTimes는 장면 길이 비율의 소수 5자리라 시각으로는 이만큼(ms) 어긋난다
const EDGE_MS = 2;

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
const sourceOf = (name) => readFileSync(new URL(`./fixtures/flow/${name}.dap`, import.meta.url), 'utf8');

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 장면의 이동 수
// basis: estimate
/** 장면 si를 자른 시간표의 이동마다 { hop, start, end }. start와 end는 장면 안 논리 시각(ms)이고 `cut`한 이동은 장면이 끝날 때 잘린 길이까지만 간다. */
const hopsOf = (model) => model.sliced.segs.flatMap((seg) => seg.hops.map((hop) => ({ hop, start: seg.t0 + (hop.at ?? 0), end: seg.t0 + (hop.at ?? 0) + (hop.cut ?? hop.ms) })));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 시간표의 장면 si가 시작하는 그림 전체 논리 시각. 대기(waits)의 시각은 그림 전체 시각이다. */
const sceneStart = (timeline, si) => timeline.segs.find((seg) => seg.si === si).t0;

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 이동 수
// basis: estimate
/** 논리 시각 logical(장면 안)에 지나는 이동 목록. 어느 이동의 시작, 끝, 틈 경계에서 1ms 안이면 undefined(그 시각은 재지 않는다). */
function activeAt(hops, logical) {
  const near = hops.some(({ hop, start, end }) => [start, end, ...(hop.gaps ?? []).flat().map((fraction) => start + fraction * hop.ms)].some((edge) => Math.abs(logical - edge) <= 1));
  if (near) return undefined;
  return hops.filter(({ start, end }) => logical >= start && logical < end);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 대기 w가 풀리거나 시간 초과가 된 시각에 출발하는 이동의 번호. 풀린 점은 그 줄의 이동이고, 시간 초과는 else 도형으로 가는 같은 줄의 이동이다. */
const hopIndexOf = (hops, wait, offset) => hops.findIndex(({ hop, start }) => hop.line === wait.line && Math.abs(start - (wait.t1 - offset)) <= 1);

// 근거: 이슈 #119 완료 조건 "대기 해제 시각과 분기 이동이 움직이는 SVG와 HTML 재생기에서 같다. SMIL 값을 25ms 간격으로 풀어 재생기 상태와 비교"
test('toSvg_a_dot_released_from_a_wait_or_sent_to_the_else_shape_starts_at_the_wait_end_time_in_the_timeline_and_the_smil', async () => {
  let checked = 0;
  let expected = 0;
  for (const name of NAMES) {
    const result = await buildFigure(sourceOf(name), { baseDir: 'test' });
    const { timeline } = result;
    for (const si of timeline.steps.keys()) {
      const model = sceneModel(result, si);
      const { display, speed } = model;
      if (display === 0) continue;
      const hops = hopsOf(model);
      const packets = packetsOf(await toSvg(result, { scene: si, name }));

      assert.equal(packets.length, hops.length, `${name} 장면 ${si}: 점 수`);
      for (const wait of timeline.waits.filter((w) => w.si === si && (w.end === 'released' || w.end === 'timeout'))) {
        const index = hopIndexOf(hops, wait, sceneStart(timeline, si));
        expected++;
        assert.ok(index >= 0, `${name} 장면 ${si}: 대기 끝(${wait.t1}ms)에 출발한 점이 시간표에 있다`);
        const { opacity } = packets[index];
        const { start, end, hop } = hops[index];
        const shownAt = opacity.times[opacity.values.indexOf(1)] * display;

        assert.ok(Math.abs(shownAt - start / speed) <= EDGE_MS, `${name} 장면 ${si}: SMIL 점이 ${shownAt.toFixed(1)}ms에 보이기 시작하고 대기는 ${start / speed}ms(장면 안)에 끝난다`);
        for (let td = Math.max(0, Math.floor(start / speed / PROBE_MS) * PROBE_MS - 4 * PROBE_MS); td < Math.min(display, start / speed + 8 * PROBE_MS); td += PROBE_MS) {
          const logical = td * speed;
          const isGap = (hop.gaps ?? []).some(([from, to]) => logical > start + from * hop.ms && logical < start + to * hop.ms);
          if ([start, end, ...(hop.gaps ?? []).flat().map((fraction) => start + fraction * hop.ms)].some((edge) => Math.abs(logical - edge) <= EDGE_MS) || isGap) continue;

          assert.equal(discreteAt(opacity, td / display), logical >= start && logical < end ? 1 : 0, `${name} 장면 ${si}: t=${td}ms 점의 보임이 대기 끝 시각을 따른다`);
        }
        checked++;
      }
    }
  }
  assert.equal(checked, expected);
  assert.ok(checked >= 9, `풀림과 시간 초과 점을 여럿 쟀다(${checked})`);
});

// 근거: 계약 "기다리는 점은 그리지 않고 선도 켜지 않는다"(움직이는 SVG의 선은 풀린 시각에 바로 켜진다. 선 켜짐에 CSS 전환은 걸지 않는다)
test('toSvg_the_edge_of_a_waiting_dot_lights_at_the_release_time_and_not_at_the_scene_start', async () => {
  const result = await buildFigure(sourceOf('mutex-wait'), { baseDir: 'test' });
  const model = sceneModel(result, 1);
  const svg = await toSvg(result, { scene: 1, name: 'mutex-wait' });
  const [released] = hopsOf(model).filter(({ hop }) => hop.at > 0);
  const { edge } = released.hop;
  const className = new RegExp(`<g id="e-${edge}"[^>]* class="[^"]* (a\\d+)"`).exec(svg)[1];
  const frames = new RegExp(`@keyframes ${className} \\{ ([^\\n]*?) \\}\\n`).exec(svg)[1];
  const lit = [...frames.matchAll(/([\d.]+)%(?:,[\d.]+%)? \{ ([^}]*) \}/g)].find(([, , body]) => body.includes('--color-state-active'));
  const shownAt = (Number(lit[1]) / 100) * model.display;

  assert.ok(released.start > 0, '기다린 이동은 장면 시작이 아닌 풀린 시각에 출발한다');
  assert.ok(Math.abs(shownAt - released.start) <= EDGE_MS, `선이 ${shownAt.toFixed(1)}ms에 바로 켜진다(풀린 시각 ${released.start}ms)`);
  assert.ok(!frames.slice(0, frames.indexOf(lit[0])).includes('--color-state-active'), '풀리기 전에는 선이 켜진 색을 쓰지 않는다');
});

describe('player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(1), heap O(1), stack O(1), io 1
  // basis: estimate
  // 원본의 재생기 HTML을 가짜 시계로 연 페이지로 body(page, result)를 돌리고 body가 돌려준 값을 돌려준다. 전환은 가짜 시계를 따라가지 못하므로 꺼서 켜진 뒤의 값을 잰다.
  async function withPlayer(source, body) {
    const { html, result } = await playerHtml(source, { baseDir: 'test' });
    let out;
    await withPage(browser, html, {}, async (page) => {
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      out = await body(page, result);
    });
    return out;
  }

  // cost: time O(1), heap O(1), stack O(1), io 1
  // basis: estimate
  // 지금 재생기 화면에서 지나는 선(`is-current`)의 번호를 정렬해 담은 목록
  const currentEdges = (page) => page.evaluate(() => [...document.querySelectorAll('.fl-edge.is-current')].map((el) => Number(el.id.replace('e-', ''))).sort((a, b) => a - b));

  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 가짜 시계를 stepMs씩 흘리며 { d(장면 안 표시 시각), scene, phase, packets(보이는 점 수), edges, values } 목록을 모은다.
  async function framesOf(page, { limitMs, stepMs = PROBE_MS }) {
    const frames = [];
    for (let t = stepMs; t <= limitMs; t += stepMs) {
      await page.clock.runFor(stepMs);
      const state = await readState(page);
      frames.push({ d: state.d ?? state.elapsed, scene: state.scene, phase: state.phase, packets: state.packets, edges: await currentEdges(page), values: await valuesNow(page) });
    }
    return frames;
  }

  // cost: time O(F), heap O(F), stack O(1)
  // vars: F = 프레임 수
  // basis: estimate
  // 같은 점 수와 값 글자가 이어지는 프레임을 하나로 묶은 [점 수, 글자] 목록. 배속이 달라도 차례는 같다.
  const runsOf = (frames) =>
    frames.reduce((runs, { packets, values: shown }) => {
      const run = JSON.stringify([packets, shown.map(([vi, text]) => [vi, text])]);
      return runs.length && runs.at(-1) === run ? runs : [...runs, run];
    }, []);

  // 근거: 이슈 #119 완료 조건 "대기 해제 시각과 분기 이동이 움직이는 HTML 재생기에서 같다"(재생기 점과 지나는 선이 시간표의 출발 시각에 나타난다)
  test('player_dots_and_current_edges_follow_the_hop_times_of_the_timeline_in_every_scene', async () => {
    let waited = 0;
    for (const name of NAMES) {
      await withPlayer(sourceOf(name), async (page, result) => {
        const { timeline } = result;
        for (const si of timeline.steps.keys()) {
          const model = sceneModel(result, si);
          if (model.display === 0) continue;
          const hops = hopsOf(model);
          const hasEdges = hops.every(({ hop }) => hop.edge !== undefined);
          const waits = timeline.waits.filter((w) => w.si === si && (w.end === 'released' || w.end === 'timeout'));
          const seen = new Set();
          await tab(page, si);
          const frames = await framesOf(page, { limitMs: model.display });
          let compared = 0;

          for (const { d, scene, packets, edges } of frames) {
            const active = activeAt(hops, d * model.speed);
            if (scene !== si || active === undefined) continue;

            assert.equal(packets, active.length, `${name} 장면 ${si}: ${Math.round(d)}ms 점 수`);
            if (hasEdges) assert.deepEqual(edges, [...new Set(active.map(({ hop }) => hop.edge))].sort((a, b) => a - b), `${name} 장면 ${si}: ${Math.round(d)}ms 지나는 선`);
            compared++;
            // 대기가 끝난 직후의 프레임에서 그 이동의 점이 이미 보이고 있다
            waits.forEach((wait, k) => {
              const start = wait.t1 - sceneStart(timeline, si);
              if (d * model.speed - start > 5 && d * model.speed - start < 60 && active.some(({ start: from }) => Math.abs(from - start) <= 1)) seen.add(k);
            });
          }
          assert.ok(compared > model.display / PROBE_MS / 2, `${name} 장면 ${si}: 잰 프레임 ${compared}`);
          assert.equal(seen.size, waits.length, `${name} 장면 ${si}: 대기가 끝난 직후의 점을 모두 쟀다`);
          waited += waits.length;
        }
      });
    }
    assert.ok(waited >= 9, `대기가 끝난 점을 여럿 쟀다(${waited})`);
  });

  // 근거: 이슈 #119 완료 조건 "대기와 값 결과가 움직이는 SVG와 HTML 재생기에서 같다", 값은 대기가 풀리는 시각의 set으로 바뀐다
  test('player_values_change_at_the_time_the_timeline_says_while_waits_hold_and_release', async () => {
    for (const name of NAMES) {
      await withPlayer(sourceOf(name), async (page, result) => {
        for (const si of result.timeline.steps.keys()) {
          const model = sceneModel(result, si);
          if (model.display === 0) continue;
          const rowOf = model.globals;
          await tab(page, si);
          const frames = await framesOf(page, { limitMs: model.display });

          for (const { d, scene, values: shown } of frames) {
            if (scene !== si) continue;
            const expected = timelineStateAt(model, d).flatMap(({ text }, k) => (text === undefined ? [] : [[rowOf[k], text]]));

            assert.deepEqual(shown.map(([vi, text]) => [vi, text]).filter(([, text]) => text !== ''), expected, `${name} 장면 ${si}: ${Math.round(d)}ms 값 글자`);
          }
        }
      });
    }
  });

  // 근거: 계약 "끝나지 않는 대기(stuck)는 점을 그리지 않는다". 서로 기다리는 장면은 점도 선도 없이 값을 그대로 둔 채 끝에 머문다
  test('player_a_scene_of_stuck_waits_draws_no_dot_or_edge_and_keeps_the_values', async () => {
    await withPlayer(sourceOf('deadlock-wait'), async (page, result) => {
      await tab(page, 1);
      const state = await readState(page);
      const frames = await framesOf(page, { limitMs: 1000 });

      assert.equal(state.scene, 1);
      assert.equal(state.phase, 'final', '길이가 없는 장면은 바로 끝 모습이다');
      assert.equal(sceneModel(result, 1).display, 0);
      assert.deepEqual(state.values, ['t1', 't2'], '쥔 쪽 값이 그대로다');
      assert.ok(frames.every(({ packets, edges, values: shown }) => packets === 0 && edges.length === 0 && shown.map(([, text]) => text).join() === 't1,t2'));
    });
  });

  // 근거: 이슈 #119 완료 조건 "pause, rate, restart와 단계 직접 선택이 대기와 값 결과를 바꾸지 않는다", 설계 playback.md 이벤트 순서 "재생 시계만 움직이고 계산을 다시 하지 않는다". 일시정지는 문서 가림이고 배속은 장면의 speed=다
  test('player_hidden_document_and_scene_speed_do_not_change_the_waits_values_and_dots_of_a_scene', async () => {
    for (const name of ['mutex-wait', 'queue-wait', 'circuit-breaker']) {
      const base = sourceOf(name);
      const reference = await withPlayer(base, async (page, result) => {
        const lists = [];
        for (const si of result.timeline.steps.keys()) {
          await tab(page, si);
          lists.push(runsOf(await framesOf(page, { limitMs: sceneModel(result, si).display })));
        }
        return lists;
      });

      // 문서를 가리면 시계가 멈춰 점과 값이 그대로고, 다시 보이면 이어서 같은 차례가 된다
      await withPlayer(base, async (page, result) => {
        const { display } = sceneModel(result, 0);
        const before = await framesOf(page, { limitMs: display / 2 });
        await setHidden(page, true);
        const frozen = runsOf([{ packets: (await readState(page)).packets, values: await valuesNow(page) }]);
        const during = await framesOf(page, { limitMs: 3000 });
        await setHidden(page, false);
        const after = await framesOf(page, { limitMs: display });

        assert.ok(during.every((frame) => JSON.stringify(runsOf([frame])) === JSON.stringify(frozen)), `${name}: 가린 동안 점과 값이 그대로다`);
        assert.deepEqual(runsOf([...before, ...during, ...after]).slice(0, reference[0].length), reference[0], `${name}: 가렸다 다시 보여도 같은 차례다`);
      });
      // 장면 배속: 2배속 장면도 점이 나타나고 값이 바뀌는 차례가 같다(논리 시간만 반으로 준다)
      await withPlayer(base.replaceAll('mode=once', 'mode=once speed=2'), async (page, result) => {
        for (const si of result.timeline.steps.keys()) {
          await tab(page, si);
          // 장면 시간으로 같은 간격(25ms)을 재려면 화면 간격을 반으로 줄인다
          const runs = runsOf(await framesOf(page, { limitMs: sceneModel(result, si).display, stepMs: PROBE_MS / 2 }));

          assert.deepEqual(runs, reference[si], `${name} 장면 ${si}: 2배속`);
        }
      });
    }
  });

  // 근거: 이슈 #119 완료 조건 "단계 직접 선택이 대기와 값 결과를 바꾸지 않는다", 계약 "장면을 직접 골라도 앞 장면을 재생하지 않는다"
  test('player_selecting_a_scene_directly_shows_the_same_dots_and_values_as_playing_up_to_it', async () => {
    for (const name of NAMES) {
      const source = sourceOf(name);
      // 앞 장면을 끝까지 재생한 뒤 장면을 고른 점과 값의 차례
      const played = await withPlayer(source, async (page, result) => {
        const lists = [];
        for (const si of result.timeline.steps.keys()) {
          if (si > 0) await framesOf(page, { limitMs: sceneModel(result, si - 1).display + 4000 });
          await tab(page, si);
          lists.push(runsOf([{ packets: (await readState(page)).packets, values: await valuesNow(page) }, ...(await framesOf(page, { limitMs: sceneModel(result, si).display }))]));
        }
        return lists;
      });

      for (const si of [1, 0]) {
        await withPlayer(source, async (page, result) => {
          await tab(page, si);
          const first = await valuesNow(page);
          const own = runsOf([{ packets: (await readState(page)).packets, values: first }, ...(await framesOf(page, { limitMs: sceneModel(result, si).display }))]);
          // 장면 처음(0ms)에 이미 바뀌는 값(`reserve=`가 첫 이동 때 한 칸을 차지한다)은 initial이 아니라 시간표가 그 시각에 정한 글이다
          const atStart = timelineStateAt(sceneModel(result, si), 0).flatMap(({ text }) => (text === undefined ? [] : [text]));

          assert.deepEqual(first.map(([, text]) => text).filter((text) => text !== ''), atStart, `${name} ${si}번 장면의 시작 값은 시간표가 0ms에 정한 글이다`);
          assert.deepEqual(own, played[si], `${name} ${si}번 장면을 바로 고른 차례가 앞 장면을 재생한 뒤 고른 차례와 같다`);
        });
      }
    }
  });

  // 근거: 이슈 #119 완료 조건 "restart가 값 결과를 바꾸지 않는다", 계약 "반복은 장면의 처음 값에서 시작한다". `mode=loop` 장면은 한 바퀴를 마치면 대기를 처음부터 다시 거친다
  test('player_loop_restart_runs_the_waits_of_the_scene_again_from_its_start_values', async () => {
    for (const name of ['mutex-wait', 'queue-wait', 'circuit-breaker']) {
      await withPlayer(sourceOf(name).replaceAll('mode=once', 'mode=loop'), async (page, result) => {
        const si = result.timeline.steps.length - 1;
        const length = sceneModel(result, si).display;
        const rows = result.timeline.values.filter((row) => row.si === si);
        await tab(page, si);
        const frames = await framesOf(page, { limitMs: length * 2.4 });
        // 장면 안 시각 d가 다시 작아진 프레임이 되풀이의 처음이다
        const starts = frames.flatMap(({ d }, i) => (i > 0 && d < frames[i - 1].d ? [i] : []));
        const lap = runsOf(frames.slice(0, starts[0]));

        assert.ok(starts.length >= 1, `${name}: 한 바퀴를 넘겨 되풀이한다`);
        assert.deepEqual(frames[starts[0]].values.map(([, text]) => text).filter((text) => text !== ''), rows.map((row) => row.initial), `${name}: 되풀이한 장면은 끝난 값이 아니라 시작 값에서 시작한다`);
        assert.deepEqual(runsOf(frames.slice(starts[0], starts[1] ?? frames.length)).slice(0, lap.length - 1), lap.slice(0, lap.length - 1), `${name}: 되풀이한 바퀴도 같은 차례로 점이 나타나고 값이 바뀐다`);
        assert.ok(frames.every(({ scene }) => scene === si), `${name}: 반복하는 동안 다른 장면으로 넘어가지 않는다`);
      });
    }
  });
});
