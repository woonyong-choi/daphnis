// 사용자가 보는 면과 조작의 동작(docs/design/playback.md, charts.md, layout.md, figure-kinds.md). 실제 Chrome에서 잰다. Chrome이 없으면 시험이 실패한다. 경로는 CHROME_PATH로 바꿀 수 있다.
// 경계 윤곽 일치, 값 변경 면, 정지 그림의 조작 숨김, 표 모서리, 차트 기하, 폭별 넘침 없음을 본다. 원본은 이 파일 안에 둔다(공개 예제 전체를 도는 시험만 예제 폴더를 읽는다).
// 재생 단추, 배속 메뉴, 진행 고리, 조작 막대의 글자는 없어졌다. 배속은 장면의 `speed=`, 반복은 `mode=loop`, 단계 선택은 장면 탭이 맡으므로 그 시험은 player-*.test.js가 맡는다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { cardBox, labelRows } from '../src/draw/figure.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { CAPTURE, launchChrome, readState, withPage } from './chrome.js';
import { withFolder } from './helpers.js';
import { FLOW, NO_TIME } from './player-compiled.js';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const WIDTHS = [390, 768, 1280];
const GEOMETRY = ['x', 'y', 'width', 'height', 'rx', 'ry', 'd'];
const PX = 0.5;
// 사람이 읽을 수 있는 가장 작은 글자 크기(px). 공통 글자 역할 11px 이상이다.
const MIN_TEXT_PX = 10.99;
// 누적 막대 조각 사이의 틈(토큰 space.2)
const SEGMENT_GAP = 4;

const instrument = (html) => html.replace("figurePlay(document.querySelector('.fl-figure'),", `${CAPTURE}figurePlay(document.querySelector('.fl-figure'),`);

const LIFECYCLE = ['daphnis 2', 'box client "Client"', 'box worker "Worker"', 'client -> worker', 'view g graph {', '  client worker', '}', 'view s sequence {', '  client worker', '}', 'scene "생명주기" mode=once', '  client -> worker "create" create', '  activate worker', '  worker -> client "done" dashed', '  deactivate worker', '  client -> worker "destroy" destroy', ''].join('\n');
const STACKED = ['daphnis 2', 'chart c "요청 시간" stacked {', '  x "시간(ms)"', '  series a "대기"', '  series b "실행"', '  row "요청" a=30 b=20', '}', 'scene "뒤 구간" mode=once', '  reveal c.b', ''].join('\n');
const CLASS_MODEL = ['daphnis 2', 'interface repository "Repository" {', '  method save "(item: Order): void" visibility=public', '}', 'class order "Order" {', '  field id "UUID" visibility=private', '  method confirm "(): void" visibility=public', '}', 'class line "OrderLine" {', '  field quantity "int" visibility=private', '  field unitPrice "long" visibility=private', '}', 'order -> line relation=composition from="1" to="1..*"', 'order -> repository relation=dependency', ''].join('\n');
const OWNERSHIP = (direction) => ['daphnis 2', 'class order "Order" {', '  field id "UUID" visibility=private', '}', 'class item "Item" {', '  field qty "int" visibility=private', '}', `view main graph ${direction} {`, '  order item', '}', 'order -> item relation=composition from="1" to="0..*"', ''].join('\n');
const CONSTRAINTS = ['daphnis 2', 'table users "users" {', '  id "bigint" pk', '}', 'table profiles "profiles" {', '  user_id "bigint" pk fk=users.id', '  bio "text"', '}', ''].join('\n');
const QUEUE = ['daphnis 2', 'box a "A"', 'queue q "큐" slots=3 from=1', 'a -> q', 'on q q+1', 'scene "넣기" mode=once', '  a -> q "x" time=1s', ''].join('\n');
const GRID = ['daphnis 2', 'grid g "G" cols=3 rows=2 {', '  item a "A" row=0 col=0', '  item b "B" row=0 col=1', '  item c "C" row=0 col=2', '  item d "D" row=1 col=0', '  item e "E" row=1 col=1', '  item f "F" row=1 col=2', '}', 'table orders "orders" {', '  id "bigint" pk', '  total "int"', '}', ''].join('\n');
const HEAT = ['daphnis 2', 'chart c "서버별 캐시" heatmap {', '  cell "서버" "캐시" 12', '  cell "서버" "원본" 123', '  cell "배치" "캐시" 0', '  cell "배치" "원본" 42', '}', 'scene "밝히기" mode=once', '  light c "서버" "캐시"', '  wait 1s', '  light c "배치" "원본"', ''].join('\n');
const BAR_CI = ['daphnis 2', 'chart c "응답 시간" bar {', '  x "시간(ms)"', '  series a "전"', '  series b "후"', '  row "조회" a=40 a.low=30 a.high=52 b=22 b.low=15 b.high=29', '  row "저장" a=90 a.low=70 a.high=112 b=61 b.low=50 b.high=73', '}', ''].join('\n');
const BOX = ['daphnis 2', 'chart c "분포" box {', '  x "시간(ms)"', '  row "조회" min=8 q1=14 median=22 q3=27 max=64', '  row "검색" min=22 q1=41 median=58 q3=83 max=240', '}', ''].join('\n');
// 지금 단계에서 도형이 카드를 가진 흐름: 값 줄이 있는 카드와 값이 바뀌는 순간의 면이 있다
const CARD_FLOW = ['daphnis 2', 'box a "A"', 'box b "B"', 'value n "Count" on=b', 'on b n+1', 'a -> b', 'scene "하나" mode=once', '  a -> b time=1s', ''].join('\n');
// 한 이동만 있는 흐름. 점이 지나는 동안에만 선이 강조된다.
const ONE_MOVE = ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b "요청"', 'scene "s" mode=once', '  a -> b time=1s', ''].join('\n');

// 요소의 윤곽 속성 모음(좌표와 반지름, 경로)
const geometryOf = (locator) => locator.evaluate((el, names) => Object.fromEntries(names.map((name) => [name, el.getAttribute(name)])), GEOMETRY);

describe('surface behavior', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(page), heap O(page), stack O(1), io page
  // vars: page = 페이지 하나를 여는 비용
  // basis: estimate
  // 원본의 HTML 재생기를 가짜 시계로 열어 body(page, result)를 돌린다(window.probe로 재생기 상태를 읽을 수 있다).
  async function withPlayer(source, body, { width = 1280, colorScheme = 'light', ...options } = {}) {
    const result = await buildFigure(source, { baseDir: EXAMPLES });
    await withPage(browser, instrument(await toHtml(result, 'surface')), { viewport: { width, height: 900 }, colorScheme, ...options }, (page) => body(page, result));
  }

  // 근거: layout.md 그림 크기. 좁은 단독 재생기는 빈 캔버스를 걷고, 창 크기 변경과 확대 복귀에도 같은 내용을 보인다.
  test('narrow_mobile_player_uses_content_bounds_and_restores_them_after_zoom_and_resize', async () => {
    for (const colorScheme of ['light', 'dark']) {
      await withPlayer(LIFECYCLE, async (page) => {
        const read = () => page.locator('.dp-panel svg').last().evaluate((svg) => {
          const label = svg.querySelector('.label');
          return { view: svg.getAttribute('viewBox'), width: svg.viewBox.baseVal.width, rendered: svg.getBoundingClientRect().width, font: parseFloat(getComputedStyle(label).fontSize) * label.getScreenCTM().a };
        });
        const mobile = await read();
        assert.ok(mobile.font >= MIN_TEXT_PX, `mobile label ${mobile.font}`);
        const clipped = await page.locator('.dp-panel svg').last().evaluate((svg) => {
          const frame = svg.getBoundingClientRect();
          return [...svg.querySelectorAll('text')].filter((text) => {
            const box = text.getBoundingClientRect();
            return box.width > 0 && (box.left < frame.left - 1 || box.right > frame.right + 1);
          }).map((text) => text.textContent);
        });
        assert.deepEqual(clipped, []);
        // 배치 바꿈은 다음 프레임에 일어나므로 가짜 시계를 잠깐 흘려 자리 잡은 뒤를 잰다
        const settle = () => page.clock.runFor(100);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => dispatchEvent(new Event('resize')));
        await settle();
        assert.ok((await read()).width >= mobile.width);
        await page.setViewportSize({ width: 390, height: 900 });
        await page.evaluate(() => dispatchEvent(new Event('resize')));
        await settle();
        assert.equal((await read()).view, mobile.view);
        await page.locator('.fl-full').click();
        await settle();
        const full = await read();
        await page.locator('[data-zoom="in"]').click();
        await settle();
        // 전체 화면에서 확대하면 같은 내용이 더 크게 그려지고(그린 폭이 커지고) 전체 보기는 처음 맞춤으로 돌아온다. 전체 화면을 나오면 처음 배치로 돌아온다.
        const zoomed = await read();
        assert.ok(zoomed.rendered > full.rendered, `확대 ${full.rendered} -> ${zoomed.rendered}`);
        await page.locator('[data-zoom="fit"]').click();
        await settle();
        assert.ok(Math.abs((await read()).rendered - full.rendered) <= 1, '전체 보기는 처음 맞춤이다');
        await page.locator('.fl-full').click();
        await settle();
        const restored = await read();
        assert.equal(restored.view, mobile.view);
        assert.ok(Math.abs(restored.rendered - mobile.rendered) <= 1, `복귀한 그린 폭 ${restored.rendered} / ${mobile.rendered}`);
      }, { width: 390, colorScheme });
    }
  });

  // 근거: charts.md 누적 막대와 재생 "그 장면의 reveal에 나온 계열은 장면 시작에 숨고, 나오지 않은 계열은 처음부터 보인다". 앞 구간은 그대로 있고 뒤 구간이 나타나며 합계는 뒤 구간과 함께 나타난다.
  test('stacked_chart_scene_keeps_the_base_segment_and_reveals_the_later_segment_with_the_total', async () => {
    for (const colorScheme of ['light', 'dark']) {
      await withPlayer(STACKED, async (page) => {
        // 드러내는 구간은 숨는 것이 아니라 너비 0에서 자란다. 화면에 그려진 너비(px)와 그림 좌표를 함께 본다.
        const state = () => page.locator('.dp-panel svg .stack-segment').evaluateAll((rects) => rects.map((rect) => {
          const box = rect.getBBox();
          return { drawn: rect.getBoundingClientRect().width, x: box.x, w: box.width };
        }));
        const first = await state();
        assert.ok(first[0].drawn > 1 && first[1].drawn < 1, `${colorScheme}: 장면 시작에 앞 구간은 그려져 있고 뒤 구간은 아직 자라지 않았다 ${JSON.stringify(first)}`);
        await page.clock.runFor(1500);
        const both = await state();
        assert.ok(both[1].drawn > 1, '뒤 구간이 다 자랐다');
        assert.ok(Math.abs(both[1].drawn / both[0].drawn - 20 / 30) < 0.03, `조각 길이는 값에 비례한다 ${both[1].drawn / both[0].drawn}`);
        assert.ok(Math.abs(both[0].x + both[0].w + SEGMENT_GAP - both[1].x) < 0.02, '뒤 구간은 앞 구간 끝에서 틈 하나 뒤에 시작한다');
        assert.match((await page.locator('.dp-panel svg .chart-value').allTextContents()).join(' | '), /= 50/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }, { width: 390, colorScheme });
    }
  });

  // 근거: expression-coverage.md 요소별 대응. 페이지 글꼴과 그림 글꼴은 분리하고, 내부 구분선은 관계선보다 약하다.
  test('design_hierarchy_separates_system_controls_diagram_text_and_structural_lines', async () => {
    for (const colorScheme of ['light', 'dark']) {
      for (const source of [CLASS_MODEL, CONSTRAINTS.replace('table profiles "profiles" {', 'profiles -> users\ntable profiles "profiles" {').replace('profiles -> users\n', '')]) {
        await withPlayer(source, async (page) => {
          const found = await page.evaluate(() => {
            const style = (selector) => getComputedStyle(document.querySelector(selector));
            const root = getComputedStyle(document.documentElement);
            const divider = style('.col-line, .classifier-divider');
            return {
              controls: style('body').fontFamily,
              diagram: style('svg.fl .label').fontFamily,
              divider: parseFloat(divider.strokeWidth),
              relation: parseFloat(style('.fl-path').strokeWidth),
              expectedDivider: parseFloat(root.getPropertyValue('--border-hair')),
              expectedRelation: parseFloat(root.getPropertyValue('--border-edge')),
              label: parseFloat(style('svg.fl .label').fontSize),
              detail: parseFloat(style('svg.fl .edgelabel, svg.fl .cell, svg.fl .classifier-text, svg.fl .type').fontSize),
            };
          });
          assert.match(found.controls, /^ui-sans-serif/);
          assert.match(found.diagram, /^FigSans/);
          assert.equal(found.divider, found.expectedDivider);
          assert.equal(found.relation, found.expectedRelation);
          assert.ok(found.divider < found.relation);
          assert.ok(found.label >= found.detail);
        }, { colorScheme });
      }
    }
  });

  // 근거: figure-kinds.md 클래스 그림. 멤버 구획과 관계 기호의 실제 SVG 표시와 접근성 이름을 확인한다.
  test('class_model_keeps_members_inside_compartments_and_preserves_relation_markers', async () => {
    for (const colorScheme of ['light', 'dark']) {
      for (const width of WIDTHS) {
        await withPlayer(CLASS_MODEL, async (page) => {
          const checks = await page.locator('.fl-shape-classifier').evaluateAll((nodes) => nodes.map((node) => {
            const frame = node.querySelector('rect').getBoundingClientRect();
            const texts = [...node.querySelectorAll('.classifier-text')].map((text) => {
              const bounds = text.getBoundingClientRect();
              return { text: text.textContent, fits: bounds.left >= frame.left - 0.5 && bounds.right <= frame.right + 0.5 && bounds.top >= frame.top - 0.5 && bounds.bottom <= frame.bottom + 0.5 };
            });
            return { texts, dividers: node.querySelectorAll('.classifier-divider').length, name: node.getAttribute('aria-label') };
          }));

          assert.equal(checks.length, 3);
          for (const check of checks) {
            assert.equal(check.dividers, 2);
            assert.ok(check.texts.every((text) => text.fits), `${colorScheme} ${width}: ${JSON.stringify(check)}`);
          }
          assert.ok(checks.some((check) => check.name.includes('save')) && checks.some((check) => check.name.includes('confirm')), checks.map((check) => check.name).join(' / '));
          // 합성은 소유하는 쪽 끝에 마름모(marker-start), 의존은 받는 쪽 끝에 화살촉(marker-end)을 단다
          const markers = await page.evaluate(() => [...document.querySelectorAll('.fl-edge .fl-path')].map((path) => [path.getAttribute('marker-start') ?? '', path.getAttribute('marker-end') ?? ''].join('|')));
          assert.equal(markers.length, 2);
          assert.ok(markers.every((marker) => /url\(#fl-/.test(marker)), markers.join());
          assert.notEqual(markers[0], markers[1], '관계 종류가 다르면 끝 기호도 다르다');
        }, { width, colorScheme });
      }
    }
  });

  // 근거: figure-kinds.md 양끝 다중성. 화면에서 from은 전체 쪽, to는 부분 쪽에 붙고 도형을 가리지 않는다.
  test('class_multiplicities_stay_next_to_the_correct_classifier_in_both_directions', async () => {
    for (const direction of ['right', 'down']) {
      for (const colorScheme of ['light', 'dark']) {
        await withPlayer(OWNERSHIP(direction), async (page) => {
          const positions = await page.evaluate(() => {
            const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
            const order = rect('.fl-node[data-id="order"] > rect');
            const item = rect('.fl-node[data-id="item"] > rect');
            const distance = (a, b) => Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
            return ['from', 'to'].map((end) => {
              const label = rect(`.fl-multiplicity[data-end="${end}"]`);
              return { end, order: distance(label, order), item: distance(label, item) };
            });
          });

          assert.ok(positions[0].order < positions[0].item, `${direction}: from`);
          assert.ok(positions[1].item < positions[1].order, `${direction}: to`);
          assert.deepEqual(await page.locator('.fl-multiplicity').allTextContents(), ['1', '0..*']);
          assert.match(await page.locator('#e-0').getAttribute('aria-label'), /order \[1\] composition item \[0\.\.\*\]/);
        }, { width: 390, colorScheme });
      }
    }
  });

  // 근거: figure-kinds.md 열 제약. 긴 삭제 정책과 여러 키 표식이 서로 겹치거나 표 밖으로 나가지 않는다.
  test('data_constraints_keep_key_and_type_text_inside_each_row', async () => {
    for (const colorScheme of ['light', 'dark']) {
      for (const width of WIDTHS) {
        await withPlayer(CONSTRAINTS, async (page) => {
          assert.match(await page.locator('.fl-node[data-id="profiles"]').getAttribute('aria-label'), /user_id PK FK bigint/);
          const rows = await page.locator('.fl-part').evaluateAll((parts) => parts.map((part) => {
            const bounds = part.querySelector('rect').getBoundingClientRect();
            const texts = [...part.querySelectorAll('text')];
            const [name, type] = [texts[0], texts.at(-1)];
            const left = name.getBoundingClientRect();
            const right = type.getBoundingClientRect();
            return { text: texts.map((text) => text.textContent).join(' '), separated: texts.length < 2 || left.right <= right.left, contained: texts.every((text) => { const box = text.getBoundingClientRect(); return box.left >= bounds.left - 0.5 && box.right <= bounds.right + 0.5 && box.top >= bounds.top - 0.5 && box.bottom <= bounds.bottom + 0.5; }) };
          }));

          assert.ok(rows.some((row) => row.text.includes('PK') && row.text.includes('FK')));
          for (const row of rows) assert.ok(row.separated && row.contained, `${colorScheme} ${width}: ${row.text}`);
        }, { width, colorScheme });
      }
    }
  });

  // 근거: 사용자 지적 "큐 활성 외곽선이 기본 경계와 다르다", 승인된 규칙 "호버에 장식 윤곽을 더하지 않는다". 기본 윤곽, 값이 바뀔 때의 면, 호버가 정확히 같은 좌표와 반지름이고 더 큰 링을 덧씌우지 않는다.
  test('queue_default_flash_and_hover_states_share_one_outline', async () => {
    await withPlayer(QUEUE, async (page) => {
      const base = page.locator('.fl-shape-queue > .fl-stroke').first();
      const flash = page.locator('.fl-shape-queue .fl-flash-face').first();
      const outline = await geometryOf(base);

      assert.deepEqual(await geometryOf(flash), outline, '값 변경 면은 도형과 같은 윤곽이다');
      await page.locator('.fl-shape-queue').first().hover();
      assert.deepEqual(await geometryOf(base), outline, '호버로 윤곽이 바뀌지 않는다');
      assert.equal(await flash.evaluate((el) => getComputedStyle(el).stroke), 'none', '값 변경 면은 새 테두리를 만들지 않는다');
      await page.clock.runFor(1200);
      assert.deepEqual(await geometryOf(base), outline, '재생 중에도 같다');
    });
  });

  // 근거: playback.md 값 변화 "움직임 줄이기에서는 면을 그리지 않고 값 글자가 바로 바뀐다". 값 변경 면은 움직임 줄이기에서 그려지지 않고 값 글자는 그대로 바뀐다.
  test('reduced_motion_removes_the_pulse_but_keeps_the_value', async () => {
    await withPlayer(QUEUE, async (page) => {
      assert.equal(await page.locator('.fl-flash').first().evaluate((el) => getComputedStyle(el).display), 'none');
      assert.ok((await page.locator('.queue-fill[opacity="1"], [data-v][opacity="1"]').count()) > 0);
    }, { reducedMotion: 'reduce' });
  });

  // 근거: playback.md 재생 방식 "speed는 재생 배속이다. 시간표의 ms는 배속으로 바뀌지 않는다". 같은 이동이 2배속 장면에서는 0.5배속 장면보다 4배 빨리 끝난다(효과 꼬리 400ms는 배속과 상관없다).
  test('scene_speed_scales_the_scene_clock_by_the_chosen_ratio', async () => {
    const source = (speed) => `daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "Long" mode=once speed=${speed}\n  a -> b time=8s\n`;
    // cost: time O(page), heap O(1), stack O(1), io page
    // vars: page = 페이지 하나를 여는 비용
    // basis: estimate
    // 장면이 끝나는 화면 시각(ms). 끝날 때까지 100ms씩 시계를 흘린다.
    const endOf = async (speed) => {
      let end;
      await withPlayer(source(speed), async (page) => {
        for (let t = 0; t < 30_000; t += 100) {
          await page.clock.runFor(100);
          if ((await readState(page)).ended) {
            end = t + 100;
            return;
          }
        }
      });
      return end;
    };
    const [slow, fast] = [await endOf(0.5), await endOf(2)];

    // 효과 꼬리(400ms)는 배속으로 나누지 않으니 빼고 견준다
    assert.ok(Math.abs((slow - 400) / (fast - 400) - 4) < 0.4, `0.5배속 ${slow}ms, 2배속 ${fast}ms`);
  });

  // 근거: 사용자 지적 "정지된 그림에 장식용 기본 재생". 시간 흐름이 없는 그림(장면이 없거나 하나)은 장면 탭 줄이 없고 전체 화면만 쓰며 움직이는 것이 없다.
  test('static_figures_hide_the_scene_tabs_and_keep_full_screen', async () => {
    const staticScene = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "정지" mode=static\n  a -> b\n';
    for (const source of [NO_TIME, staticScene, readFileSync(join(EXAMPLES, 'box.dap'), 'utf8').split('scene "퍼짐이 큰 쪽"')[0]]) {
      await withPlayer(source, async (page) => {
        assert.equal(await page.locator('.fl-tabs [role="tab"]').first().isVisible(), false);
        assert.equal(await page.locator('.fl-full').isVisible(), true);
        await page.keyboard.press('Space');
        assert.equal(await page.locator('svg.fl').first().evaluate((svg) => svg.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length), 0);
        assert.equal((await readState(page)).isPlaying, false, '정지 장면은 시계가 돌지 않는다');
      });
    }
  });

  // 근거: 사용자 지적 "표는 바깥 모서리만 둥글고 내부 교차는 직선". 격자 안쪽 칸은 모서리 반지름이 없고, 칸 묶음의 바깥 네 모서리만 둥글며, 테이블 열 줄은 틀 모양으로 잘린다.
  test('grid_interior_cells_are_square_and_only_the_outer_block_corners_are_round', async () => {
    const svg = await toSvg(await buildFigure(GRID, { baseDir: EXAMPLES }));
    const cells = [...svg.matchAll(/<(rect|path) [^>]*class="grid-cell(?: [^"]*)?"[^>]*>/g)];

    assert.ok(cells.length > 4);
    assert.ok(cells.filter(([tag]) => /^<rect/.test(tag)).every(([tag]) => !/ rx=/.test(tag)), '직각 칸에는 rx가 없다');
    assert.ok(cells.filter(([tag]) => /^<path/.test(tag)).length >= 1 && cells.filter(([tag]) => /^<path/.test(tag)).length <= 4, '바깥 모서리 칸만 경로다');
    assert.ok(/<clipPath id="tc-\d+">/.test(svg) && !/class="part-bg[^"]*"[^>]* rx=/.test(svg) && !/rx="[^"]*"[^>]*class="part-bg/.test(svg), '테이블 열 줄은 직선이고 틀 모양으로 잘린다');
  });

  // 근거: 사용자 지적 "히트맵 흐림 보완 테두리가 선택 테두리처럼 보인다". 히트맵 칸에는 테두리가 없고 값 색 강도가 그대로다.
  test('heatmap_cells_have_no_outline_and_keep_their_value_color', async () => {
    await withPlayer(HEAT, async (page) => {
      const style = await page.locator('.chart-heat').first().evaluate((el) => ({ stroke: getComputedStyle(el).stroke, rx: el.getAttribute('rx') }));
      const fills = await page.locator('.chart-heat').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));

      assert.equal(style.stroke, 'none');
      assert.equal(style.rx, '0');
      assert.equal(await page.locator('.rim').count(), 0);
      await page.clock.runFor(2500);
      assert.deepEqual(await page.locator('.chart-heat').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill)), fills, '강조 단계에서도 칸 색이 같다');
    });
  });

  // 근거: 사용자 지적 "막대와 신뢰구간 회색 선이 겹쳐 흰 절단선처럼 보인다". 신뢰구간 줄은 막대 밖 독립된 줄이고 어떤 막대와도, 축과도 겹치지 않으며 양끝 수염이 있다. 넓은 배치와 좁은 배치는 따로 만든 SVG라 화면 폭마다 검사한다.
  test('bar_confidence_line_sits_on_its_own_row_apart_from_every_bar_and_the_axis', async () => {
    for (const width of [1280, 390]) {
      await withPlayer(BAR_CI, async (page) => {
        const layout = await page.evaluate(() => {
          const root = document.querySelector('.dp-panel svg');
          const box = (el) => { const b = el.getBBox(); return { top: b.y, bottom: b.y + b.height }; };
          return {
            bars: [...root.querySelectorAll('rect.grow')].map(box),
            lines: [...root.querySelectorAll('line.chart-ci')].map(box),
            caps: root.querySelectorAll('path.chart-ci').length,
            axis: Math.max(...[...root.querySelectorAll('.chart-axis')].map((el) => el.getBBox().y)),
          };
        });
        assert.ok(layout.lines.length > 0 && layout.caps === layout.lines.length, `${width}px: 선마다 양끝 수염 경로가 있다`);
        for (const line of layout.lines) {
          assert.ok(layout.bars.every((bar) => line.bottom <= bar.top - PX || line.top >= bar.bottom + PX), `${width}px: 신뢰구간 줄이 막대와 겹치지 않는다`);
          assert.ok(line.bottom < layout.axis, `${width}px: 축 위에 있다`);
        }
      }, { width });
    }
  });

  // 근거: 사용자 지적 "상자 그림에서 q1~q3만 커지고 중앙값과 수염은 고정이라 통계가 왜곡된다". 상자, 수염, 중앙값은 한 묶음이 같은 좌표에서 함께 나타나고, 어느 요소도 크기를 바꾸지 않는다.
  test('box_plot_reveals_box_whisker_and_median_together_without_scaling', async () => {
    const svg = await toSvg(await buildFigure(BOX, { baseDir: EXAMPLES }));

    assert.doesNotMatch(svg, /class="chart-box[^"]*grow/);
    const groups = [...svg.matchAll(/<g class="cr-\d+ pop">((?:(?!<\/g>)[^])*)<\/g>/g)];
    assert.ok(groups.length > 0);
    for (const [, inner] of groups) assert.ok(['chart-whisker', 'chart-box', 'chart-median'].every((name) => inner.includes(name)), '한 묶음 안에 수염, 상자, 중앙값이 있다');
  });

  // 근거: 사용자 요구 "시간표가 있는 그림은 모두 재생되고 시간표가 없는 그림만 조작이 없다". 공개 예제를 모두 열어 로드 오류 없음, 장면 탭 줄 유무(장면이 둘 이상일 때만), 재생이 필요한 장면의 시계를 본다.
  test('every_example_loads_and_the_scene_tabs_show_only_for_two_or_more_scenes', async () => {
    const names = readdirSync(EXAMPLES).filter((file) => file.endsWith('.dap')).map((file) => file.replace('.dap', ''));
    assert.ok(names.length > 0, '검사할 공개 예제가 있어야 한다');
    for (const name of names) {
      await withPlayer(readFileSync(join(EXAMPLES, `${name}.dap`), 'utf8'), async (page, result) => {
        const tabs = await page.getByRole('tab').count();
        assert.equal(tabs >= 2, result.timeline.steps.length >= 2, `${name}: 장면 탭 줄과 장면 수가 어긋난다`);
        await page.clock.runFor(800);
        const state = await readState(page);
        const mode = result.timeline.steps[0]?.mode;
        if (mode === 'static' || mode === undefined) assert.equal(state.isPlaying, false, `${name}: 정지 장면이 재생된다`);
        else assert.ok(state.isPlaying || state.ended, `${name}: 재생 장면이 시작되지 않는다`);
      });
    }
  });

  // 근거: 사용자 요구 "재생, 끝 유지, 다시 재생, 단계 이동". 종류별 대표 예제의 첫 장면이 끝까지 한 번 돌고 방식대로 끝난다(once는 끝에 머물고 loop는 끝나지 않는다).
  test('representative_examples_run_their_first_scene_and_end_the_way_its_mode_says', async () => {
    for (const name of ['queue', 'bar', 'sequence', 'architecture']) {
      await withPlayer(readFileSync(join(EXAMPLES, `${name}.dap`), 'utf8'), async (page, result) => {
        const { sliced } = { sliced: result.timeline };
        const display = result.timeline.presentation[0];
        await page.clock.runFor(display + 1000);
        const state = await readState(page);
        const { mode } = result.timeline.steps[0];

        assert.equal(state.scene, 0, `${name}: 끝나도 다른 장면으로 넘어가지 않는다`);
        if (mode === 'once') assert.equal(state.ended, true, `${name}: once 장면이 끝에서 멈추지 않는다`);
        else if (mode === 'loop') assert.equal(state.ended, false, `${name}: loop 장면이 끝났다`);
        else assert.equal(state.isPlaying, false, `${name}: static 장면이 재생된다`);
        assert.ok(sliced.segs.length >= 0);
      });
    }
  });

  // 근거: 사용자 요구 "지나간 경로가 영구 파란색으로 남아 화면을 지배하지 않고 현재 이동만 강하게". 점이 지나는 동안에만 선이 강조색이고 지나간 선은 중립으로 돌아오며, 화살촉은 선의 상태색을 그대로 따른다.
  test('only_the_moving_edge_is_accented_and_arrowheads_follow_the_line', async () => {
    await withPlayer(ONE_MOVE, async (page, result) => {
      // CSS 전환은 가짜 시계가 아니라 실제 시간으로 흐르므로 끄고 계산된 색을 잰다
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      const [hop] = result.timeline.segs[0].hops;
      const stroke = () => page.evaluate((j) => getComputedStyle(document.querySelector(`#e-${j} .fl-path`)).stroke, hop.edge);
      const active = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--color-state-active)'; document.body.append(probe); return getComputedStyle(probe).color; });

      await page.clock.runFor((hop.at ?? 0) + hop.ms / 2);
      assert.equal(await stroke(), active, '지나는 동안은 강조색이다');
      await page.clock.runFor(hop.ms + 2000);
      assert.notEqual(await stroke(), active, '지나간 선은 중립으로 돌아온다');
      const heads = await page.evaluate((j) => {
        const marker = document.querySelector(`#e-${j} marker`);
        const mark = getComputedStyle(marker.querySelector('.fl-arrowhead'));
        const line = Number.parseFloat(getComputedStyle(document.querySelector(`#e-${j} .fl-path`)).strokeWidth);
        const scale = (marker.markerWidth.baseVal.value / marker.viewBox.baseVal.width) * line;
        return { markers: document.querySelectorAll('marker').length, fill: mark.fill, stroke: mark.stroke, headWidth: Number.parseFloat(mark.strokeWidth) * scale, line, lineColor: getComputedStyle(document.querySelector(`#e-${j} .fl-path`)).stroke };
      }, hop.edge);
      assert.equal(heads.markers, result.scene.edges.length, '각 선 안의 화살촉은 그 선의 상태색을 상속한다');
      assert.equal(heads.stroke, heads.lineColor, '화살촉 색은 선 stroke를 그대로 따른다');
      assert.equal(heads.fill, heads.lineColor, '삼각형 면도 관계선 색으로 채운다');
      assert.match(await page.locator('marker .fl-arrowhead').first().getAttribute('d'), /Z$/);
      assert.ok(Math.abs(heads.headWidth - heads.line) < 0.01, `화살촉 실제 굵기 ${heads.headWidth}가 몸통 ${heads.line}과 같다(마커 배율로 이중으로 굵어지지 않는다)`);
    });
  });

  // 근거: 사용자 요구 "본문에 삽입하면 별도 앱처럼 보이고 글자가 본문보다 작다". 본문 폭 720의 iframe에 넣은 흐름 그림은 바탕이 투명하고 가로 넘침이 없으며 도형 이름이 실효 13px 이상으로 읽히고(그림을 줄인 비율까지 곱한 값), 장면 탭은 그림 바로 아래 한 줄이다.
  test('embedded_player_keeps_the_standalone_canvas_surface_and_readable_labels', async () => {
    const source = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "하나" mode=once\n  a -> b time=1s\nscene "둘" mode=once\n  a -> b time=1s\n';
    const result = await buildFigure(source, { baseDir: EXAMPLES });
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'fig.html'), await toHtml(result, 'embedded'));
      writeFileSync(join(folder, 'host.html'), '<body style="margin:0;background:#fff"><div style="width:720px"><iframe id="f" src="fig.html" style="width:720px;height:700px;border:0" allow="fullscreen"></iframe></div>');
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
      await page.goto(`file://${join(folder, 'fig.html')}`);
      const surface = await page.locator('.fl-canvas').evaluate((el) => {
        const css = getComputedStyle(el);
        return { color: css.backgroundColor, radius: css.borderRadius, padding: css.padding };
      });
      await page.goto(`file://${join(folder, 'host.html')}`);
      const frame = page.frames().find((f) => f.url().endsWith('fig.html'));
      await frame.getByRole('tab').first().waitFor();
      await frame.evaluate(() => document.fonts.ready);
      const found = await frame.evaluate(() => {
        const svg = document.querySelector('svg.fl');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const label = document.querySelector('.label');
        const foot = document.querySelector('.fl-foot').getBoundingClientRect();
        const canvas = document.querySelector('.fl-canvas');
        const css = getComputedStyle(canvas);
        return { background: getComputedStyle(document.body).backgroundColor, surface: { color: css.backgroundColor, radius: css.borderRadius, padding: css.padding }, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, label: parseFloat(getComputedStyle(label).fontSize) * scale, canvasBottom: canvas.getBoundingClientRect().bottom, footTop: foot.top, footH: foot.height, full: document.querySelector('.fl-view-tools .fl-full') !== null };
      });

      assert.equal(found.background, 'rgba(0, 0, 0, 0)');
      assert.deepEqual(found.surface, surface);
      assert.ok(found.scroll <= 0);
      assert.ok(found.label >= 13, `도형 이름 실효 ${found.label.toFixed(1)}px`);
      assert.ok(found.footTop - found.canvasBottom < 24 && found.footH < 120, `장면 탭이 그림 바로 아래 한 덩어리다 ${JSON.stringify(found)}`);
      assert.equal(found.full, true, '전체 화면 단추가 도구 막대 안에 있다');
      await page.close();
    });
  });

  // 근거: 사용자 지적 "내부 값 행마다 파란 테두리가 붙어 전체가 선택된 것처럼 보인다". 내용이 찬 카드는 중립이고 안쪽 카드에는 윤곽이 없으며 반지름은 도형 > 카드 > 값 면 순으로 작아진다.
  test('card_stays_neutral_inside_the_node_and_radii_nest', async () => {
    await withPlayer(CARD_FLOW, async (page) => {
      await page.clock.runFor(1500);
      const found = await page.evaluate(() => {
        const read = (el) => { const s = getComputedStyle(el); return { stroke: s.stroke, fill: s.fill, rx: Number(el.getAttribute('rx')) }; };
        const node = document.querySelector('.fl-node:has(.fl-card.filled):has(.fl-flash)');
        const color = (name) => { const probe = document.createElement('i'); probe.style.color = `var(${name})`; document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; };
        return { face: read(node.querySelector(':scope > .fl-stroke')), card: read(node.querySelector('.fl-card')), flashStroke: getComputedStyle(node.querySelector('.fl-flash')).stroke, cardFill: color('--color-card') };
      });

      assert.equal(found.card.stroke, 'none', '내용이 찬 카드에는 안쪽 윤곽이 없다');
      assert.equal(found.card.fill, found.cardFill, '내용이 찬 카드의 면은 중립이다');
      assert.equal(found.flashStroke, 'none', '값이 바뀔 때의 면은 새 테두리를 만들지 않는다');
      assert.ok(found.face.rx > found.card.rx, `반지름이 안쪽으로 갈수록 작다: 도형 ${found.face.rx}, 카드 ${found.card.rx}`);
    });
  });

  // 근거: 카드 자리는 배치에 처음부터 잡히고 이름 묶음은 위쪽 자리에 고정된다. 내용이 들어와도 이름은 움직이지 않고 도형 크기도 변하지 않으며, 이름은 두 상태 모두에서 몸통 안에서 카드와 겹치지 않는다.
  test('card_nodes_keep_their_name_still_inside_the_body_and_clear_of_the_card_when_the_card_content_arrives', async () => {
    // `show` 줄이 도착 박자에 카드 내용을 채운다. 값 줄이 있는 카드는 처음부터 차 있어 이 경우가 아니다.
    const source = 'daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "하나" mode=once\n  a -> b time=1s\n  show b "도착"\n';
    await withPlayer(source, async (page) => {
      const nameBox = () => page.evaluate(() => {
        const node = [...document.querySelectorAll('.fl-node')].find((n) => n.dataset.id === 'b');
        const body = node.querySelector(':scope > .fl-stroke').getBoundingClientRect();
        const name = node.querySelector('.label').getBoundingClientRect();
        const card = node.querySelector('.fl-card').getBoundingClientRect();
        return { body: { top: body.top, bottom: body.bottom, left: body.left, right: body.right }, name: { top: name.top, bottom: name.bottom, left: name.left, right: name.right }, cardTop: card.top, hasCard: card.height > 0 };
      });
      const empty = await nameBox();
      await page.clock.runFor(1500);
      const filled = await nameBox();

      assert.ok(empty.hasCard && filled.hasCard, '카드 자리는 내용이 오기 전에도 잡혀 있다');
      for (const [state, found] of [['비어 있는 동안', empty], ['내용이 들어온 뒤', filled]]) {
        assert.ok(found.name.top >= found.body.top - PX && found.name.bottom <= found.body.bottom - PX, `${state} 이름이 몸통 안에 든다 ${JSON.stringify(found)}`);
        assert.ok(found.name.left >= found.body.left - PX && found.name.right <= found.body.right + PX, `${state} 이름이 몸통 가로 안에 든다`);
        assert.ok(found.name.bottom <= found.cardTop + PX, `${state} 이름이 카드 자리와 겹치지 않는다 ${JSON.stringify(found)}`);
      }
      assert.ok(Math.abs(filled.name.top - empty.name.top) <= PX && Math.abs(filled.name.bottom - empty.name.bottom) <= PX, `내용이 들어와도 이름 자리는 그대로다 ${JSON.stringify([empty.name, filled.name])}`);
      assert.ok(Math.abs(filled.body.bottom - filled.body.top - (empty.body.bottom - empty.body.top)) <= PX / 10, '도형 크기는 변하지 않는다');
    });
  });

  // 근거: 사용자 요구 "임의로 높이를 줄여 뒤 단계가 넘치지 않게, 모든 단계 검증". 예제 모두에서 카드가 있는 도형의 이름 묶음은 위쪽 자리에서 카드와 겹치지 않고 몸통 안에 있다.
  test('every_example_node_with_a_card_keeps_its_name_clear_of_the_card_and_inside_the_body', async () => {
    for (const file of readdirSync(EXAMPLES).filter((name) => name.endsWith('.dap'))) {
      const { scene } = await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES });
      for (const it of scene?.items.filter((item) => item.card && item.shape !== 'person' && item.shape !== 'table') ?? []) {
        const rows = labelRows(it);
        const bottom = rows.at(-1).center + rows.at(-1).style.line / 2;

        assert.ok(bottom <= cardBox(it).y + PX, `${file} ${it.id}: 이름이 카드와 겹친다`);
        assert.ok(bottom <= it.y + it.h - PX, `${file} ${it.id}: 이름이 몸통 밖이다 (${bottom} > ${it.y + it.h})`);
      }
    }
  });

  // 근거: docs/design/expression-coverage.md 요구사항, layout.md 좁은 화면. 모든 공개 예제의 장면과 테마를 폭 390, 768, 1280에서 검사한다: 문서는 가로로 넘치지 않고 좁은 폭에서 글자는 줄지 않으며, 판 안에서 밀어야 할 때만 안내를 보인다.
  test('figures_keep_mobile_text_readable_with_scroll_only_inside_the_canvas', async () => {
    for (const name of readdirSync(EXAMPLES).filter((file) => file.endsWith('.dap')).map((file) => file.slice(0, -4))) {
      const result = await buildFigure(readFileSync(join(EXAMPLES, `${name}.dap`), 'utf8'), { baseDir: EXAMPLES });
      await withPage(browser, await toHtml(result, 'fit'), { viewport: { width: WIDTHS[0], height: 900 } }, async (page) => {
        for (const colorScheme of ['light', 'dark']) for (const width of WIDTHS) {
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => dispatchEvent(new Event('resize')));
          const tabs = page.getByRole('tab');
          const scenes = Math.max(1, await tabs.count());
          for (let scene = 0; scene < scenes; scene += 1) {
            if ((await tabs.count()) > 0) await tabs.nth(scene).click();
            const fit = await page.evaluate(() => {
              const canvasEl = document.querySelector('.fl-canvas');
              const canvas = canvasEl.getBoundingClientRect();
              const minText = Math.min(...[...document.querySelectorAll('.dp-panel svg text')].map((el) => parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a));
              const panelScrolls = [...document.querySelectorAll('.dp-panel')].some((panel) => panel.scrollWidth - panel.clientWidth > 1);
              return { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, inner: canvasEl.scrollWidth - canvasEl.clientWidth, canvasWidth: canvas.width, minText, panelScrolls, hint: !document.querySelector('.fl-scroll-hint').hidden };
            });
            const context = `${name} ${colorScheme} ${width} scene ${scene + 1}`;
            assert.ok(fit.scroll <= 0 && fit.canvasWidth <= width, `${context}: 문서 가로 넘침 ${JSON.stringify(fit)}`);
            if (width === WIDTHS[0]) assert.ok(fit.minText >= MIN_TEXT_PX, `${context}: 글자 축소 ${JSON.stringify(fit)}`);
            if (fit.inner > 1 || fit.panelScrolls) assert.ok(fit.hint, `${context}: 넓은 그림의 이동 안내 ${JSON.stringify(fit)}`);
          }
        }
      });
    }
  });
});
