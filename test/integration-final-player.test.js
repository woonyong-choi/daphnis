// 통합 마무리의 브라우저 시험: 컴파일러가 만든 실제 재생 문서를 실제 Chrome으로 잰다.
// 노랑 표식의 갱신 효과가 노랑 계열 안에 있는지, 모든 범주 계열의 점 색, 일반 박자 도착 후광이 모든 그림에 가는지, 상태 알약이 모든 그림에 켜지는지,
// 같은 순간에 나가고 들어서는 고정 알약이 끊기지 않는지, 정본이 아닌 데이터를 재생기가 거부하는지를 본다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { categoryPaint } from '../src/chart-palette.js';
import { toSvg } from '../src/svg.js';
import { TONES, TONE_FILLS } from '../src/tone.js';
import { FRAME_MS, launchChrome, openWithErrors, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';

const STEP_MS = 16;
const LAG_MS = 2 * FRAME_MS;
// 후광 곡선(80ms 올라감, 80ms 유지, 240ms 내려옴)을 시험이 따로 적는다.
const envelope = (x) => (x < 0 ? 0 : x < 80 ? x / 80 : x < 160 ? 1 : x < 400 ? 1 - (x - 160) / 240 : 0);
const HEAD = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue q "q" on=db from=0\n';

// 노랑(둘째 범주) 막대가 q를 읽는 그림. 점이 db에 닿는 500ms에 q가 바뀌고 막대와 값 글자가 갱신 효과를 받는다.
const YELLOW_BAR = `${HEAD}chart c "노랑" bar {\n  series s0 "하나"\n  series s1 "둘"\n  row "R" s0=2 s1=q\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\nscene "s" mode=once\n  a -> db time=500ms set="q+7"\n`;

describe('integration: compiled documents in Chrome', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  test('a yellow bar keeps its yellow family fill and outline while its update effect plays, and the effect never uses the state blue', async () => {
    const yellow = categoryPaint(1);
    const { html } = await playerHtml(YELLOW_BAR);
    await withPage(browser, html, {}, async (page) => {
      await page.clock.runFor(500 + 130);
      const state = await readState(page);
      const x = state.d - 500;
      assert.ok(x > 80 && x < 160, `${state.d}`);
      const read = await page.evaluate(() => {
        const resolve = (value) => {
          const probe = document.createElement('i');
          probe.style.color = value;
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const root = document.querySelector('[data-chart="c"]');
        const bar = root.querySelector('rect[data-mark="s1:0"]');
        const overlay = root.querySelector('rect[data-pulse-of="s1:0"]');
        const halo = root.querySelector('rect[data-pulse-of="s1:0.b"]');
        const css = getComputedStyle(overlay);
        return {
          level: Number(overlay.getAttribute('opacity')),
          backLevel: Number(halo.getAttribute('opacity')),
          barFill: getComputedStyle(bar).fill,
          barStroke: getComputedStyle(bar).stroke,
          overlayFill: css.fill,
          overlayStroke: css.stroke,
          backFill: getComputedStyle(halo).fill,
          expected: { fill: resolve('var(--color-data-category-1)'), effect: resolve(bar.dataset.effect), border: resolve(bar.getAttribute('stroke')), active: resolve('var(--color-state-active)') },
          sameWidth: overlay.getAttribute('width') === bar.getAttribute('width'),
        };
      });
      assert.equal(read.level, 1, '유지 구간의 세기');
      assert.equal(read.backLevel, 1, '값 글자 바탕 면도 같은 세기');
      assert.equal(read.barStroke, read.expected.border, '표식 자신의 테두리는 노랑 계열 그대로');
      assert.equal(read.overlayStroke, read.expected.effect, '겹침의 고리는 노랑 계열 effect 단계');
      assert.equal(read.overlayFill, read.expected.effect, '겹침의 면은 같은 effect 색(옅게)');
      assert.equal(read.backFill, read.expected.effect);
      for (const color of [read.overlayFill, read.overlayStroke, read.backFill]) assert.notEqual(color, read.expected.active, '상태 파랑이 아니다');
      assert.ok(read.sameWidth, '겹침은 바뀐 막대 모양을 따른다');
      assert.equal(yellow.border, categoryPaint(1).border);
    });
  });

  test('an unchanged mark never gets an effect and the effect follows the envelope in display time', async () => {
    const { html } = await playerHtml(YELLOW_BAR);
    await withPage(browser, html, {}, async (page) => {
      const levels = [];
      for (let elapsed = 0; elapsed < 1000; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        const { d } = await readState(page);
        const level = await page.evaluate(() => ({
          changed: Number(document.querySelector('[data-pulse-of="s1:0"]').getAttribute('opacity')),
          other: [...document.querySelectorAll('[data-pulse-of="s0:0"]')].map((el) => Number(el.getAttribute('opacity'))),
        }));
        levels.push({ d, ...level });
      }
      for (const { d, changed, other } of levels) {
        if (d > 500 + LAG_MS && d < 900) assert.ok(Math.abs(changed - envelope(d - 500)) < 0.2, `${d}ms ${changed}`);
        assert.ok(other.every((v) => v === 0), '값이 그대로인 계열 s0에는 효과가 없다');
      }
      assert.ok(levels.some(({ changed }) => changed > 0.9));
    });
  });

  test('every palette family has its own packet color in the player', async () => {
    const tracks = TONES.map((tone) => `  track a -> b time=1s tone=${tone}`).join('\n');
    const source = ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b', 'scene "색" mode=once for=3s', tracks, ''].join('\n');
    const { html, result } = await playerHtml(source);
    assert.deepEqual(result.timeline.segs[0].hops.map((hop) => hop.tone), TONES);
    await withPage(browser, html, {}, async (page) => {
      await page.clock.runFor(500);
      const read = await page.evaluate((names) => {
        const resolve = (value) => {
          const probe = document.createElement('i');
          probe.style.color = value;
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const packets = [...document.querySelectorAll('.fl-packet')];
        return { count: packets.length, fills: packets.map((g) => getComputedStyle(g.querySelector('circle:last-child')).fill), expected: names.map(resolve) };
      }, TONES.map((tone) => TONE_FILLS[tone]));
      assert.equal(read.count, TONES.length);
      assert.deepEqual(read.fills, read.expected);
      assert.equal(new Set(read.fills).size, TONES.length, '여덟 이름은 서로 다른 색이다');
    });
  });

  test('an ordinary beat arrival lights the border overlay on every drawn instance of the card, once, with no face fill', async () => {
    const source = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nview v1 graph right "하나" {\n  a\n  b\n}\nview v2 graph down "둘" {\n  a\n  b\n}\nscene "s" mode=once\n  a -> b time=500ms\n';
    const { html, result } = await playerHtml(source);
    const [seg] = result.timeline.segs;
    assert.deepEqual(seg.pulses.map((p) => p.id), ['b'], '일반 박자의 도착도 구간의 pulses에 하나');
    const instances = result.scene.items.map((it, i) => (it.id === 'b' ? i : -1)).filter((i) => i >= 0);
    assert.equal(instances.length, 2);
    await withPage(browser, html, {}, async (page) => {
      await page.clock.runFor(500 + 100);
      const state = await readState(page);
      const read = await page.evaluate((ids) => ids.map((i) => ({ overlays: [...document.querySelectorAll(`#n-${i} .fl-pulse`)].map((el) => Number(el.getAttribute('opacity'))), on: document.querySelector(`#n-${i}`).classList.contains('on'), face: getComputedStyle(document.querySelector(`#n-${i} > .fl-stroke`)).fill })), instances);
      for (const instance of read) {
        assert.ok(instance.overlays.length >= 1 && instance.overlays.every((v) => Math.abs(v - envelope(state.d - 500)) < 1e-6), JSON.stringify(instance));
        assert.equal(instance.on, false, '도착은 면을 켜지 않는다');
      }
      assert.deepEqual(read[0].face, read[1].face);
      const before = await page.evaluate((ids) => ids.map((i) => getComputedStyle(document.querySelector(`#n-${i} > .fl-stroke`)).fill), instances);
      await page.clock.runFor(1200);
      const after = await page.evaluate((ids) => ids.map((i) => getComputedStyle(document.querySelector(`#n-${i} > .fl-stroke`)).fill), instances);
      assert.deepEqual(after, before, '도착 뒤에도 면 칠이 남지 않는다');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.fl-pulse')].filter((el) => Number(el.getAttribute('opacity')) > 0).length), 0, '후광이 끝나 하나도 남지 않는다');
    });
  });

  test('a status pill is shown on every drawn instance of the card at the same time', async () => {
    const source = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nview v1 graph right "하나" {\n  a\n  b\n}\nview v2 graph down "둘" {\n  a\n  b\n}\nscene "정상" mode=static status="b=ok"\n  a -> b time=300ms\nscene "장애" mode=static status="a=fail"\n  a -> b time=300ms\n';
    const { html } = await playerHtml(source);
    await withPage(browser, html, {}, async (page) => {
      const shown = () => page.evaluate(() => [...document.querySelectorAll('.fl-status')].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.st));
      assert.deepEqual(await shown(), ['b-ok', 'b-ok']);
      await page.getByRole('tab', { name: '장애', exact: true }).click();
      assert.deepEqual(await shown(), ['a-fail', 'a-fail']);
    });
  });

  test('a fixed pill stays active across the tick where one packet leaves and the next enters the same edge', async () => {
    const source = ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b "요청"', 'scene "연속" mode=once for=2s', '  track a -> b every=500ms time=500ms', ''].join('\n');
    const { html } = await playerHtml(source);
    await withPage(browser, html, {}, async (page) => {
      const frames = [];
      for (let elapsed = 0; elapsed < 2300; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        frames.push({ d: (await readState(page)).d, ...(await page.evaluate(() => ({ tint: Number(document.querySelector('#l-0').style.getPropertyValue('--pill-tint')), current: document.querySelector('#e-0').classList.contains('is-current'), opacity: getComputedStyle(document.querySelector('#l-0')).opacity }))) });
      }
      for (const f of frames.filter((x) => x.d > 40 && x.d < 1960)) assert.deepEqual([f.current, f.tint, f.opacity], [true, 1, '1'], `${f.d}ms: 두 이동이 이어지는 순간에도 활성이 끊기지 않는다`);
    });
  });
});

describe('integration: the animated svg plays the same effects', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // 움직이는 SVG를 쪽 안에 넣어 SMIL 시계를 멈추고 t초로 보낸다. 스크립트 없는 SVG가 그리는 모습을 그대로 읽는다.
  const atSvg = async (source, seconds, read, args = []) => {
    const result = await buildFigure(source);
    const svg = await toSvg(result, { scene: 0 });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent(`<!doctype html><html><body>${svg}</body></html>`);
    await page.evaluate((t) => {
      const root = document.querySelector('svg.fl');
      root.pauseAnimations();
      root.setCurrentTime(t);
    }, seconds);
    const out = await page.evaluate(read, args);
    await page.close();
    return out;
  };
  const resolveColors = `const resolve = (value) => { const probe = document.createElement('i'); probe.style.color = value; document.body.appendChild(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; };`;

  test('the yellow bar effect in the svg uses the yellow family effect step at the same level as the player', async () => {
    const read = new Function(`${resolveColors} const root = document.querySelector('[data-chart="c"]'); const bar = root.querySelector('rect[data-mark="s1:0"]'); const overlay = root.querySelector('rect[data-pulse-of="s1:0"]'); const css = getComputedStyle(overlay); return { level: Number(css.opacity), fill: css.fill, stroke: css.stroke, barStroke: getComputedStyle(bar).stroke, tint: resolve(bar.getAttribute('data-effect')), border: resolve(bar.getAttribute('stroke')), active: resolve('var(--color-state-active)') };`);
    const state = await atSvg(YELLOW_BAR, 0.5 + 0.1, read);
    assert.ok(state.level > 0.95, `유지 구간의 세기 ${state.level}`);
    assert.equal(state.fill, state.tint);
    assert.equal(state.stroke, state.tint);
    assert.equal(state.barStroke, state.border, '표식 자신의 테두리는 그대로');
    assert.notEqual(state.fill, state.active);
    assert.notEqual(state.stroke, state.active);
  });

  test('an ordinary arrival lights the border overlay on every instance of the card in the svg', async () => {
    const source = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nview v1 graph right "하나" {\n  a\n  b\n}\nview v2 graph down "둘" {\n  a\n  b\n}\nscene "s" mode=once\n  a -> b time=500ms\n';
    // 움직이는 SVG는 움직임 층(.fl-motion)에 마지막 모습 층(.fl-still)을 한 벌 더 싣는다. 도착 후광은 움직임 층의 도형만 센다.
    const read = new Function(`return [...document.querySelectorAll('.fl-motion [data-id="b"]')].map((node) => [...node.querySelectorAll('.fl-pulse')].map((el) => Number(getComputedStyle(el).opacity)));`);
    const peak = await atSvg(source, 0.5 + 0.1, read);
    assert.equal(peak.length, 2, '두 그림');
    for (const overlays of peak) assert.ok(overlays.length >= 1 && overlays.every((v) => v > 0.95), JSON.stringify(peak));
    const before = await atSvg(source, 0.3, read);
    for (const overlays of before) assert.ok(overlays.every((v) => v === 0));
    const lost = 'daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\nscene "손실" mode=once for=4s\n  track a -> b -> c lost=20% time=1s\n';
    const none = await atSvg(lost, 0.9, new Function(`return [...document.querySelectorAll('.fl-pulse')].map((el) => Number(getComputedStyle(el).opacity));`));
    assert.ok(none.every((v) => v === 0), '사라진 점은 어느 도형도 밝히지 않는다');
  });

  test('a diamond and a triangle mark are repainted by a path overlay that follows the changed path', async () => {
    const series = Array.from({ length: 22 }, (_, i) => `  series s${i} "계열 ${i}"`).join('\n');
    const first = Array.from({ length: 22 }, (_, i) => `s${i}=${i === 14 ? 'q' : i === 19 ? 'r' : i + 1}`).join(' ');
    const second = Array.from({ length: 22 }, (_, i) => `s${i}=${i + 2}`).join(' ');
    const source = `${HEAD}value r "r" on=db from=5\nchart c "모양" line {\n${series}\n  point x=1 ${first}\n  point x=2 ${second}\n}\nview g graph right "g" {\n  a\n  db\n  c\n}\na -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+9"\n  a -> db "x" time=500ms set="r+9"\n`;
    const read = new Function(`return ['s14:0', 's19:0'].map((id) => { const base = document.querySelector('path[data-mark="' + id + '"]'); const overlay = document.querySelector('path[data-pulse-of="' + id + '"]'); return { same: base.getAttribute('d') === overlay.getAttribute('d'), d: overlay.getAttribute('d').slice(0, 14), level: Number(getComputedStyle(overlay).opacity) }; });`);
    const [diamond, triangle] = await atSvg(source, 0.5 + 0.1, read);
    assert.deepEqual([diamond.same, triangle.same], [true, true], '겹침 경로가 표식의 지금 경로와 같다');
    assert.ok(diamond.level > 0.95, '마름모는 q가 바뀐 때 켜진다');
    assert.equal(triangle.level, 0, '삼각형은 r가 바뀌기 전이라 꺼져 있다');
  });
});

describe('integration: malformed canonical data is refused by the player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  const SOURCE = 'daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\nscene "s" mode=once\n  track a -> b -> c time=1s\n';
  const open = async (edit) => {
    const { html } = await playerHtml(SOURCE);
    return openWithErrors(browser, html.replace(/figurePlay\(document\.querySelector\('\.fl-figure'\), (\{[\s\S]*\})\);\n<\/script>/, (_, json) => `figurePlay(document.querySelector('.fl-figure'), (${edit.toString()})(${json}));\n</script>`));
  };

  test('a track hop without leg edges, a gap list of the wrong length, an unknown tone and an unknown mark key are refused', async () => {
    const legs = await open((data) => {
      delete data.segs[0].hops[0].legEdges;
      return data;
    });
    assert.ok(legs.some((message) => /정본이 아니다/.test(message)), legs.join('|'));
    const gaps = await open((data) => {
      data.segs[0].hops[0].gaps = [];
      return data;
    });
    assert.ok(gaps.some((message) => /정본이 아니다/.test(message)), gaps.join('|'));
    const tone = await open((data) => {
      data.segs[0].hops[0].tone = 'brand';
      return data;
    });
    assert.ok(tone.some((message) => /색 이름이 정본이 아니다|Cannot read/.test(message)), tone.join('|'));
    const marks = await open((data) => {
      data.marks['move:undefined'] = [[0, 100]];
      return data;
    });
    assert.ok(marks.some((message) => /marks의 키가 정본이 아니다/.test(message)), marks.join('|'));
  });
});
