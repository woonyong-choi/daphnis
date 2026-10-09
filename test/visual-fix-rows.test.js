// 시각 수정: 카드 글 줄의 갱신 효과. `show`와 `clear`는 장면 구성이고, 보이는 글이 실제로 바뀐 줄만 작은 배경 피드백을 받는다. 같은 장면, 같은 시각의 지웠다 다시 씀(길이 0 박자가 이어져도)은 순변화가 없어 효과가 없다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';

const BASE = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\n';
const rowsOf = async (tail) => (await buildFigure(BASE + tail)).timeline.rowPulses.map(({ key, at, si }) => [key, at, si]);

describe('card text row pulses: compile', () => {
  test('a row whose visible text changed pulses at the card time and only that row', async () => {
    const pulses = await rowsOf('scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  show b "둘째"\n');
    assert.deepEqual(pulses, [['row:b:0', 0, 0], ['row:b:1', 500, 0]], '새 줄만이고 이미 있던 첫째 줄은 다시 켜지지 않는다');
  });

  test('clear then show of the same text in one beat is a net no-op', async () => {
    const pulses = await rowsOf('scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  clear b\n  show b "첫째"\n');
    assert.deepEqual(pulses, [['row:b:0', 0, 0]], '500의 지웠다 다시 쓴 줄은 효과가 없고 처음 보이는 줄만 있다');
  });

  test('clear then show of the same text in adjacent zero-length beats at the same time is a net no-op', async () => {
    const result = await buildFigure(BASE + 'scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  light a\n  clear b\n  light b\n  show b "첫째"\n');
    const segs = result.timeline.segs;
    assert.equal(segs.length, 4);
    assert.deepEqual([segs[2].t0, segs[2].t1, segs[3].t0, segs[3].t1], [500, 500, 500, 500], '이어진 길이 0 박자 둘이 같은 시각이다');
    assert.deepEqual(result.timeline.rowPulses.map(({ key, at }) => [key, at]), [['row:b:0', 0]], '500에는 순변화가 없다');
  });

  test('a changed text after clear pulses and a clear alone gives nothing', async () => {
    assert.deepEqual(await rowsOf('scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  clear b\n  show b "다른"\n'), [['row:b:0', 0, 0], ['row:b:0', 500, 0]]);
    assert.deepEqual(await rowsOf('scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  clear b\n'), [['row:b:0', 0, 0]], '지운 줄은 효과가 없다');
  });

  test('the tail of a row pulse extends the display length by the common 400ms', async () => {
    const { timeline } = await buildFigure(BASE + 'scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  show b "둘째"\n');
    assert.deepEqual(timeline.presentation, [900]);
  });

  test('value rows are not text rows and the value pulse owns them', async () => {
    const { timeline } = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b\nscene "s" mode=once\n  a -> b time=500ms set="n+1"\n');
    assert.deepEqual(timeline.rowPulses, []);
    assert.deepEqual(timeline.pulses.map((p) => p.key), ['value:0']);
  });

  test('the animated svg animates the changed row background in every drawn instance of the card', async () => {
    const result = await buildFigure(`${BASE}view v1 graph right "하나" {\n  a\n  b\n}\nview v2 graph down "둘" {\n  a\n  b\n}\nscene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  show b "둘째"\n`);
    const svg = await toSvg(result, { scene: 0 });
    const flashes = [...svg.matchAll(/<path d="[^"]*" class="fl-flash" opacity="0" data-rf="b:1">([\s\S]*?)<\/path>/g)];
    const layers = result.scene.items.find((it) => it.id === 'b').card.layouts.filter((layout) => layout.rows.length > 1).length;
    assert.equal(flashes.length, 2 * layers, '두 그림 곱하기 그 줄이 있는 내용 층');
    assert.equal(layers, 1);
    assert.ok(flashes.every((m) => m[1].includes('<animate')), '한 번 장면은 SMIL 후광을 건다');
    assert.doesNotMatch(svg, /data-rf="b:5"/);
  });
});

describe('card text row pulses: player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  test('only the new row background lights, the card never flashes as a whole, and it ends', async () => {
    const { html } = await playerHtml(BASE + 'scene "s" mode=once\n  show b "첫째"\n  a -> b time=500ms\n  show b "둘째"\n');
    await withPage(browser, html, {}, async (page) => {
      const read = () =>
        page.evaluate(() => ({
          rows: Object.fromEntries([...document.querySelectorAll('[data-rf]')].map((el) => [el.dataset.rf, Number(el.getAttribute('opacity'))])),
          card: [...document.querySelectorAll('.fl-node[data-id="b"] .fl-pulse')].map((el) => Number(el.getAttribute('opacity'))),
        }));
      await page.clock.runFor(500 + 120);
      const peak = await read();
      assert.ok(peak.rows['b:1'] > 0.9, JSON.stringify(peak));
      assert.equal(peak.rows['b:0'], 0, '이미 있던 줄은 켜지지 않는다');
      await page.clock.runFor(900);
      const done = await readState(page);
      assert.equal(done.ended, true);
      assert.deepEqual(Object.values((await read()).rows), [0, 0], '끝나면 모두 꺼진다');
    });
  });
});
