// 시각 수정: 움직이는 SVG의 움직임 줄이기. SVG는 스크립트 없이 동작하는 파일이라(`<img>`에서도) 움직임 층(SMIL과 keyframes)과 마지막 모습 층을 함께 싣고,
// CSS 미디어 질의 하나로 움직임 줄이기에서는 마지막 모습만 보인다. 이 시험이 SVG의 움직임 줄이기를 실제 Chrome에서 잰다.
// 한계: 문서가 가려질 때 시계를 멈추는 것(visibilitychange)은 스크립트가 필요해 스크립트 없는 SVG에는 없다(HTML 재생기 계약이다).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome } from './chrome.js';
import { MIXED } from './player-compiled.js';

const ONCE = 'daphnis 2\nbox a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b "요청"\nscene "s" mode=once\n  show b "끝"\n  a -> b time=600ms set="n+1"\n';
const LOOP = ONCE.replace('mode=once', 'mode=loop');

const idsOf = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

describe('animated svg under reduced motion', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  async function open(markup, reducedMotion, mode = 'inline') {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion });
    const html = mode === 'img' ? `<!doctype html><body style="margin:0"><img id="x" src="data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}"></body>` : `<!doctype html><body style="margin:0">${markup}</body>`;
    await page.setContent(html);
    if (mode === 'img') await page.waitForFunction(() => document.getElementById('x').complete);
    return page;
  }

  // 근거: 같은 문서의 마지막 모습 층은 정지 SVG(isStatic)와 화면이 같다. 시간이 흘러도 움직임이 없고 처음 모습이 아닌 마지막 모습이다
  test('reduced motion shows the final snapshot of the selected scene, pixel for pixel like the static svg, and nothing moves', async () => {
    for (const source of [ONCE, LOOP]) {
      const result = await buildFigure(source);
      const animated = await toSvg(result, { scene: 0 });
      const still = await toSvg(result, { scene: 0, isStatic: true });
      assert.match(animated, /class="fl-motion"/);
      const reduced = await open(animated, 'reduce');
      const reference = await open(still, 'reduce');
      const frozen = await reduced.screenshot();
      assert.ok(frozen.equals(await reference.screenshot()), '움직임 줄이기의 화면이 정지 SVG와 같다');
      await reduced.waitForTimeout(1500);
      assert.ok(frozen.equals(await reduced.screenshot()), '시간이 흘러도 움직이지 않는다');
      const state = await reduced.evaluate(() => ({ motion: getComputedStyle(document.querySelector('.fl-motion')).display, still: getComputedStyle(document.querySelector('.fl-still')).display, animates: document.querySelectorAll('.fl-still animate, .fl-still animateMotion, .fl-still set').length, values: [...document.querySelectorAll('.fl-still [data-v]')].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.textContent) }));
      assert.deepEqual([state.motion, state.still, state.animates], ['none', 'inline', 0], '움직임 층은 숨고 마지막 모습 층에는 SMIL이 없다');
      assert.deepEqual(state.values, ['1'], '마지막 모습의 값이다(처음 값 0이 아니다)');
      await reduced.close();
      await reference.close();
    }
  });

  // 근거: 움직임 줄이기가 아닌 환경은 기존 그대로 움직임 층이 보이고 마지막 모습 층은 숨는다
  test('without the preference the motion layer shows and the still layer is hidden', async () => {
    const animated = await toSvg(await buildFigure(ONCE), { scene: 0 });
    const page = await open(animated, 'no-preference');
    const state = await page.evaluate(() => ({ motion: getComputedStyle(document.querySelector('.fl-motion')).display, still: getComputedStyle(document.querySelector('.fl-still')).display, animates: document.querySelectorAll('.fl-motion animate, .fl-motion animateMotion').length }));
    assert.deepEqual([state.motion, state.still], ['inline', 'none']);
    assert.ok(state.animates > 0, '움직임 층이 SMIL을 갖는다');
    await page.close();
  });

  // 근거: `<img>`로 넣은 SVG는 스크립트를 쓸 수 없고, Chrome은 SVG 이미지 안에서 prefers-reduced-motion 질의를 평가하지 않는다(prefers-color-scheme은 평가한다).
  // 그래서 `<img>` 하나로는 SVG가 스스로 움직임을 줄일 수 없다. 이 한계는 SVG만으로 풀 수 없고, 문서가 고른다: `<picture>`에 움직임 줄이기에서만 쓰는 정지 SVG를 둔다. 이 시험은 그 길이 실제로 되는지 잰다.
  test('in an img the preference is not evaluated inside the svg, so the supported route is a picture whose source is the static svg', async () => {
    const result = await buildFigure(ONCE);
    const animated = await toSvg(result, { scene: 0 });
    const still = await toSvg(result, { scene: 0, isStatic: true });
    const asData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' });
    await page.setContent(`<!doctype html><body style="margin:0"><picture><source media="(prefers-reduced-motion: reduce)" srcset="${asData(still)}"><img id="x" src="${asData(animated)}"></picture></body>`);
    await page.waitForFunction(() => document.getElementById('x').complete);
    const viaPicture = await page.screenshot();
    const reference = await open(still, 'reduce', 'img');
    assert.ok(viaPicture.equals(await reference.screenshot()), 'picture는 움직임 줄이기에서 정지 SVG를 보인다');
    assert.match(await page.evaluate(() => document.getElementById('x').currentSrc), /^data:image\/svg\+xml/);
    await page.close();
    await reference.close();
  });

  // 근거: 움직임 줄이기를 켜고 끌 때 층이 바뀐다
  test('toggling the preference swaps the layers without a reload', async () => {
    const page = await open(await toSvg(await buildFigure(ONCE), { scene: 0 }), 'no-preference');
    const display = () => page.evaluate(() => [getComputedStyle(document.querySelector('.fl-motion')).display, getComputedStyle(document.querySelector('.fl-still')).display]);
    assert.deepEqual(await display(), ['inline', 'none']);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.deepEqual(await display(), ['none', 'inline']);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.deepEqual(await display(), ['inline', 'none']);
    await page.close();
  });

  // 근거: 두 층을 한 문서에 담아도 id가 겹치지 않고 참조가 모두 풀린다. 층 안에서 정의한 id만 이름을 바꾸고 공통 defs는 그대로다
  test('a document with both layers has unique ids and every reference resolves', async () => {
    for (const source of [ONCE, MIXED, 'daphnis 2\ntable t "T" {\n  id int pk\n  name text\n}\ntable u "U" {\n  id int pk\n  t_id int fk=t.id\n}\nview v graph right {\n  t\n  u\n}\nscene "s" mode=once\n  light t\n  t -> u time=500ms\n']) {
      const svg = await toSvg(await buildFigure(source), { scene: 0 });
      const ids = idsOf(svg);
      assert.equal(new Set(ids).size, ids.length, `겹치는 id: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
      const refs = [...svg.matchAll(/url\(#([^)"]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]);
      for (const ref of refs) assert.ok(ids.includes(ref), `${ref}를 정의한 곳이 없다`);
      assert.ok(ids.some((id) => id.startsWith('still-')), '마지막 모습 층의 id는 이름이 구분된다');
    }
  });

  // 근거: 정지 장면과 길이 0 장면은 층이 하나뿐이다(마지막 모습 하나)
  test('a static scene and a zero-length scene carry a single layer', async () => {
    const result = await buildFigure(ONCE.replace('mode=once', 'mode=static'));
    assert.doesNotMatch(await toSvg(result, { scene: 0 }), /fl-motion|fl-still/);
    const zero = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "s" mode=once\n  light a\n');
    assert.doesNotMatch(await toSvg(zero, { scene: 0 }), /fl-motion|fl-still|<animate/);
  });
});
