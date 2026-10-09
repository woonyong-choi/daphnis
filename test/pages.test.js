// 페이지: 목록 쪽(gallery)과 문서 미리보기, 재생기 화면이 브라우저에서 보이는 모양(docs/design/playback.md 문서 미리보기와 장면 탭, layout.md 카드 머리와 글꼴).
// 실제 Chrome으로 연다. Chrome이 없으면 시험이 실패한다(경로는 CHROME_PATH로 바꾼다). 재생 단추, 반복 단추, 배속 메뉴, 설명 글, 진행 고리는 없다. 장면 선택은 탭, 반복은 `mode=loop`가 맡는다.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toDocument, toGallery, toHtml } from '../src/html.js';
import { values } from '../src/tokens.js';
import { launchChrome } from './chrome.js';
import { chartSource, runCli, withFolder } from './helpers.js';

const FIGURES = [{ name: 'call-registers', title: '호출 중 레지스터 값의 변화', kind: 'flow', isChart: false, href: 'call-registers' }];
const WIDTH = 1400;
const AUDIT_WAIT_MS = 500;
const FIGURE = 'daphnis 2\nbox a "A"\n';
const GAP_TOLERANCE = 0.5;
const SEMIBOLD = 600;
const CODE_FIGURE = 'daphnis 2\nbox a "일반 `code` 글"\nbox b "B"\na -> b "보냄"\nscene "first" mode=once\n  a -> b\nscene "second" mode=once\n  a -> b\nscene "third" mode=once\n  a -> b\n';
const BAR_FIGURE = `daphnis 2\n${chartSource('bar', ['x "정확도(%)"', 'series a "A"', 'row "항목" a=3', 'row "둘째" a=5'])}`;
// 닿는 영역의 최소 크기(px)
const TARGET = 44;
// 키보드 초점 외곽의 굵기(px). 도형 윤곽은 평소와 호버에서 1px이고 초점에서만 굵어진다.
const FOCUS_WIDTH = '3px';

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// HTML을 연 페이지로 body(page)를 돌린다. html이 문자열이면 page.html 하나고, 객체면 { 파일 이름: 내용 }이며 page.html을 연다(iframe 자식 문서를 같이 둘 때). 끝나면 임시 폴더를 지운다.
function withPage(browser, html, body) {
  return withFolder(async (folder) => {
    for (const [name, text] of Object.entries(typeof html === 'string' ? { 'page.html': html } : html)) writeFileSync(join(folder, name), text);
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, colorScheme: 'dark' });
    await page.goto(`file://${join(folder, 'page.html')}`);
    await body(page);
    await page.close();
  });
}

describe('pages', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 사용자 지정 Refero의 시스템 글꼴과 display 36/700/1.2. 목록과 문서에서 같은 역할을 유지한다.
  test('listing_titles_keep_the_reference_type_hierarchy_on_mobile_and_desktop', async () => {
    for (const render of [toGallery, toDocument]) {
      const html = render(FIGURES, '작업의 흐름과 데이터 표현');
      assert.doesNotMatch(html, /@font-face|data:font\//);
      await withPage(browser, html, async (page) => {
        for (const width of [320, 390, 430, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          for (const colorScheme of ['light', 'dark']) {
            await page.emulateMedia({ colorScheme });
            const result = await page.locator('h1').evaluate((el) => {
              const style = getComputedStyle(el);
              return { size: style.fontSize, weight: style.fontWeight, leading: parseFloat(style.lineHeight), family: style.fontFamily, overflow: document.documentElement.scrollWidth > innerWidth };
            });
            assert.equal(result.size, '36px');
            assert.equal(result.weight, '700');
            assert.ok(Math.abs(result.leading - 43.2) < 0.01);
            assert.doesNotMatch(result.family, /FigSans|Pretendard/);
            assert.equal(result.overflow, false, `${render.name}, ${width}, ${colorScheme}`);
          }
        }
      });
    }
  });

  // 근거: 설계 playback.md 장면 탭 "방향키와 Home, End로 장면을 고르고 초점도 선택을 따르며, 선택한 탭만 Tab 키 순서에 들어간다". 탭은 장면 선택만 맡아 진행 요소나 번호가 없다
  test('player_scene_tabs_follow_the_arrow_home_and_end_keys_with_focus_and_one_tab_stop', async () => {
    await withPage(browser, await toHtml(await buildFigure(CODE_FIGURE), 'reading'), async (page) => {
      const tabs = page.getByRole('tab');
      const state = () => page.evaluate(() => ({ focused: document.activeElement.textContent, selected: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.getAttribute('aria-selected') === 'true'), stops: [...document.querySelectorAll('[role="tab"]')].filter((tab) => tab.tabIndex === 0).length }));

      assert.deepEqual(await tabs.allTextContents(), ['first', 'second', 'third'], '탭 글은 장면 이름뿐이다(번호나 진행 표시가 없다)');
      assert.deepEqual((await state()).selected, [true, false, false]);
      await tabs.first().focus();
      await page.keyboard.press('ArrowRight');
      assert.deepEqual(await state(), { focused: 'second', selected: [false, true, false], stops: 1 });
      await page.keyboard.press('End');
      assert.deepEqual(await state(), { focused: 'third', selected: [false, false, true], stops: 1 });
      await page.keyboard.press('ArrowLeft');
      assert.deepEqual(await state(), { focused: 'second', selected: [false, true, false], stops: 1 });
      await page.keyboard.press('Home');
      assert.deepEqual(await state(), { focused: 'first', selected: [true, false, false], stops: 1 });
      await tabs.last().click();
      assert.deepEqual((await state()).selected, [false, false, true], '눌러서 고른 장면도 선택이 따라온다');
      assert.equal((await state()).stops, 1);
    });
  });

  // 근거: 설계 layout.md "윤곽은 1px 하나이며 기본, 호버, 지금 단계에서 굵기와 색이 같다", playback.md "초점 고리". 호버는 윤곽을 바꾸지 않고 키보드 초점만 굵은 파란 외곽을 건다
  test('player_shape_outline_is_one_pixel_at_rest_and_hover_and_only_keyboard_focus_thickens_it_in_both_modes', async () => {
    await withPage(browser, await toHtml(await buildFigure(CODE_FIGURE), 'controls'), async (page) => {
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme });
        const shape = page.locator('.fl-node').first();
        const face = shape.locator(':scope > .fl-stroke').first();
        const read = () => face.evaluate((el) => ({ fill: getComputedStyle(el).fill, stroke: getComputedStyle(el).stroke, width: getComputedStyle(el).strokeWidth }));
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-node > .fl-stroke')).strokeWidth === '1px');
        // 테마를 바꾼 직후에는 색이 전환 중이라 전환이 끝난 값을 잰다
        await page.waitForTimeout(AUDIT_WAIT_MS);
        const rest = await read();
        await shape.hover();
        await page.waitForTimeout(AUDIT_WAIT_MS);

        assert.equal(rest.width, '1px', colorScheme);
        assert.deepEqual(await read(), rest, `${colorScheme}: 호버는 윤곽 굵기와 색을 바꾸지 않는다`);
        await page.mouse.move(0, 0);
        await page.keyboard.press('Tab');
        await shape.focus();
        await page.waitForFunction((width) => getComputedStyle(document.querySelector('.fl-node > .fl-stroke')).strokeWidth === width, FOCUS_WIDTH);
        assert.notEqual((await read()).stroke, rest.stroke, `${colorScheme}: 초점의 윤곽은 평소와 다른 색이다`);
        await page.locator('.fl-download').focus();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-node > .fl-stroke')).strokeWidth === '1px');
      }
    });
  });

  // 근거: 버그 #18 "카드 머리의 제목과 파일 이름이 붙어 나옴": 제목, 파일 이름, 꼬리표 사이는 space.3이고 한 줄에 놓인다
  test('cardHead_separates_the_title_from_source_metadata', async () => {
    for (const html of [toGallery(FIGURES, '예제'), toDocument(FIGURES, '예제')]) {
      await withPage(browser, html, async (page) => {
        const [title, name, kind] = await Promise.all(['h2 .title', 'h2 .name', 'h2 .kind'].map((selector) => page.locator(selector).first().boundingBox()));

        if (html.includes('<main>')) assert.ok(name.y >= title.y + title.height - GAP_TOLERANCE, '목록은 제목 다음 줄에 파일 정보를 둔다');
        else assert.ok(name.x - (title.x + title.width) >= values.space['3'] - GAP_TOLERANCE);
        assert.ok(kind.x - (name.x + name.width) >= values.space['3'] - GAP_TOLERANCE, `파일 이름과 꼬리표 사이 ${kind.x - (name.x + name.width)}`);
        assert.ok(Math.abs(kind.y - name.y) < name.height, '파일 정보는 같은 줄이다');
      });
    }
  });

  // 근거: 설계 playback.md 장면 탭 "선택은 중성 면과 굵은 글자로 구분하고 선택 탭에 파란 면과 그림자를 넣지 않는다", 도구 막대 "각 단추에 접근성 이름". 조작은 닿는 영역이 44px 이상이다
  test('player_tabs_mark_the_selected_scene_by_weight_and_a_neutral_face_and_controls_are_named_and_large_enough', async () => {
    await withPage(browser, await toHtml(await buildFigure(CODE_FIGURE), 'tabs'), async (page) => {
      const style = await page.evaluate(() => {
        const read = (el) => {
          const c = getComputedStyle(el);
          return { weight: Number(c.fontWeight), background: c.backgroundColor, color: c.color, shadow: c.boxShadow, height: el.getBoundingClientRect().height };
        };
        return { on: read(document.querySelector('[role="tab"][aria-selected="true"]')), off: read(document.querySelector('[role="tab"][aria-selected="false"]')) };
      });
      const targets = await page.locator('.fl-view-tools button').evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().width > 0).map((button) => ({ name: button.getAttribute('aria-label'), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));

      assert.ok(style.on.weight >= SEMIBOLD && style.off.weight < SEMIBOLD, '선택한 탭만 굵은 글');
      assert.notEqual(style.on.background, style.off.background, '선택한 탭은 다른 면이다');
      assert.notEqual(style.on.color, style.off.color);
      assert.equal(style.on.shadow, 'none', '선택 탭에 그림자를 넣지 않는다');
      assert.ok(style.on.height >= TARGET && style.off.height >= TARGET, '탭의 닿는 영역은 44px 이상이다');
      assert.ok(targets.length >= 2 && targets.every(({ name, width, height }) => name && width >= TARGET && height >= TARGET), `조작 단추: ${JSON.stringify(targets)}`);
      assert.equal(await page.locator('.fl-pause, .fl-repeat, .fl-rate, .fl-caption, .fl-ring').count(), 0, '재생 단추, 반복, 배속, 설명, 진행 고리는 없다');
    });
  });

  // 근거: 설계 layout.md 요구사항 "차트 숫자는 tabular-nums", "고정폭 글꼴은 코드에만"(사용자 결정)
  test('player_chart_numbers_are_tabular_and_monospace_is_used_only_for_code', async () => {
    const chart = await toHtml(await buildFigure(BAR_FIGURE), 'bar');
    await withPage(browser, chart, async (page) => {
      const variants = await page.$$eval('.chart-value, .chart-tick', (nodes) => nodes.map((n) => getComputedStyle(n).fontVariantNumeric));

      assert.ok(variants.length > 0 && variants.every((v) => v.includes('tabular-nums')), variants.join());
    });
    const flow = await toHtml(await buildFigure(CODE_FIGURE), 'code');
    await withPage(browser, flow, async (page) => {
      const families = await page.evaluate(() => {
        const mono = (el) => /Mono/.test(getComputedStyle(el).fontFamily);
        const plain = [...document.querySelectorAll('svg .label, svg .edgelabel, [role="tab"]')];
        return { plainMono: plain.filter(mono).length, plainCount: plain.length, codeMono: [...document.querySelectorAll('svg .code')].every(mono), codeCount: document.querySelectorAll('svg .code').length };
      });

      assert.equal(families.plainMono, 0);
      assert.ok(families.plainCount > 0);
      assert.ok(families.codeCount > 0 && families.codeMono);
    });
  });

  // 근거: 설계 playback.md 요구사항 "목록 쪽 테마 단추가 목록과 iframe 그림을 함께 바꾼다"(루트 color-scheme과 고른 값 저장), 감사 C9 "실제 자식 HTML 없이 루트만 확인했다"
  test('gallery_theme_buttons_set_the_root_color_scheme_and_remember_the_choice', async () => {
    const child = await toHtml(await buildFigure(CODE_FIGURE), 'call-registers');
    await withPage(browser, { 'page.html': toGallery(FIGURES, '예제'), 'call-registers.html': child }, async (page) => {
      await page.evaluate(() => {
        localStorage.removeItem('daphnis-theme');
        localStorage.setItem('mutoscope-theme', 'light');
      });
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('data-theme'), null, '폐기한 테마 키는 현재 설정으로 읽지 않는다');
      await page.waitForFunction(() => document.querySelector('iframe').style.height !== '');
      const frame = page.frames().find((f) => f !== page.mainFrame());
      const labels = await page.locator('.theme button').allTextContents();
      await page.click('.theme button[data-mode="light"]');
      await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');

      assert.deepEqual(labels, ['시스템', '라이트', '다크']);
      assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('daphnis-theme')), 'light');
      assert.equal(await frame.evaluate(() => document.readyState), 'complete');
      assert.ok(await frame.locator('svg').count() > 0, '자식 문서에 그림이 있다');
    });
  });

  // 근거: 이슈 #69 "목록을 열기만 해도 파일명의 스크립트가 실행된다"와 "`#`, `?`, 공백, 한글 이름도 해당 출력 파일을 연다". 실제 Chrome에서 목록과 문서 미리보기를 열어 본다
  test('gallery_opened_in_chrome_runs_no_script_from_a_file_name_and_opens_the_file_of_every_odd_name', async () => {
    const names = ['javascript:parent.__daphnisAudit=1;void(0)', 'data:text;<img src=x onerror=parent.__daphnisAudit=1>', 'x" onload="parent.__daphnisAudit=1', 'a#b', 'q?x', 'sp ace', '한글 그림', "q'uote", 'p(a)r'];
    await withFolder(async (folder) => {
      for (const name of names) writeFileSync(join(folder, `${name}.dap`), FIGURE);
      const made = runCli(['gallery', '.', '--out', 'out'], folder);
      assert.equal(made.status, 0, made.stderr);

      for (const listing of ['index.html', 'document.html']) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`file://${join(folder, 'out', listing)}`);
        await page.waitForTimeout(AUDIT_WAIT_MS);
        const audited = await page.evaluate(() => window.__daphnisAudit);
        assert.equal(audited, undefined, `${listing}: 파일명이 부모 창에서 실행되지 않는다`);
        assert.deepEqual(errors, [], listing);
        const targets = await page.evaluate(() => [...document.querySelectorAll('a[href$=".html"], a[href$=".svg"], iframe[src], img[src]')].map((el) => el.href || el.src));
        assert.ok(targets.every((url) => url.startsWith('file://')), `${listing}: 모든 링크는 같은 폴더의 파일이다`);
        await page.close();
      }

      for (const name of names) {
        const page = await browser.newPage();
        await page.goto(`file://${join(folder, 'out', 'index.html')}`);
        const link = page.locator('section', { has: page.locator(`h2 code.name:text-is(${JSON.stringify(`${name}.dap`)})`) }).locator('nav a', { hasText: '열기' });
        const href = await link.evaluate((a) => a.href);
        assert.equal(fileURLToPath(href), join(folder, 'out', `${name}.html`), `${name}: 열기 링크는 그 이름의 HTML을 가리킨다`);
        await page.goto(href);
        assert.ok((await page.locator('svg').count()) > 0, `${name}: 그림이 열린다`);
        await page.close();
      }
    });
  });
});
