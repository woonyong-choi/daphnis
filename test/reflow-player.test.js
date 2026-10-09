// 근거: 재배치한 SVG와 HTML의 점이 원본 사건 시각에 새 도형 경계에 닿고 값도 같은 시각에 바뀐다(docs/design/layout.md 재배치).
// HTML은 실제 재생기를 가짜 시계로 흘려 점의 자리를 새 경로의 점과 견준다. Chrome이 없으면 시험이 실패한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure, reflowFigure } from '../src/build.js';
import { arrivalOffsetMs, positionAt } from '../src/easing.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { CAPTURE, launchChrome, readState, withPage } from './chrome.js';
import { packetsOf, pathFractionAt } from './smil.js';
import { sceneModel } from './value-display.js';
import { valuesNow } from './value-player.js';

const SOURCE = 'daphnis 2\nbox a "출발"\nbox b "처리"\nbox c "저장"\nvalue nb "처리 수" on=b\nvalue nc "저장 수" on=c\na -> b\nb -> c\nscene "전달" mode=once for=8s\n  track a -> b -> c time=4s legs="1s, 3s" set="nb+1@b, nc+1@c"\n';
// 점이 지금 선 위에 있는 시각 사이를 이 간격(ms)으로 재고, 위치 오차(px)는 이만큼까지 허용한다
const SAMPLE_MS = 100;
const POSITION_TOLERANCE = 0.5;
// 도착 시각의 앞뒤로 값 글자를 보는 간격(ms). 프레임 한 칸(16.7ms)보다 넉넉하다.
const VALUE_MARGIN_MS = 40;

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 도형 경계 수
// basis: estimate
// 원본 시간표의 경계 시각과 새 배치의 같은 경계 길이 비율의 쌍 { time, fraction }
function boundariesOf(before, after) {
  const old = before.timeline.segs[0].hops[0];
  const changed = after.timeline.segs[0].hops[0];
  const fractions = [0, ...old.gaps.flat(), 1];
  const next = [0, ...changed.gaps.flat(), 1];
  return fractions.map((fraction, i) => ({ time: arrivalOffsetMs(fraction, old.ms, old.pace), fraction: next[i] }));
}

test('reflow_svg_reaches_new_boundaries_at_the_original_times', async () => {
  const original = await buildFigure(SOURCE);
  const narrow = await reflowFigure(original, { layoutWidth: 320 });
  const { display } = sceneModel(narrow, 0);
  const [packet] = packetsOf(await toSvg(narrow, { scene: 0 }));
  assert.notDeepEqual(original.timeline.tracks[0].gaps, narrow.timeline.tracks[0].gaps);
  // keyTimes는 장면의 표시 길이(밀리초로 반올림한 SMIL 한 바퀴)의 비율이다
  for (const { time, fraction } of boundariesOf(original, narrow)) assert.ok(Math.abs(pathFractionAt(packet.motion, time / Math.round(display)) - fraction) < 0.003, `${time}ms`);
});

test('reflow_html_keeps_live_value_events_and_packet_boundary_positions', async () => {
  const original = await buildFigure(SOURCE);
  const narrow = await reflowFigure(original, { layoutWidth: 320 });
  // 재생기 객체를 window.probe로 꺼내 안쪽 상태(시계, 점 층, 경로)를 읽는다
  const html = (await toHtml(narrow, '모바일 재배치')).replace("figurePlay(document.querySelector('.fl-figure'),", `${CAPTURE}figurePlay(document.querySelector('.fl-figure'),`);
  const hop = narrow.timeline.segs[0].hops[0];
  const arrival = boundariesOf(original, narrow)[1].time;
  const browser = await launchChrome();
  try {
    await withPage(browser, html, { viewport: { width: 390, height: 844 } }, async (page) => {
      // 값은 점이 둘째 도형에 닿는 원본 시각에 바뀐다
      await page.clock.runFor(Math.floor(arrival) - VALUE_MARGIN_MS);
      assert.deepEqual((await valuesNow(page)).filter(([vi]) => vi === 0).map(([, text]) => text), ['0'], `도착 ${VALUE_MARGIN_MS}ms 전`);
      await page.clock.runFor(2 * VALUE_MARGIN_MS);
      assert.deepEqual((await valuesNow(page)).filter(([vi]) => vi === 0).map(([, text]) => text), ['1'], `도착 ${VALUE_MARGIN_MS}ms 뒤`);

      // 점은 새 경로 위에서 원본 시간표의 진행 비율 자리에 있다(도형 안을 지나는 이음에서는 보이지 않는다)
      let checked = 0;
      for (let t = 0; t < hop.ms; t += SAMPLE_MS) {
        await page.clock.runFor(SAMPLE_MS);
        const { d } = await readState(page);
        if (d >= hop.ms) break;
        const fraction = hop.pace ? positionAt(Math.min(1, Math.max(0, d / hop.ms)), hop.pace) : d / hop.ms;
        const error = await page.evaluate((expected) => {
          const { stage } = window.probe;
          const dot = stage.packetLayers.flatMap((layer) => [...layer.children]).findLast((el) => el.style.opacity !== '0');
          if (!dot) return undefined;
          const path = stage.trackPaths[0];
          const point = path.getPointAtLength(path.getTotalLength() * expected);
          const { e, f } = dot.transform.baseVal.consolidate().matrix;
          return Math.hypot(e - point.x, f - point.y);
        }, fraction);
        if (error === undefined) continue;
        assert.ok(error < POSITION_TOLERANCE, `${Math.round(d)}ms: 점이 경로 위 ${fraction.toFixed(3)} 자리에서 ${error.toFixed(2)}px 벗어난다`);
        checked++;
      }
      assert.ok(checked >= 5, `점 자리를 잰 시각 ${checked}개`);
    });
  } finally {
    await browser.close();
  }
});
