// 장면의 mode와 speed가 움직이는 SVG의 재생 방식을 정한다. 정지는 마지막 상태 하나이고 once는 그 상태에서 멈춘다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const MIXED = readFileSync(new URL('./fixtures/v2/mixed-order.dap', import.meta.url), 'utf8');
const doc = (body) => `daphnis 2\n${body}`;
const TWO = doc('box a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b\nscene "하나" mode=loop\n  a -> b time=1s set="n+1"\nscene "둘" mode=once\n  a -> b time=1s set="n+5"\nscene "셋"\n  a -> b time=1s\n');
const durations = (svg) => [...svg.matchAll(/dur="([\d.]+)s"/g)].map((m) => Number(m[1]));

test('loop repeats forever, once plays one time and holds the last state, static has no animation', async () => {
  const result = await buildFigure(TWO);
  const loop = await toSvg(result, { scene: 0 });
  assert.match(loop, /data-mode="loop"/);
  assert.ok(loop.includes('repeatCount="indefinite"'));
  assert.ok(!loop.includes('fill="freeze"'));
  const once = await toSvg(result, { scene: 1 });
  assert.match(once, /data-mode="once"/);
  assert.ok(once.includes('repeatCount="1" fill="freeze"'));
  assert.ok(!/indefinite|infinite/.test(once.replace(/<style>[\s\S]*?<\/style>/, (css) => css.replace(/@font-face\{[^}]*\}/g, ''))), 'no endless animation in a once scene');
  assert.match(once, /animation: a\d+ [\d.]+s 1 forwards linear/);
  const frozen = await toSvg(result, { scene: 2 });
  assert.match(frozen, /data-mode="static"/);
  assert.ok(!/<animate|<set|repeatCount|animation:/.test(frozen.replace(/@font-face\{[^}]*\}/g, '')), 'a static scene draws its final state without any motion');
});

test('a static scene with moves draws the end state: the value that the move set, no packet', async () => {
  const result = await buildFigure(TWO);
  const svg = await toSvg(result, { scene: 2 });
  assert.match(svg, /class="value" opacity="1" data-v="\d+" data-t="0"/);
  assert.ok(!svg.includes('<animateMotion'));
  const forced = await toSvg(result, { scene: 1, isStatic: true });
  assert.match(forced, /data-mode="static"/);
  assert.match(forced, /data-t="5"/);
  assert.ok(!forced.includes('data-t="0"'), 'only the last value text is drawn');
});

test('speed divides the playback length and leaves the timeline alone', async () => {
  const body = (speed) => doc(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=once speed=${speed}\n  a -> b time=4s\n`);
  const slow = await buildFigure(body(1));
  const fast = await buildFigure(body(2));
  assert.deepEqual(slow.timeline.segs.map((s) => [s.t0, s.t1]), fast.timeline.segs.map((s) => [s.t0, s.t1]));
  const [one] = durations(await toSvg(slow));
  const [two] = durations(await toSvg(fast));
  // 표시 길이 = 논리 길이 / speed + 400ms 효과 꼬리(꼬리는 speed로 나누지 않는다)
  assert.ok(Math.abs(one - 4.4) < 1e-9 && Math.abs(two - 2.4) < 1e-9, `${one} ${two}`);
});

test('the scene option picks one scene and refuses one that does not exist', async () => {
  const result = await buildFigure(TWO);
  assert.match(await toSvg(result, { scene: 1 }), /data-scene="1"/);
  assert.match(await toSvg(result, { scene: '셋' }), /data-scene="2"/);
  await assert.rejects(toSvg(result, { scene: 7 }), RangeError);
  await assert.rejects(toSvg(result, { scene: '없음' }), /Scenes: 1 "하나", 2 "둘", 3 "셋"/);
});

test('there are no captions or step labels in the output', async () => {
  const svg = await toSvg(await buildFigure(TWO), { scene: 0 });
  const markup = svg.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.ok(!/class="caption"|steplabel/.test(markup));
});

test('the mixed document draws every panel with ids a shared player can find', async () => {
  const result = await buildFigure(MIXED);
  const svg = await toSvg(result, { scene: 0 });
  assert.match(svg, /<g id="n-0" class="fl-node/);
  assert.match(svg, /data-id="user"/);
  // 움직이는 SVG는 마지막 모습 층(`.fl-still`)을 한 벌 더 싣는다. 보기 수는 움직임 층에서 센다.
  assert.equal([...svg.split('class="fl-still"')[0].matchAll(/data-id="gw"/g)].length, 2, 'a card shown in the graph and the sequence is drawn twice with the same id');
  assert.match(svg, /data-chart="lag"/);
  assert.match(svg, /data-chart="trend"/);
  assert.match(svg, /data-chart="t"/);
  assert.match(svg, /data-part="t\.s2"/);
  assert.match(svg, /data-part="create\.body"|data-part="orders\.id"/);
  assert.match(svg, /<g id="e-\d+" class="fl-edge/);
  assert.equal(result.scene.panels.length, 4);
  assert.deepEqual(result.scene.panels.map((p) => p.strategy), ['graph', 'sequence', 'plot', 'time']);
  const [, sequence] = result.scene.panels;
  assert.ok(sequence.box.y > result.scene.panels[0].box.y, 'panels are stacked top to bottom');
});

test('the once end state equals the static state for a bound chart mark', async () => {
  const result = await buildFigure(doc('box a "A"\nbox b "B"\nvalue n "n" on=b from=0\nchart c "c" bar {\n  series s "s"\n  row "r" s=n\n  row "q" s=10\n}\na -> b\nscene "s" mode=once\n  a -> b set="n=7"\n'));
  const once = await toSvg(result, { scene: 0 });
  const frozen = await toSvg(result, { scene: 0, isStatic: true });
  const lastWidth = [...once.matchAll(/attributeName="width"[^>]*values="([^"]+)"/g)].map((m) => m[1].split(';').at(-1));
  assert.ok(lastWidth.length);
  assert.ok(frozen.includes(`width="${lastWidth[0]}"`));
});

test('a document with no scene draws its cards', async () => {
  const result = await buildFigure(doc('table orders "orders" {\n  id bigint pk\n}\nbox a "A"\n'));
  assert.deepEqual(result.timeline.steps, []);
  assert.match(await toSvg(result), /data-mode="static"/);
});

test('the display length keeps a full pulse after the last change even when the scene ends right away', async () => {
  const result = await buildFigure(doc('box a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b\nscene "s" mode=loop speed=10\n  a -> b time=1s set="n+1"\n'));
  const [duration] = durations(await toSvg(result));
  const [seg] = result.timeline.segs;
  const lastPulse = result.timeline.pulses.at(-1).at;
  assert.ok(duration * 1000 >= (lastPulse - seg.t0) / 10 + 400, 'a pulse is never cut at the loop boundary');
  assert.ok(result.timeline.total >= lastPulse, 'the logical times did not move');
});
