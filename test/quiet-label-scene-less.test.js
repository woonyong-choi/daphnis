// 근거: playback.md "조용한 알약(quiet)의 보임은 marks의 조용한 선 구간이거나 활성 색이 남은 동안이 정한다"와, 장면이 없는 문서는 선언한 모든 계열이 보이는 구간 하나(svg.js emptySeg).
// 조용한 선의 라벨 알약 묶음(l-번호)은 선 요소(e-번호)와 다른 요소라 자기 보임 class를 갖는다. 장면 없는 차트는 정지 SVG와 HTML이 같은 모든 계열을 보인다.
// 브라우저 시험은 Chrome과 WebKit의 계산 스타일을 읽는다. 브라우저가 없으면 건너뛰지 않고 실패한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { CAPTURE, launchChrome, readState, withPage } from './chrome.js';
import { chartSource } from './helpers.js';

const ENGINES = [
  ['chrome', launchChrome],
  ['webkit', () => webkit.launch()],
];
// 라벨만 있는 조용한 선(b -> c)과 번호만 있는 조용한 선(a -> c). 장면마다 지나지 않음, 지나는 중, 지난 뒤, 다음 장면, 되풀이가 갈린다.
const QUIET = [
  'daphnis 2',
  'box a "A"',
  'box b "B"',
  'box c "C"',
  'a -> b',
  'b -> c "품절" quiet',
  'a -> c no=7 quiet',
  'scene "앞" mode=once',
  '  a -> b time=600ms',
  'scene "라벨" mode=once',
  '  wait 400ms',
  '  b -> c time=600ms',
  '  wait 400ms',
  'scene "숫자" mode=once',
  '  wait 400ms',
  '  a -> c time=600ms',
  '  wait 400ms',
  'scene "반복" mode=loop',
  '  wait 300ms',
  '  b -> c time=600ms',
  '  wait 300ms',
  'scene "정지" mode=static',
  '  b -> c time=600ms',
  '',
].join('\n');
// 장면 이름 → 라벨 알약(l-1)과 번호 알약(l-2)이 장면 끝에서 보여야 하는가
const SHOWN_AT_END = { 앞: [false, false], 라벨: [true, false], 숫자: [false, true], 반복: [true, false], 정지: [true, false] };
const LABEL = 'l-1';
const NUMBER = 'l-2';

const ids = Array.from({ length: 7 }, (_, i) => `s${i}`);
// 장면 없는 문서에 놓이는 차트 종류별 원본. 산점도는 계열이 일곱인 것과 계열이 없는 것을 함께 둔다.
const SCENE_LESS = {
  'scatter-7': { series: 7, source: chartSource('scatter', ['x "시간(ms)"', 'y "건수(건)"', ...ids.map((id, i) => `series ${id} "계열 ${i + 1}"`), ...ids.flatMap((id, s) => [0, 1].map((j) => `point "p${s}-${j}" x=${s * 2 + j + 1} y=${((s * 3 + j * 5) % 11) + 1} series=${id}`))]) },
  'scatter-no-series': { series: 1, source: chartSource('scatter', ['x "시간(ms)"', 'y "건수(건)"', 'point "a" x=1 y=2', 'point "b" x=3 y=4']) },
  bar: { series: 2, source: chartSource('bar', ['x "값(ms)"', 'series a "A"', 'series b "B"', 'row "r1" a=3 b=4', 'row "r2" a=5 b=1']) },
  line: { series: 2, source: chartSource('line', ['x "주차"', 'y "점수(%)"', 'series a "A"', 'series b "B"', 'point x=1 a=1 b=2', 'point x=2 a=2 b=3']) },
  box: { series: 1, source: chartSource('box', ['x "시간(ms)"', 'row "a" min=1 q1=2 median=3 q3=4 max=5']) },
  heatmap: { series: 1, source: chartSource('heatmap', ['cell "a" "x" 10', 'cell "a" "y" 5']) },
  // 값에 묶인 차트: 행의 값이 값 카드(depth)를 따른다
  bound: {
    series: 2,
    source: ['store db "DB"', 'value depth "깊이" on=db from=2', chartSource('bar', ['x "지연(ms)"', 'series ms "지연"', 'series cap "한도"', 'row "지금" ms=depth cap=6', 'row "최대" ms=6 cap=6'], { id: 'c', title: '부하' }), 'view main graph right "구조" {', '  db', '  c', '}', ''].join('\n'),
  },
};
const sceneLess = (name) => `daphnis 2\n${SCENE_LESS[name].source}`;

// 조용한 선의 선(e-번호)과 라벨 알약 묶음(l-번호)의 보임: 조상까지 곱한 불투명도(숨김 보임이면 ` hidden`을 붙인다). 장면 층이 둘이면 움직임 층을 읽는다. 브라우저 안에서 도는 함수라 바깥 이름을 쓰지 않는다.
function quietLooks(root) {
  const scope = root.querySelector('.fl-motion') ?? root;
  const look = (el) => {
    let opacity = 1;
    let isHidden = false;
    for (let node = el; node && node.nodeType === 1; node = node.parentNode) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      if (style.visibility === 'hidden') isHidden = true;
    }
    return `${Number(opacity.toFixed(2))}${isHidden ? ' hidden' : ''}`;
  };
  return Object.fromEntries([...scope.querySelectorAll('g.fl-edge.quiet[id]')].map((el) => [el.id, look(el)]));
}

// 차트 계열 묶음(`cs-번호`)과 그 아래 그린 요소마다 조상까지 곱한 불투명도와 숨김. 브라우저 안에서 도는 함수다.
function seriesLooks() {
  const series = [...document.querySelectorAll('[data-chart="c"] *')].filter((el) => /(^|\s)cs-\d+(\s|$)/.test(el.getAttribute('class') ?? ''));
  // 갱신 효과 겹침(`fl-mark-pulse`)은 표식이 바뀐 때만 켜지는 층이라 불투명도 0이 맞다.
  return series.flatMap((group) => [group, ...group.querySelectorAll('circle, rect:not(.fl-mark-pulse), path, text')]).map((el) => {
    let opacity = 1;
    let isHidden = false;
    for (let node = el; node && node.nodeType === 1; node = node.parentNode) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      if (style.visibility === 'hidden') isHidden = true;
    }
    return { name: `${el.tagName}.${(el.getAttribute('class') ?? '').split(/\s+/)[0]}`, opacity: Number(opacity.toFixed(2)), isHidden };
  });
}

// 시각 at(ms)에 움직이는 SVG의 CSS 애니메이션을 멈춰 두고 읽는다
const svgLooksAt = (page, at) => page.evaluate(([source, time]) => {
  const root = document.querySelector('svg');
  root.pauseAnimations();
  root.setCurrentTime(time / 1000);
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = time;
  }
  return new Function(`return (${source})`)()(root);
}, [quietLooks.toString(), at]);

const visibleAt = (looks, id) => looks[id] === '1';

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 장면 수
// basis: estimate
test('quiet_label_group_has_its_own_visibility_class_and_the_line_keeps_the_stacked_visibility_and_color', async () => {
  const result = await buildFigure(QUIET, { strict: true });
  // 선을 지나는 장면: 라벨 선(e-1)은 장면 1, 번호 선(e-2)은 장면 2에서 지난다
  for (const [scene, edge, label] of [[1, 'e-1', LABEL], [2, 'e-2', NUMBER]]) {
    const svg = await toSvg(result, { scene });
    const classOf = (id) => new RegExp(`<g id="${id}" class="([^"]*)"`).exec(svg)[1].split(/\s+/);
    // 라벨 알약 묶음: 'fl-edge quiet' 뒤에 자기 보임 class 하나가 있다
    const [, , own, ...rest] = classOf(label);
    assert.ok(own, `장면 ${scene}: ${label} class ${classOf(label)}`);
    assert.deepEqual(rest, []);
    // 선: 보임 구간과 강조 색 구간이 한 class로 쌓이고, 그 class의 animation에 라벨 묶음의 보임이 들어 있다
    const stacked = classOf(edge).at(-1);
    const rule = new RegExp(`\\.fl \\.${stacked} \\{ animation: ([^;]*); \\}`).exec(svg);
    assert.ok(rule, `장면 ${scene}: 쌓은 ${edge} 규칙 ${stacked}`);
    const names = rule[1].split(',').map((part) => part.trim().split(/\s+/)[0]);
    assert.equal(names.length, 2, rule[1]);
    assert.ok(names.includes(own), `장면 ${scene}: ${edge}가 쌓은 ${names}에 ${label}의 ${own}이 있다`);
    // 라벨 묶음의 keyframes는 불투명도만 바꾸고 안쪽 알약의 활성 색 animation과 겹치지 않는다
    const keyframes = new RegExp(`@keyframes ${own} \\{(.*?)\\}\\n\\.fl \\.${own} `).exec(svg)[1];
    assert.match(keyframes, /opacity: [01]/);
    assert.doesNotMatch(keyframes, /stroke|fill|color/);
  }
});

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 장면 수
// basis: estimate
test('static_svg_follows_the_same_quiet_visibility_rule_as_the_line_for_label_and_number_pills', async () => {
  const result = await buildFigure(QUIET, { strict: true });
  const steps = result.timeline.steps.map((step) => step.label);
  for (const [si, name] of steps.entries()) {
    const svg = await toSvg(result, { scene: si, isStatic: true });
    for (const [edge, label] of [['e-1', LABEL], ['e-2', NUMBER]]) {
      const classes = (id) => new RegExp(`<g id="${id}" class="([^"]*)"`).exec(svg)[1].split(/\s+/);
      const own = classes(label).at(-1);
      assert.ok(classes(edge).includes(own), `${name}: ${edge}의 ${classes(edge)}에 ${label}의 ${own}이 있다`);
      const shown = SHOWN_AT_END[name][edge === 'e-1' ? 0 : 1];
      assert.match(svg, new RegExp(`\\.fl \\.${own} \\{ opacity: ${shown ? 1 : 0}; \\}`), `${name}: ${label}`);
    }
  }
});

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 차트 종류 수
// basis: estimate
test('scene_less_static_svg_shows_every_declared_series_for_each_chart_family', async () => {
  for (const [name, { series }] of Object.entries(SCENE_LESS)) {
    const result = await buildFigure(sceneLess(name), { strict: true });
    for (const isStatic of [true, false]) {
      const svg = await toSvg(result, { isStatic, name });
      const rules = [...svg.matchAll(/\[data-chart="c"\] \.cs-(\d+) \{ opacity: (\d); \}/g)].map((m) => `${m[1]}:${m[2]}`);
      assert.deepEqual(rules, Array.from({ length: series }, (_, s) => `${s}:1`), `${name} isStatic=${isStatic}`);
    }
  }
});

for (const [engine, launch] of ENGINES) {
  // cost: time O(f·page), heap O(page), stack O(1), io 1
  // vars: f = 차트 종류 수, page = 브라우저 페이지 비용
  // basis: estimate
  test(`scene_less_chart_series_look_the_same_in_static_svg_and_html_${engine}`, async () => {
    const browser = await launch();
    try {
      for (const name of Object.keys(SCENE_LESS)) {
        const result = await buildFigure(sceneLess(name), { strict: true });
        const read = async (markup) => {
          const page = await browser.newPage();
          await page.setContent(markup);
          await page.evaluate(() => document.fonts.ready);
          const looks = await page.evaluate(`(${seriesLooks})()`);
          await page.close();
          return looks;
        };
        const svg = await read(`<body>${await toSvg(result, { isStatic: true, name })}</body>`);
        const html = await read(await toHtml(result, name));
        assert.ok(svg.length > 0, `${engine} ${name}: 계열 요소`);
        assert.ok(svg.every((look) => !look.isHidden && look.opacity === 1), `${engine} ${name} 정지 SVG: ${JSON.stringify(svg.filter((look) => look.isHidden || look.opacity !== 1))}`);
        assert.ok(html.every((look) => !look.isHidden && look.opacity === 1), `${engine} ${name} HTML: ${JSON.stringify(html.filter((look) => look.isHidden || look.opacity !== 1))}`);
      }
    } finally {
      await browser.close();
    }
  });

  // cost: time O(s·t·page), heap O(page), stack O(1), io 1
  // vars: s = 장면 수, t = 장면마다 시각 수, page = 브라우저 페이지 비용
  // basis: estimate
  test(`quiet_label_and_number_pills_follow_the_line_before_during_after_and_on_reentry_${engine}`, async () => {
    const result = await buildFigure(QUIET, { strict: true });
    const html = (await toHtml(result, 'quiet')).replace("figurePlay(document.querySelector('.fl-figure'),", `${CAPTURE}figurePlay(document.querySelector('.fl-figure'),`);
    const steps = result.timeline.steps.map((step) => step.label);
    const browser = await launch();
    try {
      for (const [scene, name] of steps.entries()) {
        const svg = await toSvg(result, { scene });
        const stillSvg = await toSvg(result, { scene, isStatic: true });
        // 앞 장면에서 지나간 선이 다음 장면 처음에는 숨는다(다시 들어오기). 장면 끝의 모습은 SHOWN_AT_END다.
        const samples = [];
        await withPage(browser, html, {}, async (page) => {
          if (scene > 0) await page.locator('[role="tab"]').nth(scene).click();
          let now = 0;
          for (const time of [0, 200, 500, 800, 1000, 1200, 1500, 1900]) {
            await page.clock.runFor(time - now);
            now = time;
            const state = await readState(page);
            samples.push({ time, elapsed: state.elapsed, looks: await page.evaluate(`(${quietLooks})(document.querySelector('.dp-panels'))`) });
          }
        });
        const page = await browser.newPage();
        await page.setContent(`<body>${svg}</body>`);
        let shownEver = false;
        for (const sample of samples) {
          const shown = await svgLooksAt(page, sample.elapsed);
          assert.deepEqual(shown, sample.looks, `${engine} 장면 ${name} 시각 ${sample.time}ms(재생기 ${sample.elapsed}ms)`);
          shownEver ||= visibleAt(sample.looks, LABEL) || visibleAt(sample.looks, NUMBER);
        }
        await page.close();
        const [label, number] = SHOWN_AT_END[name];
        // 장면의 처음에는 라벨과 번호가 모두 숨는다(앞 장면의 지남이 이어지지 않는다). static 장면은 처음부터 마지막 모습이다.
        const isStaticScene = result.timeline.steps[scene].mode === 'static';
        assert.deepEqual([samples[0].looks[LABEL], samples[0].looks[NUMBER]], isStaticScene ? [label ? '1' : '0', number ? '1' : '0'] : ['0', '0'], `${engine} 장면 ${name}: 시작`);
        // 정지 SVG는 장면 끝의 모습이다
        const still = await browser.newPage();
        await still.setContent(`<body>${stillSvg}</body>`);
        const staticLooks = await still.evaluate(`(${quietLooks})(document.querySelector('svg'))`);
        await still.close();
        assert.deepEqual([staticLooks[LABEL], staticLooks[NUMBER]], [label ? '1' : '0', number ? '1' : '0'], `${engine} 장면 ${name}: 정지 SVG`);
        // 한 번 재생하는 장면은 재생이 끝난 HTML도 같은 모습이다(마지막 시각 1900ms는 모든 once 장면의 길이보다 길다)
        if (result.timeline.steps[scene].mode === 'once') assert.deepEqual(samples.at(-1).looks, staticLooks, `${engine} 장면 ${name}: 재생 끝의 HTML과 정지 SVG`);
        assert.equal(shownEver || (!label && !number), true, `${engine} 장면 ${name}: 지난 뒤에 보인 적이 있다`);
      }
    } finally {
      await browser.close();
    }
  });
}
