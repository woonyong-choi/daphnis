// 컴파일러가 만든 실제 재생 문서(daphnis 2 원본 → buildFigure → toHtml)를 실제 Chrome으로 재는 시험.
// 손으로 적은 정본 시간표(test/player-fixture.js)로 잰 재생기 계약을 같은 계약의 컴파일러 출력에서 다시 잰다: 여러 판, 같은 카드 여러 곳, 차트 여러 개, 사라지는 점, 같은 선 역방향, 같은 순간 순변화 없음, 전체 화면, 좁은 배치.
// 가짜 시계는 문서를 열기 전에 멈춰 두므로(chrome.js) 첫 상태는 늘 시간 0이다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { FRAME_MS, launchChrome, readState, withPage } from './chrome.js';
import { MIXED, playerHtml } from './player-compiled.js';

const STEP_MS = 16;
// 가짜 시계 기준 장면 시각 오차(한 프레임)
const LAG_MS = 2 * FRAME_MS;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} != ${expected}`);
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
// 화면 폭을 바꾸고 브라우저가 resize 알림을 낼 때까지 기다린다(알림에서 재생기가 배치를 고른 뒤 이 알림이 이어서 불린다). 폭이 이미 같으면 알림이 없으므로 기다리지 않는다.
const resizeTo = async (page, width) => {
  const resized = page.evaluate((wanted) => (innerWidth === wanted ? undefined : new Promise((resolve) => addEventListener('resize', resolve, { once: true }))), width);
  await page.setViewportSize({ width, height: 800 });
  await resized;
};

// 장면 둘의 막대 차트 둘(c1은 둘째 계열을 장면에서 드러내고 행을 밝힌다, c2는 값만 따른다)과 값 하나가 모든 판에 걸쳐 바뀌는 그림.
const CHARTS = [
  'daphnis 2',
  'box t "T"',
  'box s "S"',
  'value n "N" on=s from=1',
  'chart c1 "첫째" bar {',
  '  series a "A"',
  '  series b "B"',
  '  row "r1" a=2 b=n',
  '  row "r2" a=3 b=1',
  '}',
  'chart c2 "둘째" bar {',
  '  series a "A"',
  '  row "r1" a=n',
  '  row "r2" a=4',
  '}',
  'view main graph right {',
  '  t',
  '  s',
  '  c1',
  '}',
  'view first plot "첫째" {',
  '  c1',
  '}',
  'view second plot "둘째" {',
  '  c2',
  '}',
  't -> s',
  'scene "공개" mode=once',
  '  t -> s time=500ms set="n+1"',
  '  reveal c1.b',
  '  light c1 "r1"',
  'scene "다음" mode=once',
  '  t -> s time=500ms',
  '',
].join('\n');

// 사라지는 점 하나가 있는 흐름 장면
const LOST = ['daphnis 2', 'box a "A"', 'box b "B"', 'box c "C"', 'a -> b', 'b -> c', 'scene "손실" mode=once for=4s', '  track a -> b -> c lost=20% time=1s', ''].join('\n');
// 같은 선을 순방향과 역방향으로 동시에 지나는 두 점
const REVERSE = ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b', 'scene "역방향" mode=once', '  a -> b time=1s & b -> a time=1s', ''].join('\n');
// 같은 순간에 +1과 -1이 도착해 값이 변하지 않는 그림
const NET_ZERO = ['daphnis 2', 'box a "A"', 'box b "B"', 'value n "N" on=b from=5', 'a -> b', 'scene "순변화 없음" mode=once', '  a -> b time=500ms set="n+1" & a -> b time=500ms set="n-1"', ''].join('\n');
// 순서 보기의 생명선, 메모, 구획, 활성이 모두 있는 그림
const SEQUENCE = [
  'daphnis 2',
  'person u "사용자"',
  'box s "서버"',
  'store d "DB"',
  'view calls sequence "호출" {',
  '  u',
  '  s',
  '  d',
  '}',
  'scene "흐름" mode=once',
  '  u -> s "요청" time=500ms',
  '  note s "처리 중"',
  '  activate s',
  '  fragment alt "분기" choose="성공" {',
  '    branch "성공" {',
  '      s -> d "저장" time=500ms',
  '    }',
  '    branch "실패" {',
  '      s -> u "오류" time=500ms dashed',
  '    }',
  '  }',
  '  s -> u "완료" time=500ms',
  '  deactivate s',
  '',
].join('\n');
// 도착 후광이 닿을 수 있는 모든 도형 종류
const SHAPES = [
  'daphnis 2',
  'person p "사람"',
  'box b "상자"',
  'external e "외부"',
  'store s "저장소"',
  'decision d "갈림"',
  'queue q "큐" slots=3',
  'state st "상태"',
  'group g "그룹" {',
  '  box gb "안"',
  '}',
  'table tb "테이블" {',
  '  id int pk',
  '}',
  'api ap "GET /x" {',
  '  id int',
  '}',
  'class cl "클래스" {',
  '  field a "int"',
  '}',
  'grid gr "격자" {',
  '  item x "엑스"',
  '}',
  'chart ch "차트" bar {',
  '  series a "A"',
  '  row "r" a=1',
  '}',
  '',
].join('\n');
// 가로로 길어 좁은 화면에서 좁은 배치로 바뀌는 그래프 하나
const REFLOW = ['daphnis 2', 'aspect 4', ...Array.from({ length: 6 }, (_, i) => `box n${i} "서비스 ${i} 이름"`), ...Array.from({ length: 5 }, (_, i) => `n${i} -> n${i + 1} "메시지 ${i}"`), 'value n "N" on=n1 from=0', 'on n1 n+1', 'scene "흐름" mode=loop', '  n0 -> n1 time=600ms', '  n1 -> n2 time=600ms', ''].join('\n');

describe('player compiled documents', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 판 구조. 그래프, 순서, 차트 판이 각각 구역이고, 같은 논리 카드가 둘 이상의 판에 그려지며 도형 번호(#n-번호)는 겹치지 않는다
  test('mixed_document_draws_each_panel_as_its_own_section_with_unique_instance_ids', async () => {
    const { html, result } = await playerHtml(MIXED);
    await withPage(browser, html, {}, async (page) => {
      const structure = await page.evaluate(() => ({
        views: [...document.querySelectorAll('.dp-panel')].map((panel) => [panel.dataset.view, panel.dataset.strategy, panel.querySelectorAll(':scope > svg').length, panel.querySelectorAll('.fl-packets').length]),
        ids: [...document.querySelectorAll('[id]')].map((el) => el.id),
        instances: Object.fromEntries(['web', 'api', 'db'].map((id) => [id, [...document.querySelectorAll(`.fl-node[data-id="${id}"]`)].map((el) => el.id)])),
        charts: [...document.querySelectorAll('[data-chart="load"]')].map((el) => el.closest('.dp-panel').dataset.view),
        toolbarInPanels: document.querySelectorAll('.dp-panel .fl-view-tools').length,
      }));
      assert.deepEqual(structure.views, [['main', 'graph', 1, 1], ['calls', 'sequence', 1, 1], ['chart', 'plot', 1, 1]]);
      assert.equal(new Set(structure.ids).size, structure.ids.length, '문서 전체에서 id가 겹친다');
      for (const id of ['web', 'api', 'db']) assert.equal(structure.instances[id].length, 2, `${id}는 그래프와 순서 두 판에 있다`);
      assert.deepEqual(structure.charts, ['main', 'chart'], '같은 차트가 그래프 카드와 차트 판에 있다');
      assert.equal(structure.toolbarInPanels, 0);
      // 장면의 판 정보와 같은 판 상자가 viewBox다
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.dp-panel > svg')].map((svg) => svg.getAttribute('viewBox')));
      assert.deepEqual(boxes, result.scene.panels.map(({ box }) => `${Math.round(box.x * 100) / 100} ${Math.round(box.y * 100) / 100} ${Math.round(box.w * 100) / 100} ${Math.round(box.h * 100) / 100}`.replace(/(\.\d*?)0+(?= |$)/g, '$1').replace(/\.(?= |$)/g, '')));
    });
  });

  // 근거: 판 나누기는 그려진 요소를 빠뜨리지 않는다. 번호가 없는 요소(생명선, 메모, 구획, 활성)도 자기 판에 들어간다
  test('splitting_into_panels_keeps_every_sequence_lifeline_note_fragment_and_activation', async () => {
    const { html, result } = await playerHtml(SEQUENCE);
    const { scene } = result;
    await withPage(browser, html, {}, async (page) => {
      const counts = await page.evaluate(() => ({
        lifelines: document.querySelectorAll('.lifeline').length,
        notes: document.querySelectorAll('.fl-note').length,
        fragments: document.querySelectorAll('.fl-fragment').length,
        activations: document.querySelectorAll('.fl-activation').length,
        nodes: document.querySelectorAll('.fl-node').length,
        edges: document.querySelectorAll('.fl-edge').length,
        outside: document.querySelectorAll('.dp-panels > :not(.dp-panel)').length,
      }));
      assert.deepEqual(counts, { lifelines: scene.lifelines.length, notes: scene.notes.length, fragments: scene.fragments.length, activations: scene.activations.length, nodes: scene.items.length, edges: counts.edges, outside: 0 });
      assert.ok(scene.lifelines.length > 0 && scene.notes.length > 0 && scene.fragments.length > 0 && scene.activations.length > 0);
      assert.ok(counts.edges >= scene.edges.length);
    });
  });

  // 근거: 도착 후광은 도형의 기존 윤곽 요소만 복제한다. 모든 도형 종류(저장소처럼 윤곽이 여럿인 것 포함)가 윤곽을 갖고, 겹침 선은 윤곽과 같은 모양과 굵기이며 면이 없다
  test('every_node_shape_has_outline_elements_to_clone_and_the_overlay_copies_only_them', async () => {
    const { html } = await playerHtml(SHAPES);
    await withPage(browser, html, {}, async (page) => {
      const shapes = await page.evaluate(() =>
        [...document.querySelectorAll('.fl-node')].map((node, i) => {
          const strokes = [...node.querySelectorAll(':scope > .fl-stroke')];
          const before = strokes.map((el) => getComputedStyle(el).strokeWidth + getComputedStyle(el).fill);
          const overlays = overlayOf(window.probe.stage, i);
          const after = [...node.querySelectorAll(':scope > .fl-stroke')].map((el) => getComputedStyle(el).strokeWidth + getComputedStyle(el).fill);
          const clone = (el, copy) => ['x', 'y', 'width', 'height', 'rx', 'd', 'cx', 'cy', 'r'].every((name) => el.getAttribute(name) === copy.getAttribute(name));
          return {
            shape: node.getAttribute('class').replace('fl-node fl-shape-', ''),
            strokes: strokes.length,
            overlays: overlays.length,
            same: overlays.every((copy, k) => clone(strokes[k], copy) && getComputedStyle(copy).fill === 'none' && getComputedStyle(copy).strokeWidth === getComputedStyle(strokes[k]).strokeWidth && !copy.id && copy.getAttribute('opacity') === '0'),
            untouched: JSON.stringify(before) === JSON.stringify(after),
            children: node.children.length,
          };
        }),
      );
      assert.ok(shapes.length >= 13);
      for (const item of shapes) {
        assert.ok(item.strokes >= 1, `${item.shape}: 윤곽 요소가 없다`);
        assert.equal(item.overlays, item.strokes, `${item.shape}: 윤곽마다 겹침 선 하나`);
        assert.equal(item.same, true, `${item.shape}: 겹침 선이 윤곽과 다르다`);
        assert.equal(item.untouched, true, `${item.shape}: 윤곽의 굵기나 면이 바뀌었다`);
      }
      assert.ok(shapes.some((item) => item.strokes > 1), '윤곽이 여럿인 도형(저장소)이 있다');
    });
  });

  // 근거: 같은 논리 사건은 하나이고 모든 그림이 같다. 값이 바뀌면 값 글자, 차트 틀, 후광이 그래프 카드와 차트 판에서 같은 시각에 같은 모습이다
  test('mixed_document_keeps_value_and_chart_instances_synchronized_through_a_scene', async () => {
    const { html } = await playerHtml(MIXED);
    await withPage(browser, html, {}, async (page) => {
      const read = () =>
        page.evaluate(() => ({
          values: [...document.querySelectorAll('[data-v="0"]')].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.textContent),
          bars: [...document.querySelectorAll('[data-chart="load"]')].map((root) => [...root.querySelectorAll('[data-mark-text]')].map((el) => el.textContent).join(',')),
          pulses: [...document.querySelectorAll('[data-chart="load"] [data-pulse]')].map((el) => Number(el.style.getPropertyValue('--pulse'))),
        }));
      const first = await read();
      assert.deepEqual(first.values, ['2'], '값 글자 요소는 값마다 카드에 하나다');
      assert.equal(first.bars.length, 2);
      assert.equal(first.bars[0], first.bars[1], '두 차트 그림이 같다');
      const seen = new Set();
      for (let elapsed = 0; elapsed < 5000; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        const frame = await read();
        assert.equal(frame.bars[0], frame.bars[1], `${elapsed}ms: 두 차트 그림이 서로 다르다`);
        assert.ok(frame.pulses.length % 2 === 0, `${elapsed}ms: 차트 표 후광이 한쪽에만 있다`);
        assert.equal(new Set(frame.pulses).size <= 2, true);
        for (const text of frame.bars[0].split(',')) seen.add(text);
        for (const value of frame.values) seen.add(`v${value}`);
      }
      assert.ok(seen.has('v3'), '값이 3으로 바뀌었다');
      assert.ok([...seen].some((text) => /(^|,)3(,|$)/.test(text)), '차트 막대 글자도 3으로 바뀌었다');
    });
  });

  // 근거: 장면 진입. 장면에 들어서면 시간 0이고 값이 처음 값이며 차트가 처음 틀이다. 다른 장면의 마지막 틀이 남지 않는다
  test('mixed_document_scene_entry_resets_values_and_chart_frames_and_static_shows_the_final', async () => {
    const { html } = await playerHtml(MIXED);
    await withPage(browser, html, {}, async (page) => {
      const marks = () => page.evaluate(() => [...document.querySelectorAll('[data-chart="load"]')].map((root) => [...root.querySelectorAll('[data-mark-text]')].map((el) => el.textContent).join(',')));
      const initial = await marks();
      await page.clock.runFor(4000);
      const changed = await marks();
      assert.notDeepEqual(changed, initial, '한 번 장면이 값을 올려 차트가 바뀐다');
      await tab(page, '정지').click();
      const staticScene = await readState(page);
      assert.deepEqual([staticScene.isPlaying, staticScene.ended, staticScene.phase, staticScene.elapsed], [false, true, 'final', staticScene.elapsed]);
      assert.deepEqual(await marks(), initial, '값을 바꾸지 않는 장면은 처음 틀로 들어선다');
      await tab(page, '한 번').click();
      assert.deepEqual([(await readState(page)).elapsed, await marks()], [0, initial]);
      await tab(page, '반복').click();
      const loop = await readState(page);
      assert.deepEqual([loop.scene, loop.isPlaying], [2 - 1, true]);
    });
  });

  // 근거: 차트 여럿. 차트마다 따로 움직인다. 한 차트의 계열 드러내기와 밝히기가 다른 차트로 번지지 않고, 같은 차트가 여러 판에 있으면 모두 같이 움직인다
  test('multiple_charts_move_independently_per_chart_id', async () => {
    const { html, result } = await playerHtml(CHARTS);
    assert.deepEqual(Object.keys(result.scene.chartFrames).sort(), ['c1', 'c2']);
    assert.deepEqual(Object.keys(result.timeline.segs[0].charts).sort(), ['c1', 'c2']);
    await withPage(browser, html, {}, async (page) => {
      const state = () =>
        page.evaluate(() => {
          const series = (id) => [...document.querySelectorAll(`[data-chart="${id}"] [class*="cs-"]`)].map((el) => [el.getAttribute('class').match(/cs-\d+/)[0], el.classList.contains('hidden')]);
          const dim = (id) => [...document.querySelectorAll(`[data-chart="${id}"] [class*="cr-"]`)].filter((el) => el.classList.contains('dim')).length;
          return { c1: series('c1'), c2: series('c2'), dimC1: dim('c1'), dimC2: dim('c2'), copies: document.querySelectorAll('[data-chart="c1"]').length };
        });
      const hiddenOf = (list, name) => list.filter(([cls]) => cls === name).map(([, isHidden]) => isHidden);
      const frames = [];
      for (let elapsed = 0; elapsed < 9000; elapsed += 50) {
        await page.clock.runFor(50);
        frames.push({ d: (await readState(page)).d, ...(await state()) });
      }
      assert.equal(frames[0].copies, 2, '첫째 차트는 그래프 카드와 차트 판 두 곳에 있다');
      // c1의 계열 b(cs-1)는 장면 처음에 숨고 reveal 박자에 보인다. 계열 a(cs-0)는 늘 보인다. 두 판의 같은 차트는 같이 움직인다.
      assert.deepEqual([...new Set(frames[0].c1.map(([, isHidden]) => isHidden).filter((x, i) => frames[0].c1[i][0] === 'cs-1'))], [true], '장면 처음에 계열 b가 모두 숨는다');
      assert.equal(hiddenOf(frames[0].c1, 'cs-0').includes(true), false);
      const last = frames.at(-1);
      assert.equal(hiddenOf(last.c1, 'cs-1').includes(true), false, 'reveal 뒤에는 계열 b가 모두 보인다');
      for (const frame of frames) assert.equal(new Set(hiddenOf(frame.c1, 'cs-1')).size, 1, `${frame.d}ms: 같은 차트의 두 그림이 다르게 움직였다`);
      // c2는 reveal이 없어 계열이 늘 보이고 행이 흐려지지 않는다
      for (const frame of frames) assert.deepEqual([frame.c2.some(([, isHidden]) => isHidden), frame.dimC2], [false, 0], `${frame.d}ms: c1의 움직임이 c2로 번졌다`);
      // light c1 "r1": 나머지 행(r2)이 흐려진다. 두 판의 같은 차트가 함께 흐려진다.
      assert.ok(frames.some((frame) => frame.dimC1 > 0 && frame.dimC1 % 2 === 0), '밝히기가 c1의 나머지 행을 흐리게 했다');
      await tab(page, '다음').click();
      const next = await state();
      assert.deepEqual([next.dimC1, next.c1.some(([, isHidden]) => isHidden)], [0, false], '밝히기와 숨김은 장면 안에서만이다');
    });
  });

  // 근거: 사라지는 점. 사라진 점은 선에서 사라지는 시각에 떠나고 이후 선이나 도형 후광을 만들지 않으며, 잘린 점 이후 알약이 400ms 줄어든다
  test('lost_packet_is_cut_on_the_edge_and_never_pulses_a_node_it_did_not_reach', async () => {
    const { html, result } = await playerHtml(LOST);
    const [seg] = result.timeline.segs;
    assert.equal(seg.pulses.length, 0, '20%에서 사라진 점은 첫 도형 b에 들어서기 전(27%)에 떠나 어느 도형에도 닿지 않는다');
    assert.ok(seg.hops[0].cut !== undefined && seg.hops[0].cut < seg.hops[0].ms);
    await withPage(browser, html, {}, async (page) => {
      let activeUntil = 0;
      let anyOverlay = 0;
      let lastActive = -1;
      for (let elapsed = 0; elapsed < 2500; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        const state = await readState(page);
        anyOverlay += state.overlays.filter(Boolean).length;
        const active = await page.evaluate(() => [...document.querySelectorAll('.fl-edge.is-current')].length);
        if (active) lastActive = state.d;
        activeUntil = Math.max(activeUntil, active);
      }
      assert.equal(anyOverlay, 0, '도형 후광이 없다');
      assert.ok(lastActive <= seg.hops[0].cut + LAG_MS + STEP_MS, `점이 잘린 ${seg.hops[0].cut}ms 뒤에도 선이 켜져 있다(${lastActive})`);
      assert.ok(activeUntil > 0);
    });
  });

  // 근거: 여러 선을 지나는 흐름. 시간표가 주는 구간별 선(hop.legEdges)대로 점이 그 선에 있는 동안만 그 선이 켜진다(모든 선을 이동 내내 켜는 근사가 아니다)
  test('a_flow_track_lights_each_leg_edge_only_while_the_packet_is_on_it', async () => {
    const source = ['daphnis 2', 'box a "A"', 'box b "B"', 'box c "C"', 'a -> b', 'b -> c', 'scene "흐름" mode=once for=4s', '  track a -> b -> c time=2s', ''].join('\n');
    const { html, result } = await playerHtml(source);
    const [hop] = result.timeline.segs[0].hops;
    assert.deepEqual(hop.legEdges, [0, 1], '시간표가 구간별 선을 준다');
    await withPage(browser, html, {}, async (page) => {
      const current = () => page.evaluate(() => [0, 1].map((j) => document.querySelector(`#e-${j}`).classList.contains('is-current')));
      const seen = { first: new Set(), second: new Set() };
      for (let elapsed = 0; elapsed < 2100; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        const { d } = await readState(page);
        // 이동 곡선 때문에 시간 비율과 길이 비율이 다르다. 곡선을 시험이 다시 풀지 않고, 길이 비율이 확실히 첫 구간과 둘째 구간 안인 처음과 끝 시각만 읽는다.
        if (d < 150) seen.first.add(JSON.stringify(await current()));
        if (d > hop.ms - 150 && d < hop.ms - 20) seen.second.add(JSON.stringify(await current()));
      }
      assert.deepEqual([...seen.first], ['[true,false]'], '처음에는 첫 선만 켜진다');
      assert.deepEqual([...seen.second], ['[false,true]'], '끝에는 둘째 선만 켜진다');
    });
  });

  // 근거: 고정 알약. 컴파일러가 만든 문서에서도 보통 알약은 어느 프레임에서도 투명해지지 않고, 활성 색(--pill-tint)이 점이 떠난 뒤 400ms 동안 선형으로 줄어든다
  test('compiled_normal_pill_never_turns_transparent_and_its_tint_decays_after_the_packet_leaves', async () => {
    const source = ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b "요청"', 'scene "흐름" mode=once', '  a -> b time=1s', ''].join('\n');
    const { html } = await playerHtml(source);
    await withPage(browser, html, {}, async (page) => {
      const quiet = await page.evaluate(() => document.querySelector('#l-0').classList.contains('quiet'));
      assert.equal(quiet, false, '보통 알약이다');
      const frames = [];
      for (let elapsed = 0; elapsed < 1800; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        frames.push({ d: (await readState(page)).d, ...(await page.evaluate(() => ({ opacity: getComputedStyle(document.querySelector('#l-0')).opacity, textOpacity: getComputedStyle(document.querySelector('#l-0 .edgelabel')).opacity, tint: Number(document.querySelector('#l-0').style.getPropertyValue('--pill-tint')), current: document.querySelector('#e-0').classList.contains('is-current') }))) });
      }
      assert.deepEqual([...new Set(frames.flatMap((f) => [f.opacity, f.textOpacity]))], ['1']);
      for (const f of frames.filter((x) => x.d > 40 && x.d < 960)) assert.deepEqual([f.current, f.tint], [true, 1], `${f.d}ms`);
      for (const f of frames.filter((x) => x.d > 1040 && x.d < 1380)) near(f.tint, 1 - (f.d - 1000) / 400, `${f.d}ms`);
      // 표시 길이는 이동 1000ms + 효과 꼬리 400ms = 1400ms다. 꼬리가 끝나면 한 번 장면은 마지막 모습에 서고 알약은 중립이다(투명하지 않고 활성 색만 0).
      assert.ok(frames.some((f) => f.d >= 1400 && f.tint === 0), '400ms 뒤에는 중립이다');
      assert.deepEqual([...new Set(frames.filter((f) => f.d >= 1400).map((f) => f.current))], [false]);
    });
  });

  // 근거: 도형 상태 알약은 논리 id로 찾고 그 장면에서만 보인다
  test('scene_status_pills_show_only_in_their_scene_by_logical_id', async () => {
    const source = ['daphnis 2', 'box a "A"', 'box b "B"', 'a -> b', 'scene "정상" mode=static status="a=ok"', '  a -> b time=300ms', 'scene "장애" mode=static status="b=fail"', '  a -> b time=300ms', ''].join('\n');
    const { html } = await playerHtml(source);
    await withPage(browser, html, {}, async (page) => {
      const shown = () => page.evaluate(() => [...document.querySelectorAll('.fl-status')].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.st));
      assert.deepEqual(await shown(), ['a-ok']);
      await tab(page, '장애').click();
      assert.deepEqual(await shown(), ['b-fail']);
    });
  });

  // 근거: 반복. 컴파일러가 만든 반복 장면은 표시 길이마다 처음으로 돌아가고 시계는 절대 시각으로 흐르며 같은 시각이면 같은 모습이다
  test('compiled_loop_scene_wraps_by_the_presentation_length_without_drift', async () => {
    const { html } = await playerHtml(MIXED);
    await withPage(browser, html, {}, async (page) => {
      await tab(page, '반복').click();
      const total = await page.evaluate(() => window.probe.scenes[window.probe.scene].presentationMs);
      assert.ok(total > 0);
      const snapshot = () => page.evaluate(() => ({ d: window.probe.frame.d, values: [...document.querySelectorAll('[data-v][opacity="1"]')].map((el) => el.textContent), seg: window.probe.frame.seg }));
      await page.clock.runFor(total * 3 + 250);
      const state = await readState(page);
      assert.ok(state.elapsed > total * 3, '시계는 되돌리지 않는 절대 시각이다');
      near(state.d, state.elapsed % total, '표시 시각이 절대 시각의 나머지다');
      const now = await snapshot();
      assert.ok(now.d < total);
      // 흐른 시각과 그 나머지는 같은 모습이고, 몇 바퀴 앞이나 뒤여도 같다(앞서 샘플한 시각에 기대지 않는다)
      const frames = await page.evaluate(({ elapsed, length }) => {
        const { scenes, scene, data } = window.probe;
        const at = (x) => JSON.stringify(sampleScene(scenes[scene], data, x));
        return [at(elapsed), at(elapsed % length), at((elapsed % length) + length * 7)];
      }, { elapsed: state.elapsed, length: total });
      assert.equal(frames[0], frames[1]);
      assert.equal(frames[1], frames[2]);
      assert.equal((await readState(page)).isPlaying, true);
    });
  });

  // 근거: 같은 선의 역방향. 순방향과 역방향 점은 같은 물리 선을 쓰고 선은 두 점이 모두 떠날 때까지 켜져 있다
  test('reverse_hops_share_the_physical_edge_and_keep_it_active_while_either_is_live', async () => {
    const { html, result } = await playerHtml(REVERSE);
    const [seg] = result.timeline.segs;
    assert.equal(seg.hops.length, 2);
    assert.equal(seg.hops[0].edge, seg.hops[1].edge);
    assert.deepEqual(seg.hops.map((hop) => hop.isBack).sort(), [false, true]);
    await withPage(browser, html, {}, async (page) => {
      for (let elapsed = 0; elapsed < 900; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        const packets = (await readState(page)).packets;
        const current = await page.evaluate(() => document.querySelectorAll('.fl-edge.is-current').length);
        assert.equal(packets, 2, `${elapsed}ms: 두 점이 한 선에 올라 있다`);
        assert.ok(current >= 1, `${elapsed}ms: 선이 꺼졌다`);
      }
    });
  });

  // 근거: 같은 순간의 순변화 없음. 같은 시각에 +1과 -1이 도착해 값이 처음 글로 돌아오면 값은 한 번도 바뀐 것이 아니고 후광이 없다
  test('same_tick_net_zero_value_update_has_no_pulse_and_never_shows_a_changed_value', async () => {
    const { html, result } = await playerHtml(NET_ZERO);
    assert.deepEqual(result.timeline.pulses.filter(({ key }) => key.startsWith('value:')), [], '시간표가 순변화 없음을 후광으로 만들지 않았다');
    await withPage(browser, html, {}, async (page) => {
      for (let elapsed = 0; elapsed < 2500; elapsed += STEP_MS) {
        await page.clock.runFor(STEP_MS);
        const frame = await page.evaluate(() => ({ texts: [...document.querySelectorAll('[data-v="0"][opacity="1"]')].map((el) => el.textContent), flash: [...document.querySelectorAll('[data-vf="0"]')].map((el) => Number(el.getAttribute('opacity'))) }));
        assert.deepEqual(frame.texts, ['5'], `${elapsed}ms: 값이 바뀌어 보였다`);
        assert.deepEqual(frame.flash.filter(Boolean), [], `${elapsed}ms: 순변화 없는 값에 후광이 켜졌다`);
      }
    });
  });

  // 근거: 전체 화면과 확대. 전체 화면은 장면과 시계를 되감지 않고, 확대·축소·전체 보기는 판 묶음 폭만 바꾸며 점과 후광이 계속 같은 시각의 모습이다
  test('fullscreen_and_zoom_preserve_scene_and_elapsed_time_in_a_multi_panel_document', async () => {
    const { html } = await playerHtml(MIXED);
    await withPage(browser, html, {}, async (page) => {
      await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
      await page.clock.runFor(900);
      const before = await readState(page);
      const normalWidth = await page.evaluate(() => document.querySelector('.dp-panels').getBoundingClientRect().width);
      await page.getByRole('button', { name: '전체 화면', exact: true }).click();
      const full = await readState(page);
      assert.deepEqual([full.full, full.scene, full.seg, full.elapsed], [true, before.scene, before.seg, before.elapsed]);
      const fit = await page.evaluate(() => {
        const [canvas, panels] = [document.querySelector('.fl-canvas'), document.querySelector('.dp-panels')];
        const [c, p] = [canvas.getBoundingClientRect(), panels.getBoundingClientRect()];
        return { insideX: p.width <= c.width + 1, insideY: p.height <= c.height + 1, zoomed: document.querySelector('.fl-figure').classList.contains('zoomed') };
      });
      assert.deepEqual(fit, { insideX: true, insideY: true, zoomed: false }, '전체 화면은 그림 전체가 영역에 들어간다');
      await page.getByRole('button', { name: '확대', exact: true }).click();
      await page.getByRole('button', { name: '확대', exact: true }).click();
      const zoomed = await page.evaluate(() => ({ width: document.querySelector('.dp-panels').getBoundingClientRect().width, zoomed: document.querySelector('.fl-figure').classList.contains('zoomed'), scroll: document.querySelector('.fl-canvas').scrollHeight > document.querySelector('.fl-canvas').clientHeight || document.querySelector('.fl-canvas').scrollWidth > document.querySelector('.fl-canvas').clientWidth }));
      assert.ok(zoomed.zoomed && zoomed.scroll, JSON.stringify(zoomed));
      await page.clock.runFor(300);
      const moved = await readState(page);
      assert.ok(moved.elapsed - full.elapsed > 300 - LAG_MS - 1 && moved.scene === before.scene, '확대 중에도 시계가 흐른다');
      await page.getByRole('button', { name: '전체 보기', exact: true }).click();
      assert.equal(await page.evaluate(() => document.querySelector('.fl-figure').classList.contains('zoomed')), false);
      await page.getByRole('button', { name: '전체 화면 끝내기', exact: true }).click();
      const closed = await readState(page);
      assert.deepEqual([closed.full, closed.scene], [false, before.scene]);
      assert.ok(Math.abs(await page.evaluate(() => document.querySelector('.dp-panels').getBoundingClientRect().width) - normalWidth) < 1, '닫으면 문서 안 폭으로 돌아온다');
      assert.ok(closed.elapsed >= moved.elapsed);
    });
  });

  // 근거: 좁은 배치. 화면 폭이 줄어 좁은 배치로 바뀌어도 장면, 절대 시각, 값이 그대로이고 새 그림이 지금 시각의 모습으로 다시 그려진다
  test('responsive_reflow_swap_preserves_scene_elapsed_and_the_current_frame', async () => {
    const { html } = await playerHtml(REFLOW);
    await withPage(browser, html, { viewport: { width: 1200, height: 800 } }, async (page) => {
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout ?? 'wide'), 'wide');
      await page.clock.runFor(1000);
      const before = await readState(page);
      const wideNodes = await page.evaluate(() => document.querySelectorAll('.fl-node').length);
      await resizeTo(page, 390);
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout), 'narrow');
      const after = await readState(page);
      assert.deepEqual([after.scene, after.elapsed, after.isPlaying], [before.scene, before.elapsed, before.isPlaying]);
      assert.equal(await page.evaluate(() => document.querySelectorAll('.fl-node').length), wideNodes);
      const frameNow = await page.evaluate(() => window.probe.frame.d);
      near(frameNow, before.d);
      // 새 그림이 지금 시각의 점을 그린다(점 층이 비어 있지 않다)
      assert.equal((await readState(page)).packets, before.packets);
      await page.clock.runFor(500);
      const moved = await readState(page);
      assert.ok(moved.elapsed > after.elapsed);
      await resizeTo(page, 1200);
      assert.equal(await page.evaluate(() => document.querySelector('.dp-panels').dataset.layout), 'wide');
      assert.deepEqual([(await readState(page)).scene, (await readState(page)).elapsed >= moved.elapsed], [0, true]);
    });
  });

  // 근거: 보이지 않을 때와 움직임 줄이기. 혼합 그림도 가려지면 시계를 얼리고 움직임 줄이기로 열면 모든 판이 마지막 모습이다
  test('visibility_and_reduced_motion_apply_to_every_panel_of_a_mixed_document', async () => {
    const { html } = await playerHtml(MIXED);
    await withPage(browser, html, {}, async (page) => {
      await page.clock.runFor(700);
      const before = await readState(page);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.clock.runFor(3000);
      const frozen = await readState(page);
      assert.deepEqual([frozen.elapsed, frozen.isPlaying], [before.elapsed, false]);
    });
    await withPage(browser, html, { reducedMotion: 'reduce' }, async (page) => {
      const first = await readState(page);
      assert.deepEqual([first.ended, first.isPlaying, first.phase, first.packets, first.pulses], [true, false, 'final', 0, {}]);
      await page.clock.runFor(3000);
      assert.deepEqual(await readState(page), first);
      const bars = await page.evaluate(() => [...document.querySelectorAll('[data-chart="load"]')].map((root) => [...root.querySelectorAll('[data-mark-text]')].map((el) => el.textContent).join(',')));
      assert.equal(bars[0], bars[1], '움직임 줄이기에서도 두 차트 그림이 같은 마지막 모습이다');
    });
  });
});
