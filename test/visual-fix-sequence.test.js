// 시각 수정: 순서 보기는 선택한 장면의 메시지만 보인다. 메시지는 장면마다 첫 행부터 쌓이고(판 크기와 생명선은 가장 긴 장면 기준으로 고정), 그래프의 구조 선은 늘 남는다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { launchChrome, readState, withPage } from './chrome.js';
import { MIXED, playerHtml } from './player-compiled.js';

const doc = (body) => `daphnis 2\n${body}`;
// 순서 보기 하나에 장면 셋: 하나는 메시지 둘(정지), 둘은 메시지 하나(한 번), 셋은 메시지 셋(반복)
const SEQ = doc(
  [
    'box a "A"',
    'box b "B"',
    'box c "C"',
    'view calls sequence "호출" {',
    '  a',
    '  b',
    '  c',
    '}',
    'scene "하나" mode=static',
    '  a -> b "하나-1" time=300ms',
    '  b -> c "하나-2" time=300ms',
    'scene "둘" mode=once',
    '  c -> a "둘-1" time=300ms',
    'scene "셋" mode=loop',
    '  a -> c "셋-1" time=300ms',
    '  c -> b "셋-2" time=300ms',
    '  b -> a "셋-3" time=300ms',
    '',
  ].join('\n'),
);

describe('sequence messages by scene: compile', () => {
  test('every scene starts at the first row and the panel is as tall as the longest scene', async () => {
    const { scene } = await buildFigure(SEQ);
    const edges = scene.edges.filter((edge) => edge.strategy === 'sequence');
    assert.deepEqual(edges.map((edge) => [edge.si, edge.label]), [[0, '하나-1'], [0, '하나-2'], [1, '둘-1'], [2, '셋-1'], [2, '셋-2'], [2, '셋-3']]);
    const firstRow = (si) => edges.find((edge) => edge.si === si).points[0].y;
    assert.equal(firstRow(0), firstRow(1));
    assert.equal(firstRow(1), firstRow(2));
    const lastY = Math.max(...edges.map((edge) => edge.points[0].y));
    assert.equal(lastY, edges.filter((edge) => edge.si === 2).at(-1).points[0].y, '가장 긴 장면이 판 높이를 정한다');
    const [panel] = scene.panels;
    const [line] = scene.lifelines;
    assert.ok(line.y2 > lastY && line.y2 <= panel.box.y + panel.box.h, '생명선은 가장 긴 장면 끝까지다');
    const lengths = [0, 1, 2].map((si) => edges.filter((edge) => edge.si === si).length);
    assert.deepEqual(lengths, [2, 1, 3]);
  });

  test('the panel size does not depend on which scene is selected', async () => {
    const result = await buildFigure(SEQ);
    const sizes = [];
    for (const si of [0, 1, 2]) sizes.push((await toSvg(result, { scene: si })).match(/viewBox="([^"]+)"/)[1]);
    assert.equal(new Set(sizes).size, 1, sizes.join(' | '));
  });

  test('each animated svg shows only its own scene messages and hides the rest', async () => {
    const result = await buildFigure(SEQ);
    for (const [si, expected] of [[0, ['하나-1', '하나-2']], [1, ['둘-1']], [2, ['셋-1', '셋-2', '셋-3']]]) {
      const svg = await toSvg(result, { scene: si });
      const groups = [...svg.matchAll(/<g id="l-(\d+)" class="([^"]*)" data-si="(\d+)">[\s\S]*?class="edgelabel[^"]*">([^<]*)</g)].map((m) => ({ label: m[4], hidden: m[2].includes('fl-off'), si: Number(m[3]) }));
      assert.deepEqual(groups.filter((g) => !g.hidden).map((g) => g.label), expected, `scene ${si}`);
      assert.ok(groups.filter((g) => g.hidden).every((g) => g.si !== si));
    }
  });

  test('notes, fragments and activation bars carry the owning scene too', async () => {
    const source = doc(
      ['box a "A"', 'box b "B"', 'view calls sequence "호출" {', '  a', '  b', '}', 'scene "하나" mode=once', '  a -> b "요청" time=300ms', '  note a "첫째 메모"', '  activate b', '  b -> a "응답" time=300ms', '  deactivate b', 'scene "둘" mode=once', '  a -> b "다시" time=300ms', '  note b "둘째 메모"', '  activate b', '  b -> a "또" time=300ms', '  deactivate b', ''].join('\n'),
    );
    const result = await buildFigure(source);
    assert.deepEqual(result.scene.notes.map((note) => [note.text, note.si]), [['첫째 메모', 0], ['둘째 메모', 1]]);
    assert.deepEqual((result.scene.activations ?? []).map((bar) => [bar.si, bar.depth]), [[0, 0], [1, 0]], '막대는 자기 장면의 것이고 깊이는 장면마다 처음부터다');
    const svg = await toSvg(result, { scene: 1 });
    assert.match(svg, /class="fl-note fl-off" data-si="0"/);
    assert.match(svg, /class="fl-note" data-si="1"/);
  });

  test('graph structural edges are drawn without a scene and never hide', async () => {
    const result = await buildFigure(MIXED);
    const { scene } = result;
    const graph = scene.edges.filter((edge) => edge.strategy !== 'sequence');
    assert.ok(graph.length > 0);
    assert.ok(graph.every((edge) => edge.si === undefined));
    const svg = await toSvg(result, { scene: 1 });
    for (const edge of graph) assert.match(svg, new RegExp(`<g id="e-${scene.edges.indexOf(edge)}" class="fl-edge[^"]*"(?! data-si)`));
  });

  test('the compiled mixed document shows the pair of the selected scene, not the messages of every scene', async () => {
    const result = await buildFigure(MIXED);
    for (const si of [0, 1, 2]) {
      const svg = await toSvg(result, { scene: si });
      const visible = [...svg.matchAll(/<g id="l-\d+" class="([^"]*)" data-si="(\d+)"/g)].filter((m) => !m[1].includes('fl-off')).map((m) => Number(m[2]));
      assert.deepEqual([...new Set(visible)], si === 2 ? [] : [si], `scene ${si}`);
      assert.equal(visible.length, si === 2 ? 0 : 2, `scene ${si}는 자기 메시지 쌍 하나다`);
    }
  });
});

describe('sequence messages by scene: player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(() => browser.close());

  const visible = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[id^="l-"]')]
        .filter((el) => el.dataset.si !== undefined && getComputedStyle(el).display !== 'none')
        .map((el) => el.querySelector('.edgelabel').textContent),
    );
  const tab = (page, name) => page.getByRole('tab', { name, exact: true });

  // 근거: 장면에 들어서면 그 장면의 메시지만 보인다. 정지 장면의 마지막 모습도 자기 장면의 것이다. 다른 장면에 갔다 돌아오면 같은 모습이다
  test('entry, static final, other scenes and return each show exactly the selected scene messages', async () => {
    const { html } = await playerHtml(SEQ);
    await withPage(browser, html, {}, async (page) => {
      assert.deepEqual(await visible(page), ['하나-1', '하나-2'], '정지 장면의 마지막 모습은 자기 메시지다');
      await tab(page, '둘').click();
      assert.deepEqual(await visible(page), ['둘-1']);
      await page.clock.runFor(2000);
      assert.deepEqual(await visible(page), ['둘-1'], '재생이 끝난 마지막 모습도 같다');
      await tab(page, '셋').click();
      await page.clock.runFor(500);
      assert.deepEqual(await visible(page), ['셋-1', '셋-2', '셋-3']);
      await tab(page, '하나').click();
      assert.deepEqual(await visible(page), ['하나-1', '하나-2'], '돌아와도 앞 장면의 흔적이 없다');
      await tab(page, '셋').click();
      await tab(page, '둘').click();
      assert.deepEqual(await visible(page), ['둘-1'], '건너뛰어 들어와도 같다');
    });
  });

  // 근거: 판 크기는 장면과 상관없고, 좁은 배치로 바꿔도 같은 장면의 메시지만 보인다
  test('the panel keeps its size across scenes and the narrow layout swap keeps the selected scene', async () => {
    const { html } = await playerHtml(SEQ);
    await withPage(browser, html, { viewport: { width: 1200, height: 800 } }, async (page) => {
      const height = () => page.evaluate(() => document.querySelector('.dp-panel').getBoundingClientRect().height);
      const first = await height();
      await tab(page, '셋').click();
      assert.equal(await height(), first);
      await tab(page, '둘').click();
      assert.equal(await height(), first);
      assert.equal((await readState(page)).scene, 1);
    });
  });
});
