// 마지막 런타임 경계 사례 가운데 실제 Chrome이 필요한 것: 접근성 트리가 보이는 현재 값만 읽는지, 값에 묶인 도넛의 설명이 현재 값인지, 움직이는 SVG의 움직임 줄이기가 시간이 흘러도 마지막 모습인지.
// Chrome이 없으면 건너뛰지 않고 실패한다. WebKit과 Firefox는 확인하지 않았다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, playerHtml, withPage } from './player-compiled.js';

const STEP_MS = 100;
const read = (name) => readFileSync(new URL(`../examples/${name}.dap`, import.meta.url), 'utf8');

// 접근성 트리에 오르는 요소. 보임(visibility)이 hidden이거나 display가 none이면 트리에서 빠진다.
async function exposure(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
  const exposed = [];
  for (const nodeId of nodeIds) {
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
    exposed.push(nodes[0]?.ignored === false);
  }
  await cdp.detach();
  return exposed;
}

// 같은 선택자 글이 눈에 보이는지: 글이 든 변형(값 글자, 상태 알약, 카드 내용 층)의 불투명도가 1이고 보임이 visible이다.
// HTML 재생기는 변형의 속성에 정한 값을 쓴다(CSS 전환이 도는 동안의 계산값이 아니라 재생기가 정한 상태를 읽는다).
const shownBy = (page, selector) =>
  page.evaluate((query) => [...document.querySelectorAll(query)].map((el) => {
    const variant = el.closest('[data-v], .fl-status, .fl-layer');
    return variant.getAttribute('opacity') === '1' && variant.getAttribute('visibility') === 'visible';
  }), selector);

// 접근성 트리에서 읽히는 글을 담는 변형의 글 요소
const VARIANT_TEXTS = ['text[data-v]', '.fl-status text', '.fl-layer text'];

describe('accessibility tree and bound descriptions in a real chrome', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  // 근거: 불투명도 0인 요소는 화면에서만 사라지고 접근성 트리에는 남는다. 값 글자, 큐 찬 칸, 상태 알약, 카드 내용 층은 불투명도와 함께 보임을 써서, 트리가 읽는 것은 지금 보이는 변형뿐이다.
  test('the html player exposes only the variants it shows, in every scene, in play and at the end', async () => {
    for (const name of ['queue', 'flow']) {
      const { html, result } = await playerHtml(read(name), { baseDir: 'examples' });
      await withPage(browser, html, {}, async (page) => {
        const tabs = await page.locator('[role="tab"]').count();
        assert.equal(tabs, result.timeline.steps.length);
        for (let scene = 0; scene < tabs; scene++) {
          await page.locator('[role="tab"]').nth(scene).click();
          for (const wait of [600, 2500, 12_000]) {
            await page.clock.runFor(wait);
            for (const selector of VARIANT_TEXTS) {
              const [exposed, shown] = [await exposure(page, selector), await shownBy(page, selector)];
              assert.deepEqual(exposed, shown, `${name} 장면 ${scene} +${wait}ms ${selector}: 트리에 오르는 것이 보이는 것과 다르다`);
            }
          }
        }
      });
    }
  });

  // 근거: 사용자가 실제 Chrome에서 확인한 오류. 값에 묶인 도넛의 보이는 글과 aria-label은 현재 값(13 · …)으로 바뀌는데 조각의 title 자식은 처음 값(12 · …)에 굳어 있었다.
  test('a bound donut slice shows the current value in its label and has no stale title child once the scene ended', async () => {
    const source = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue q "q" on=db from=12\nvalue r "r" on=db from=0\nchart c "도넛" donut {\n  row "A" value=q\n  row "B" value=7\n  row "C" value=20\n  row "D" value=r\n}\nview g graph right "g" {\n a\n db\n c\n}\nview p plot "p" {\n c\n}\na -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+1"\n  a -> db "x" time=500ms set="r+3"\n';
    const { html } = await playerHtml(source);
    await withPage(browser, html, {}, async (page) => {
      const labels = () => page.evaluate(() => [...document.querySelectorAll('.fl-plot .chart-part')].map((el) => ({ label: el.getAttribute('aria-label'), titles: el.querySelectorAll('title').length })));
      assert.deepEqual((await labels()).map((part) => part.label), ['1. A: 12 · 30.8%', '2. B: 7 · 17.9%', '3. C: 20 · 51.3%', '4. D: 0 · 0.0%'], '처음 값');
      await page.clock.runFor(6000);
      const final = await labels();
      assert.deepEqual(final.map((part) => part.label), ['1. A: 13 · 30.2%', '2. B: 7 · 16.3%', '3. C: 20 · 46.5%', '4. D: 3 · 7.0%']);
      assert.deepEqual(final.map((part) => part.titles), [0, 0, 0, 0], '굳은 title 자식이 없다');
      const visible = await page.evaluate(() => [...document.querySelectorAll('.fl-plot .chart-value')].map((el) => el.textContent));
      assert.ok(visible.includes('13 · 30.2%') && visible.includes('3 · 7.0%'), `보이는 글: ${visible}`);
    });
  });

  // 근거: 움직이는 SVG는 aria-label을 SMIL로 바꿀 수 없다. 굳은 처음 값 설명을 남기지 않고, 보이는 글 변형 하나만 트리에 오른다.
  test('the animated svg exposes exactly one chart text variant per value at any moment and no stale part label', async () => {
    const source = 'daphnis 2\nbox a "A"\nstore db "DB"\nvalue q "q" on=db from=12\nvalue r "r" on=db from=0\nchart c "도넛" donut {\n  row "A" value=q\n  row "B" value=7\n  row "C" value=20\n  row "D" value=r\n}\nview p plot "p" {\n c\n}\nview g graph right "g" {\n a\n db\n c\n}\na -> db\nscene "s" mode=once\n  a -> db "w" time=500ms set="q+1"\n  a -> db "x" time=500ms set="r+3"\n';
    const svg = await toSvg(await buildFigure(source), { scene: 0 });
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
    await page.evaluate(() => document.querySelector('svg').pauseAnimations());
    // 변형은 글마다 묶음 g(불투명도와 보임)의 안쪽에 하나씩이다. 첫 조각의 값 글은 프레임마다 12 · 30.8%, 13 · 28.3%, 13 · 30.2%로 세 글이다.
    const texts = '.fl-motion .fl-plot g[opacity][visibility] > text[data-mark-text="*:0.d"]';
    assert.equal(await page.locator(texts).count(), 3);
    const wrapperShown = () => page.evaluate((query) => [...document.querySelectorAll(query)].map((el) => getComputedStyle(el.parentElement).visibility === 'visible' && getComputedStyle(el.parentElement).opacity === '1'), texts);
    for (const at of [0.1, 0.3, 0.7, 1.4, 5]) {
      await page.evaluate((time) => document.querySelector('svg').setCurrentTime(time), at);
      const exposed = await exposure(page, texts);
      assert.equal(exposed.filter(Boolean).length, 1, `${at}s: 트리에 오르는 변형은 하나`);
      assert.deepEqual(exposed, await wrapperShown(), `${at}s: 트리가 보이는 변형과 같다`);
    }
    assert.equal(await page.evaluate((query) => document.querySelectorAll(query).length, '.fl-motion .chart-part[aria-label], .fl-motion .chart-part title'), 0, '움직임 층의 조각은 굳은 설명이 없다');
    await page.close();
  });

  // 근거: 움직이는 SVG도 같다. SMIL이 불투명도와 보임을 같은 시각에 바꾸고(카드 내용 층은 CSS keyframes), 보이는 변형만 트리에 오른다. 시계는 일시 정지하고 시각을 직접 둔다.
  test('the animated svg exposes only the variants it shows in the middle and at the end of every moving scene', async () => {
    for (const name of ['queue', 'flow']) {
      const result = await buildFigure(read(name), { baseDir: 'examples' });
      for (const [si, step] of result.timeline.steps.entries()) {
        if (step.mode === 'static' || !(result.timeline.presentation[si] > 0)) continue;
        const svg = await toSvg(result, { scene: si });
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
        await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
        await page.evaluate(() => document.querySelector('svg').pauseAnimations());
        const duration = result.timeline.presentation[si] / 1000;
        for (const at of [duration * 0.25, duration / 2, duration * 0.9, duration * 1.2]) {
          // SMIL만이 아니라 카드 내용 층의 CSS keyframes도 같은 시각에 멈춰 둔다. 그렇지 않으면 CSS 애니메이션이 실제 시간으로 흘러 트리와 계산 스타일을 읽는 두 순간 사이에 경계를 넘을 수 있다.
          await page.evaluate((time) => {
            document.querySelector('svg').setCurrentTime(time);
            for (const animation of document.getAnimations()) {
              animation.pause();
              animation.currentTime = time * 1000;
            }
          }, at);
          for (const selector of VARIANT_TEXTS.map((text) => `.fl-motion ${text}`)) {
            const [exposed, shown] = [await exposure(page, selector), await page.evaluate((query) => [...document.querySelectorAll(query)].map((el) => {
              const variant = el.closest('[data-v], .fl-status, .fl-layer');
              return getComputedStyle(variant).opacity === '1' && getComputedStyle(variant).visibility === 'visible';
            }), selector)];
            assert.deepEqual(exposed, shown, `${name} 장면 ${si} ${at.toFixed(2)}s ${selector}`);
          }
        }
        await page.close();
      }
    }
  });

  // 근거: 조용한 선이 보이는 구간은 출처 장면이 가진다. 한 장면만 지나는 조용한 선은 다른 장면의 정지 SVG에 보이지 않는다.
  test('a quiet edge is visible in the static svg of the scene that passes it and hidden in the other scenes', async () => {
    const result = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> b "한" quiet\nb -> c "둘" quiet\nscene "one" mode=once\n a -> b time=500ms\nscene "two" mode=once\n b -> c time=500ms\nscene "three" mode=static\n light a\n');
    const quiet = result.scene.edges.flatMap((edge, j) => (edge.quiet ? [j] : []));
    const visibleIn = async (si) => {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.setContent(`<!doctype html><body style="margin:0">${await toSvg(result, { scene: si, isStatic: true })}</body>`);
      const opacities = await page.evaluate((ids) => ids.map((j) => getComputedStyle(document.querySelector(`#e-${j}`)).opacity), quiet);
      await page.close();
      return opacities;
    };
    assert.deepEqual(await visibleIn(0), ['1', '0']);
    assert.deepEqual(await visibleIn(1), ['0', '1']);
    assert.deepEqual(await visibleIn(2), ['0', '0']);
  });

  // 근거: 값 글자, 큐 찬 칸, 상태 알약, 카드 내용 층이 서로 안에 들어 있으면 안쪽 visible이 바깥 hidden을 이겨 트리에 남는다. 변형은 서로의 조상도 자손도 아니고 안쪽이 visibility를 정하지 않는다.
  test('no variant contains another variant and none of them contains an element that sets its own visibility', async () => {
    for (const name of ['queue', 'flow', 'architecture']) {
      const { html } = await playerHtml(read(name), { baseDir: 'examples' });
      await withPage(browser, html, {}, async (page) => {
        const found = await page.evaluate(() => {
          const variant = '[data-v], .fl-status, .fl-layer, .queue-fill';
          const all = [...document.querySelectorAll(variant)];
          return {
            count: all.length,
            nested: all.filter((el) => el.parentElement.closest(variant) || el.querySelector(variant)).length,
            inner: all.filter((el) => el.querySelector('[visibility]')).length,
          };
        });
        assert.ok(found.count > 0, name);
        assert.deepEqual([found.nested, found.inner], [0, 0], `${name}: ${JSON.stringify(found)}`);
      });
    }
  });
});

describe('animated svg under reduced motion across time', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  const SOURCE = 'daphnis 2\nbox a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b "요청"\nscene "s" mode=once\n  a -> b time=600ms set="n+1"\n';
  const asData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  // 근거: 문서에 직접 넣은 SVG는 prefers-reduced-motion을 평가해 마지막 모습 층만 보인다. SMIL 시계가 어느 시각에 있어도 같은 화면이다.
  test('inline: the final scene of the selected scene stays on screen at the start, in the middle and after the end', async () => {
    const result = await buildFigure(SOURCE);
    const animated = await toSvg(result, { scene: 0 });
    const still = await toSvg(result, { scene: 0, isStatic: true });
    const open = async (markup, reducedMotion) => {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion });
      await page.setContent(`<!doctype html><body style="margin:0">${markup}</body>`);
      return page;
    };
    const reduced = await open(animated, 'reduce');
    const reference = await (await open(still, 'reduce')).screenshot();
    await reduced.evaluate(() => document.querySelector('svg').pauseAnimations());
    for (const at of [0, 0.3, 0.7, 5]) {
      await reduced.evaluate((time) => document.querySelector('svg').setCurrentTime(time), at);
      assert.ok((await reduced.screenshot()).equals(reference), `SMIL 시계 ${at}s에서 마지막 모습과 다르다`);
    }
    const moving = await open(animated, 'no-preference');
    await moving.evaluate(() => document.querySelector('svg').pauseAnimations());
    const shots = [];
    for (const at of [0, 0.3]) {
      await moving.evaluate((time) => document.querySelector('svg').setCurrentTime(time), at);
      shots.push(await moving.screenshot());
    }
    assert.ok(!shots[0].equals(reference) && !shots[0].equals(shots[1]), '움직임 줄이기가 아니면 시각에 따라 달라진다(위 일치가 우연이 아니다)');
  });

  // 근거: 마지막 모습 층의 값 글자, 상태 알약, 카드 내용 층도 선택한 장면의 마지막 값만 접근성 트리에 오른다. 보이지 않는 카드 내용 층(정지 CSS)도 트리에서 빠진다.
  test('inline: the still layer exposes only the final variants of the selected scene', async () => {
    for (const name of ['queue', 'flow']) {
      const result = await buildFigure(read(name), { baseDir: 'examples' });
      for (const [si, step] of result.timeline.steps.entries()) {
        if (step.mode === 'static' || !(result.timeline.presentation[si] > 0)) continue;
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
        await page.setContent(`<!doctype html><body style="margin:0">${await toSvg(result, { scene: si })}</body>`);
        for (const text of VARIANT_TEXTS) {
          const selector = `.fl-still ${text}`;
          const [exposed, shown] = [await exposure(page, selector), await page.evaluate((query) => [...document.querySelectorAll(query)].map((el) => {
            const variant = el.closest('[data-v], .fl-status, .fl-layer');
            return getComputedStyle(variant).opacity === '1' && getComputedStyle(variant).visibility === 'visible';
          }), selector)];
          assert.deepEqual(exposed, shown, `${name} 장면 ${si} ${selector}`);
        }
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.fl-motion')).display), 'none', '움직임 층은 display none이라 화면과 트리에서 빠진다');
        await page.close();
      }
    }
  });

  // 근거: Chrome은 `<img>` 안의 SVG에서 prefers-reduced-motion 질의를 평가하지 않는다. 스크립트 없는 SVG 하나로는 `<img>`가 움직임을 줄일 수 없고, `<picture>`의 정지 SVG나 HTML 재생기가 그 길을 맡는다. 이 시험은 이 한계가 지금 Chrome에서 그대로인지 잰다.
  test('img: the preference is not evaluated inside the svg image, so a plain img keeps animating (a known browser limit)', async () => {
    const result = await buildFigure(SOURCE);
    const animated = await toSvg(result, { scene: 0 });
    const still = await toSvg(result, { scene: 0, isStatic: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' });
    await page.setContent(`<!doctype html><body style="margin:0"><img id="x" src="${asData(animated)}"></body>`);
    await page.waitForFunction(() => document.getElementById('x').complete);
    const reference = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' });
    await reference.setContent(`<!doctype html><body style="margin:0"><img id="x" src="${asData(still)}"></body>`);
    await reference.waitForFunction(() => document.getElementById('x').complete);
    const wanted = await reference.screenshot();
    const first = await page.screenshot();
    assert.ok(!first.equals(wanted), '움직임 줄이기에서도 <img>의 처음 모습은 마지막 모습이 아니다(한계가 그대로다)');
    await page.close();
    await reference.close();
  });
});
