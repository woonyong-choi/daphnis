// 원자 예약(`reserve=`)의 결과가 움직이는 SVG와 HTML 재생기에서 같다(docs/design/playback.md 원자 예약).
// SMIL 값을 25ms 간격으로 풀어 시간표의 값 줄과 맞추고, 재생기를 가짜 시계로 돌려 문서 가림, 배속(장면 `speed=`), 반복(`mode=loop`), 장면 직접 선택이 값 결과를 바꾸지 않는지 본다.
// 원본은 이 파일 안에 둔다(예제 파일에 기대지 않는다). 재생기 시험은 Chrome이 없으면 실패한다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';
import { smilStateAt, valueElementsOf } from './smil.js';
import { sameState, sceneModel, timelineStateAt } from './value-display.js';
import { PROBE_MS, runFrames, sceneRows, setHidden, statesOf, tab, valuesNow } from './value-player.js';

// 두 점이 같은 시각에 잠금을 요청해 하나만 통과하고, 다른 쪽은 풀릴 때까지 기다린다
const ATOMIC_LOCK = `daphnis 2
box a "A"
box b "B"
box lock "잠금"
value holder "쥔 쪽" on=lock from=none
a -> lock
b -> lock
scene "A와 B가 같은 시각에 요청한다" mode=once for=7s
  track a -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=A"
  track b -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=B"
  track a -> lock "풀기" at=3s time=1s when="holder='A'" set="holder=none"
`;
// 큐의 마지막 한 칸을 두 소비자가 같은 시각에 가져가려 한다. 하나만 가져가고 다른 쪽은 시간 초과로 포기한다
const ATOMIC_QUEUE = `daphnis 2
box c1 "소비자 1"
box c2 "소비자 2"
queue q "대기열" slots=3 from=1
q -> c1
q -> c2
scene "마지막 한 개를 두 소비자가 가져가려 한다" mode=once for=6s
  track q -> c1 "가져오기" at=0s time=1s wait="q>0" reserve="q-1"
  track q -> c2 "가져오기" at=0s time=1s wait="q>0" reserve="q-1" timeout=2s
`;
// 둘째 장면이 `keep`한 쥔 쪽에서 시작해, 장면을 바로 골라도 앞 장면의 예약 결과가 이어지는지 보는 원본
const TWO_SCENES = `daphnis 2
box a "A"
box b "B"
box c "C"
box lock "잠금"
store q "대기열"
value holder "쥔 쪽" on=lock from=none
a -> lock
b -> lock
c -> lock
c -> q
scene "A와 B가 같은 시각에 요청한다" mode=once for=7s
  track a -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=A"
  track b -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=B"
  track a -> lock "풀기" at=3s time=1s when="holder='A'" set="holder=none"
scene "C는 B가 쥔 잠금을 기다리다 포기한다" mode=once for=5s keep="holder"
  track c -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=C" timeout=2s else=q
`;
const SOURCES = [['atomic-lock', ATOMIC_LOCK], ['atomic-queue', ATOMIC_QUEUE], ['two-scenes', TWO_SCENES]];

// 근거: 이슈 #138 완료 조건 "SVG와 HTML은 같은 시간표를 읽는다", 설계 playback.md 값 변화 "움직이는 SVG는 SMIL 이산 불투명도로 보인다". 장면마다 그 장면만 그린 SVG를 푼다
test('toSvg_reserved_values_match_the_timeline_every_25ms', async () => {
  for (const [name, source] of SOURCES) {
    const result = await buildFigure(source, { baseDir: 'test' });
    for (const si of result.timeline.steps.keys()) {
      const model = sceneModel(result, si);
      const { sliced, display, speed } = model;
      const elements = valueElementsOf(await toSvg(result, { name, scene: si }));
      let probed = 0;

      for (let td = 0; td < display; td += PROBE_MS) {
        // keyTimes가 소수 5자리라 값 구간 경계에서 2ms 안의 시각은 재지 않는다
        if (sliced.values.some((row) => row.periods.some(([from, to]) => Math.abs(td - from / speed) <= 2 || Math.abs(td - to / speed) <= 2))) continue;
        const smil = smilStateAt(elements, sliced.values, td);

        assert.ok(smil.every(({ texts }) => texts.length <= 1), `${name} 장면 ${si}: t=${td}ms 같은 줄에 글자 요소가 둘 이상 보인다 ${JSON.stringify(smil)}`);
        assert.ok(sameState(smil, timelineStateAt(model, td)), `${name} 장면 ${si}: t=${td}ms ${JSON.stringify([smil, timelineStateAt(model, td)])}`);
        probed++;
      }
      assert.ok(probed > display / PROBE_MS / 2, `${name} 장면 ${si}: 잰 시각 ${probed}`);
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

  // cost: time O(1), heap O(1), stack O(1), io 3
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

  const references = new Map();
  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 장면마다 처음부터 한 번 재생한 기준 { full, texts } 상태 목록. 원본마다 한 번만 만든다.
  const referenceOf = (name, source) => {
    if (!references.has(name)) {
      references.set(name, withPlayer(source, async (page, result) => {
        const lists = [];
        for (const si of result.timeline.steps.keys()) {
          await tab(page, si);
          const frames = await runFrames(page, { limitMs: sceneModel(result, si).display });
          lists.push({ frames, full: statesOf(frames), texts: statesOf(frames, false) });
        }
        return lists;
      }));
    }
    return references.get(name);
  };

  // 같은 시각에 바뀌어 길이가 없는 구간(`none`에서 `A`로 바로 바뀌는 처음 값)은 재생기가 보이지 않으므로 길이가 있는 구간만 비교한다
  const orderOf = (texts) => texts.filter((text, i) => text !== undefined && text !== texts[i - 1]);

  // 근거: 이슈 #138 완료 조건 "재생기는 시간표의 예약 결과를 읽는다". 장면이 끝나는 시각에 바뀐 값은 효과 꼬리 동안 보이는 마지막 글이다
  test('player_shows_the_reserved_values_in_the_order_of_the_timeline_periods', async () => {
    for (const [name, source] of SOURCES) {
      const references_ = await referenceOf(name, source);
      const { timeline } = (await buildFigure(source, { baseDir: 'test' }));

      for (const [si, { frames }] of references_.entries()) {
        for (const [row, vi] of sceneRows(timeline, si)) {
          const shown = orderOf(frames.map(({ values }) => values.find(([index]) => index === vi)?.[1]));
          const expected = orderOf([...row.periods.filter(([from, to]) => to > from).map(([, , text]) => text), row.periods.at(-1)?.[2]]);

          assert.deepEqual(shown, expected, `${name} ${row.id}(${si}번 장면)`);
        }
      }
    }
  });

  // 근거: 이슈 #138 완료 조건 "pause·rate·restart·단계 직접 선택이 예약 결과를 바꾸지 않는다". 일시정지는 문서 가림이고 배속은 장면의 speed=다
  test('player_hidden_document_and_scene_speed_do_not_change_the_reserved_values_of_a_scene', async () => {
    for (const [name, source] of SOURCES) {
      const reference = await referenceOf(name, source);

      await withPlayer(source, async (page, result) => {
        const { display } = sceneModel(result, 0);
        const before = await runFrames(page, { limitMs: display / 2 });
        await setHidden(page, true);
        const frozen = await valuesNow(page);
        const during = await runFrames(page, { limitMs: 3000 });
        await setHidden(page, false);
        const after = await runFrames(page, { limitMs: display });

        assert.ok(during.every(({ values }) => JSON.stringify(values) === JSON.stringify(frozen)), `${name}: 가린 동안 값이 그대로다`);
        assert.deepEqual(statesOf([...before, ...during, ...after]).slice(0, reference[0].full.length), reference[0].full, `${name}: 가렸다 다시 보여도 같은 차례다`);
      });
      for (const speed of [2, 0.5]) {
        await withPlayer(source.replaceAll('mode=once', `mode=once speed=${speed}`), async (page, result) => {
          for (const si of result.timeline.steps.keys()) {
            await tab(page, si);
            const frames = await runFrames(page, { limitMs: sceneModel(result, si).display, stepMs: PROBE_MS * Math.min(1, speed) / 2 });

            assert.deepEqual(statesOf(frames, false), reference[si].texts, `${name} 장면 ${si}: ${speed}배속에서 값 글자가 바뀌는 차례가 같다`);
          }
        });
      }
    }
  });

  // 근거: 이슈 #138 완료 조건 "단계 직접 선택이 예약 결과를 바꾸지 않는다", 설계 playback.md 장면 사이 값 유지. 둘째 장면은 앞 장면이 예약한 쥔 쪽(B)에서 시작한다
  test('player_selecting_a_scene_directly_shows_the_same_reserved_values_as_playing_up_to_it', async () => {
    const [name, source] = SOURCES[2];
    const reference = await referenceOf(name, source);

    for (let si = 0; si < reference.length; si++) {
      await withPlayer(source, async (page, result) => {
        await tab(page, si);
        const first = await valuesNow(page);
        const frames = await runFrames(page, { limitMs: sceneModel(result, si).display });
        const own = statesOf([{ values: first }, ...frames]);

        // 시각 0에 바뀐 값(`none`에서 `A`로 바로 바뀌는 처음 값)은 길이가 0인 구간이라 첫 화면에 이미 바뀐 글이 보인다
        assert.deepEqual(first.map(([, text]) => text), timelineStateAt(sceneModel(result, si), 0).map(({ text }) => text), `${si}번 장면을 고른 첫 화면은 시각 0까지 예약한 값이다`);
        assert.deepEqual(own, reference[si].full, `${si}번 장면을 바로 고른 값 변화가 처음부터 재생한 값 변화와 같다`);
      });
    }
    assert.equal((await buildFigure(source, { baseDir: 'test' })).timeline.values.find((row) => row.si === 1).initial, 'B', '둘째 장면은 앞 장면이 예약한 쥔 쪽에서 시작한다');
  });

  // 근거: 이슈 #138 완료 조건 "restart가 예약 결과를 바꾸지 않는다". 반복(`mode=loop`)하는 장면은 두 번째 바퀴에서도 첫 바퀴와 같은 시각에 같은 값이다
  test('player_loop_restart_shows_the_same_reserved_values_at_the_same_lap_times', async () => {
    for (const [name, source] of SOURCES) {
      await withPlayer(source.replaceAll('mode=once', 'mode=loop'), async (page, result) => {
        const { display, sliced } = sceneModel(result, 0);
        const edges = sliced.values.flatMap((row) => row.periods.flatMap(([from, to]) => [from, to]));
        const probes = [200, display * 0.4, display * 0.9].filter((t) => edges.every((edge) => Math.abs(t - edge) > 100));
        const frames = await runFrames(page, { limitMs: display * 2.1 });
        const at = (t) => frames[Math.round(t / PROBE_MS) - 1];

        assert.ok(probes.length >= 2, name);
        // 펄스 세기는 프레임 위상(16.7ms)에 따라 바퀴마다 조금 달라지므로 값 글자만 견준다
        const texts = (frame) => frame.values.map(([vi, text]) => [vi, text]);
        for (const t of probes) assert.deepEqual(texts(at(display + t)), texts(at(t)), `${name}: 두 바퀴째 ${Math.round(t)}ms의 값이 첫 바퀴와 같다`);
      });
    }
  });
});
