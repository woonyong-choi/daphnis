// 값 유지와 읽기 결과가 움직이는 SVG와 HTML 재생기에서 같다(docs/playback.md 장면, docs/design/playback.md 장면 사이 값 유지, 값 변화).
// 재생기를 가짜 시계로 돌려, 장면을 탭으로 고르거나 반복한 뒤의 값 글자와 갱신 펄스를 시간표와 같은 장면 시각의 SMIL 값에 맞춘다.
// 재생 단추, 배속 메뉴는 없다. 일시정지는 문서 가림, 배속은 장면의 `speed=`, 단계 선택은 장면 탭, 반복은 `mode=loop`가 맡는다. Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';
import { smilStateAt, valueElementsOf } from './smil.js';
import { LEVEL_TOLERANCE, sameState, sceneModel, timelineStateAt } from './value-display.js';
import { PROBE_MS, runFrames, sceneRows, setHidden, statesOf, tab, valuesNow } from './value-player.js';

const SOURCES = ['./fixtures/value-keep/lap.dap', './fixtures/flow/value-keep.dap'];

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
const sourceOf = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// 근거: 이슈 #118 완료 조건 "SMIL 값을 25ms 간격으로 풀어 재생기 상태와 비교"(재생기가 읽는 시간표와 같다), 설계 playback.md 값 변화 "움직이는 SVG는 SMIL 이산 불투명도로 보이고 갱신 펄스는 80/80/240ms 꺾은선이다". 장면마다 그 장면만 그린 SVG를 푼다
test('toSvg_keep_and_read_values_match_the_timeline_every_25ms_in_every_scene', async () => {
  for (const path of SOURCES) {
    const result = await buildFigure(sourceOf(path), { baseDir: 'test' });
    for (const si of result.timeline.steps.keys()) {
      const model = sceneModel(result, si);
      const { sliced, display, speed } = model;
      const elements = valueElementsOf(await toSvg(result, { scene: si }));
      let probed = 0;
      let flashed = 0;

      assert.ok(elements.every((el) => el.dur === Infinity || Math.abs(el.dur - display) <= 1), `${path} ${si}: 움직이는 값 요소는 모두 장면의 표시 길이(${display}ms)를 쓴다`);
      for (let td = 0; td < display; td += PROBE_MS) {
        const smil = smilStateAt(elements, sliced.values, td);
        const expected = timelineStateAt(model, td);

        // 글자 값 구간의 경계는 keyTimes 소수 5자리 때문에 0.1ms쯤 어긋나므로 경계에서 2ms 안의 시각은 글자를 견주지 않는다.
        const nearEdge = sliced.values.some((row) => row.periods.some(([from, to]) => Math.abs(td - from / speed) <= 2 || Math.abs(td - to / speed) <= 2));
        if (!nearEdge) assert.ok(smil.every(({ texts }) => texts.length <= 1), `${path} 장면 ${si}: t=${td}ms 같은 줄에 글자 요소가 둘 이상 보인다 ${JSON.stringify(smil)}`);
        assert.ok(sameState(smil.map((s, i) => ({ ...s, text: nearEdge ? expected[i].text : s.text })), expected), `${path} 장면 ${si}: t=${td}ms ${JSON.stringify([smil, expected])}`);
        probed++;
        flashed += smil.some(({ flash }) => flash > 0) ? 1 : 0;
      }
      assert.ok(probed > display / PROBE_MS / 2, `${path} 장면 ${si}: 잰 시각 ${probed}`);
      if (si === 0) assert.ok(flashed > 0, `${path}: 펄스가 있는 시각을 잰다`);
    }
  }
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

  // 근거: 이슈 #118 완료 조건 "같은 입력은 같은 값 결과를 만든다", 재생기 상태가 시간표의 값 구간과 펄스와 같다. 장면을 탭으로 고르면 장면 처음부터 재생된다
  test('player_values_follow_the_timeline_periods_and_pulses_on_every_frame_of_every_scene', async () => {
    for (const path of SOURCES) {
      await withPlayer(sourceOf(path), async (page, result) => {
        const { timeline } = result;
        for (const si of timeline.steps.keys()) {
          await tab(page, si);
          const model = sceneModel(result, si);
          const { display } = model;
          const rows = sceneRows(timeline, si);
          const first = await valuesNow(page);

          assert.deepEqual(first.map(([, text]) => text), rows.map(([row]) => row.initial), `${path} ${si}번 장면에 들어서면 시간표의 initial이 보인다`);
          const frames = await runFrames(page, { limitMs: display });
          const shown = new Set();
          for (const { d, scene, values } of [{ d: 0, scene: si, values: first }, ...frames]) {
            if (scene !== si) continue;
            const expected = timelineStateAt(model, d).flatMap(({ text, flash }, k) => (text !== undefined || flash > 0 ? [[rows[k][1], text ?? '', flash]] : []));
            assert.deepEqual(values.map(([vi, text]) => [vi, text]), expected.map(([vi, text]) => [vi, text]), `${path} 장면 ${si}: ${Math.round(d)}ms 글자`);
            for (const [k, [, , flash]] of values.entries()) assert.ok(Math.abs(flash - expected[k][2]) <= LEVEL_TOLERANCE, `${path} 장면 ${si}: ${Math.round(d)}ms 펄스 ${flash} / ${expected[k][2]}`);
            for (const [vi, text] of values) shown.add(`${vi}:${text}`);
          }
          // 시간표가 정한 모든 글(시작 값과 변화)이 화면에 한 번은 보인다
          for (const [row, vi] of rows) for (const text of [row.initial, ...row.changes.map(([, changed]) => changed)]) assert.ok(shown.has(`${vi}:${text}`), `${path} 장면 ${si}: ${row.id}=${text}`);
        }
      });
    }
  });

  // 근거: 이슈 #118 완료 조건 "SMIL 값을 25ms 간격으로 풀어 재생기 상태와 비교", 값 글자와 펄스가 같은 시각에 바뀐다
  test('player_state_matches_the_animated_svg_of_the_same_scene_at_the_same_scene_time', async () => {
    for (const path of SOURCES) {
      await withPlayer(sourceOf(path), async (page, result) => {
        for (const si of result.timeline.steps.keys()) {
          const { sliced, display, speed } = sceneModel(result, si);
          const elements = valueElementsOf(await toSvg(result, { scene: si }));
          const edges = sliced.values.flatMap((row) => row.periods.map(([from]) => from / speed));
          const globalOf = sceneRows(result.timeline, si).map(([, vi]) => vi);
          await tab(page, si);
          const frames = await runFrames(page, { limitMs: display });
          let compared = 0;

          for (const { d, scene, values } of frames) {
            if (scene !== si || edges.some((from) => Math.abs(d - from) <= 2)) continue;
            const smil = smilStateAt(elements, sliced.values, d).flatMap(({ text, flash }, local) => (text !== undefined || flash > 0 ? [[globalOf[local], text ?? '', flash]] : []));

            assert.deepEqual(values.map(([vi, text]) => [vi, text]), smil.map(([vi, text]) => [vi, text]), `${path} 장면 ${si}: ${Math.round(d)}ms 글자`);
            for (const [k, [, , flash]] of values.entries()) assert.ok(Math.abs(flash - smil[k][2]) <= LEVEL_TOLERANCE, `${path} 장면 ${si}: ${Math.round(d)}ms 펄스 ${flash} / ${smil[k][2]}`);
            compared++;
          }
          assert.ok(compared > display / PROBE_MS / 2, `${path} 장면 ${si}: 비교한 프레임 ${compared}`);
        }
      });
    }
  });

  // 근거: 이슈 #118 완료 조건 "pause, rate가 값 결과를 바꾸지 않는다", 설계 playback.md 이벤트 순서 "재생 시계만 움직이고 계산을 다시 하지 않는다". 일시정지는 문서 가림이고 배속은 장면의 speed=다
  test('player_hidden_document_and_scene_speed_do_not_change_the_value_states_of_a_scene', async () => {
    for (const path of SOURCES) {
      const base = sourceOf(path);
      const reference = await withPlayer(base, async (page, result) => {
        const lists = [];
        for (const si of result.timeline.steps.keys()) {
          await tab(page, si);
          const frames = await runFrames(page, { limitMs: sceneModel(result, si).display });
          lists.push({ full: statesOf(frames), texts: statesOf(frames, false) });
        }
        return lists;
      });

      // 문서를 가리면 시계가 멈춰 값 글자와 펄스가 그대로고, 다시 보이면 이어서 같은 차례가 된다
      await withPlayer(base, async (page, result) => {
        const { display } = sceneModel(result, 0);
        const before = await runFrames(page, { limitMs: display / 2 });
        await setHidden(page, true);
        const frozen = await valuesNow(page);
        const during = await runFrames(page, { limitMs: 3000 });
        await setHidden(page, false);
        const after = await runFrames(page, { limitMs: display });

        assert.ok(during.every(({ values }) => JSON.stringify(values) === JSON.stringify(frozen)), '가린 동안 값 글자와 펄스가 그대로다');
        assert.deepEqual(statesOf([...before, ...during, ...after]).slice(0, reference[0].full.length), reference[0].full);
      });
      // 장면 배속: 2배속 장면도 한 장면의 값 글자가 바뀌는 차례와 값이 같다(논리 시간만 반으로 준다)
      await withPlayer(base.replaceAll('mode=once', 'mode=once speed=2'), async (page, result) => {
        for (const si of result.timeline.steps.keys()) {
          await tab(page, si);
          // 장면 시간으로 같은 간격(25ms)을 재려면 화면 간격을 반으로 줄인다
          const frames = await runFrames(page, { limitMs: sceneModel(result, si).display, stepMs: PROBE_MS / 2 });

          assert.deepEqual(statesOf(frames, false), reference[si].texts, `${path} 장면 ${si}: 2배속`);
        }
      });
    }
  });

  // 근거: 이슈 #118 완료 조건 "단계 직접 선택이 값 결과를 바꾸지 않는다", 계약 "단계를 직접 선택해도 앞 장면을 재생하지 않는다". keep한 값은 시간표가 담은 시작 값에서 시작한다
  test('player_selecting_a_scene_directly_shows_the_same_values_as_playing_up_to_it', async () => {
    for (const path of SOURCES) {
      const source = sourceOf(path);
      // 앞 장면을 끝까지 재생한 뒤 장면을 고른 값 변화
      const played = await withPlayer(source, async (page, result) => {
        const lists = [];
        for (const si of result.timeline.steps.keys()) {
          if (si > 0) await runFrames(page, { limitMs: sceneModel(result, si - 1).display + 4000 });
          await tab(page, si);
          lists.push(statesOf([{ values: await valuesNow(page) }, ...(await runFrames(page, { limitMs: sceneModel(result, si).display }))]));
        }
        return lists;
      });

      for (const si of [2, 1, 0]) {
        await withPlayer(source, async (page, result) => {
          const { timeline } = result;
          await tab(page, si);
          const first = await valuesNow(page);
          const own = statesOf([{ values: first }, ...(await runFrames(page, { limitMs: sceneModel(result, si).display }))]);

          assert.deepEqual(first.map(([, text]) => text), sceneRows(timeline, si).map(([row]) => row.initial), `${path} ${si}번 장면의 시작 값은 시간표의 initial이다`);
          assert.deepEqual(own, played[si], `${path} ${si}번 장면을 바로 고른 값 변화가 앞 장면을 재생한 뒤 고른 값 변화와 같다`);
        });
      }
    }
  });

  // 근거: 이슈 #118 완료 조건 "restart가 값 결과를 바꾸지 않는다", 계약 "반복은 장면의 처음 값에서 시작한다". `mode=loop` 장면은 한 바퀴를 마치면 그 장면의 시작 값(keep한 값 포함)으로 돌아간다
  test('player_loop_restart_starts_the_scene_again_from_its_own_start_values', async () => {
    for (const path of SOURCES) {
      await withPlayer(sourceOf(path).replaceAll('mode=once', 'mode=loop'), async (page, result) => {
        const { timeline } = result;
        const si = timeline.steps.length - 1;
        const rows = sceneRows(timeline, si);
        const length = sceneModel(result, si).display;
        await tab(page, si);
        const frames = await runFrames(page, { limitMs: length * 2.4 });
        // 장면 안 시각 d가 다시 작아진 프레임이 되풀이의 처음이다
        const starts = frames.filter(({ d }, i) => i > 0 && d < frames[i - 1].d);

        assert.ok(starts.length >= 1, `${path}: 한 바퀴를 넘겨 되풀이한다`);
        for (const { values } of starts) assert.deepEqual(values.map(([, text]) => text), rows.map(([row]) => row.initial), `${path}: 되풀이한 장면은 끝난 값이 아니라 시작 값에서 시작한다`);
        assert.ok(frames.every(({ scene }) => scene === si), '반복하는 동안 다른 장면으로 넘어가지 않는다');
      });
    }
  });
});
