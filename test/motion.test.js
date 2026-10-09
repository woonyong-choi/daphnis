// 움직임: 시간표(박자, 이동 시간, 카드 바뀜)와 움직이는 SVG가 시간표와 같은 시각에 같은 위치에 있다(docs/design/playback.md).
// 움직이는 SVG는 장면 하나를 그리므로 장면마다 그 장면만 자른 시간표(sliceTimeline)와 견준다. 원본은 시험 원본 묶음과 이 파일의 인라인 원본이다(예제 파일에 기대지 않는다).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { sizeChip } from '../src/chip.js';
import { chipStateAt } from '../src/chip-motion.js';
import { curveOf, positionAt, timeAtPosition } from '../src/easing.js';
import { flattenRoute, routeLength } from '../src/route.js';
import { sliceTimeline, toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { discreteAt, ease, packetsOf, pathFractionAt, slideAt } from './smil.js';

const FIXTURE_DIRS = ['flow', 'chip-reach', 'csapp', 'layout'].map((name) => new URL(`./fixtures/${name}/`, import.meta.url));
const MOVE = curveOf('move');
const TOLERANCE = 0.002;

// cost: time O(f·s), heap O(out), stack O(1), io f
// vars: f = 원본 수, s = 장면 수, out = 만든 SVG 글자 수
// basis: estimate
// 시험 원본 묶음의 .dap마다, 이동이 있는 장면마다 { name, si, result, sliced, svg }. sliced는 그 장면만 자른 시간표다.
// 만들기나 그리기가 실패한 원본은 scenes에서 빼고 failures에 `폴더/파일: 메시지`로 모아 따로 한 번 단언한다(한 원본의 실패가 나머지 검사를 가리지 않게 한다).
const animatedScenes = (() => {
  let cached;
  return () => (cached ??= collectScenes());
})();

async function collectScenes() {
  const scenes = [];
  const failures = [];
  for (const dir of FIXTURE_DIRS) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.dap'))) {
      try {
        const result = await buildFigure(readFileSync(new URL(file, dir), 'utf8'), { baseDir: dir.pathname });
        for (const si of result.timeline.steps.keys()) {
          const sliced = sliceTimeline(result.timeline, si, result.scene);
          if (sliced.segs.some((seg) => seg.hops.length)) scenes.push({ name: `${file}#${si}`, si, result, sliced, svg: await toSvg(result, { name: file, scene: si }) });
        }
      } catch (error) {
        failures.push(`${dir.pathname.split('/').at(-2)}/${file}: ${error.message}`);
      }
    }
  }
  return { scenes, failures };
}

// 근거: 시험 원본은 모두 `daphnis 2` 원본이고 만들기와 그리기가 끝나야 한다(위 움직임 시험이 원본마다 같은 길을 쓴다)
test('every_motion_fixture_builds_and_draws_each_of_its_scenes', async () => {
  assert.deepEqual((await animatedScenes()).failures, []);
});

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 위치 index의 태그가 시작한 <g> 안에 있는지. 여는 g와 닫는 g를 세어 깊이가 0 아래로 내려가지 않았는지 본다.
function isInsideGroup(svg, groupStart, index) {
  let depth = 0;
  for (const m of svg.slice(groupStart, index).matchAll(/<g[\s>]|<\/g>/g)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth <= 0) return false;
  }
  return depth > 0;
}

// 이동이 길이에 비례하는지 보는 원본. time=이 없어 이동 시간이 선 길이로 정해진다. 선 길이가 서로 다르다.
const HOP_SOURCE = 'daphnis 2\ntitle "이동 시간"\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "긴 이름의 도형"\na -> b\nb -> c\nc -> d\na -> c\nscene "s" mode=once\n  a -> b\n  b -> c\n  c -> d\n  a -> c\n';

// cost: time O(b·h), heap O(b·h), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 이동이 지나는 선의 길이와 시간 쌍. 모든 박자의 이동을 모은다.
function hopPairs({ scene, timeline }) {
  return timeline.segs.flatMap((seg) => seg.hops.map((h) => ({ length: routeLength(flattenRoute(scene.edges[h.edge].points)), ms: h.ms })));
}

// 근거: 설계 figure-syntax.md 요구사항 "카드는 도착 규칙대로 바뀐다"(도착하는 도형은 가장 늦은 도착, 출발하는 도형은 박자 시작)
test('buildTimeline_card_changes_at_the_latest_arrival_and_the_source_card_at_beat_start', async () => {
  const merged = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> c\nb -> c\nscene "s" mode=once\n  a -> c time=1s & b -> c time=3s\n  show c "도착"\n');
  const single = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\na -> b\nscene "s" mode=once\n  a -> b\n  show a "출발"\n  show b "도착"\n');
  const seg = single.timeline.segs[0];

  assert.equal(merged.timeline.segs[0].cardsAt.c, 3000);
  assert.equal(seg.cardsAt.a, 0);
  assert.equal(seg.cardsAt.b, seg.move);
});

// 근거: 설계 grid.md 요구사항 "칸 light는 도형 light와 같은 박자 규칙이다: 장면 안에서 남고 다음 장면에서 꺼진다"
test('buildTimeline_grid_cell_light_stays_for_the_rest_of_the_scene_like_a_node_light', async () => {
  const { timeline } = await buildFigure('daphnis 2\nbox a "A"\ngrid g "G" cols=2 {\n  item x "X"\n  item y "Y" col=1\n}\nscene "하나" mode=once\n  light g.x\n  light g.y a\nscene "둘" mode=once\n  light a\n');
  const lit = timeline.segs.map((seg) => [seg.partsOn, seg.nodesOn]);

  assert.deepEqual(lit, [[['g.x'], []], [['g.x', 'g.y'], ['a']], [[], ['a']]]);
});

// 근거: 설계 charts.md 재생 "계열은 장면마다 따로 센다. 한 장면의 reveal에 나온 계열은 그 장면이 시작할 때 숨고, 다음 장면은 이 규칙으로 새로 시작한다"
test('buildTimeline_chart_series_are_counted_per_scene_and_only_the_revealed_series_grows', async () => {
  const { timeline } = await buildFigure('daphnis 2\nchart c "T" bar {\n  series a "A"\n  series b "B"\n  row "r" a=1 b=2\n}\nscene "1" mode=once\n  reveal c.a\nscene "2" mode=once\n  reveal c.b\n');

  assert.deepEqual(timeline.segs.map((seg) => seg.charts.c.growing), [['a'], ['b']], '앞 장면에서 드러낸 계열을 다음 장면이 이어받아 키우지 않는다');
  assert.deepEqual(timeline.segs.map((seg) => seg.charts.c.series), [['a', 'b'], ['a', 'b']]);
});

// 근거: 계약 figure-syntax.md 이동 시간 "선 길이에 비례, hop-min보다 짧지 않고 최대는 없다, 박자는 가장 긴 이동만큼"
test('buildTimeline_hop_time_follows_the_edge_length_with_a_minimum_and_no_maximum', async () => {
  const result = await buildFigure(HOP_SOURCE);
  const pairs = hopPairs(result);
  const free = pairs.filter(({ ms }) => ms > values.duration['hop-min']);

  assert.ok(new Set(free.map((p) => Math.round(p.length))).size > 1);
  for (const { length, ms } of free) assert.ok(Math.abs(ms - (length / values.size.packet['hop-ref']) * values.duration.hop) <= 1);
  for (const { ms } of pairs) assert.ok(ms >= values.duration['hop-min']);
  for (const seg of result.timeline.segs) assert.equal(seg.move, Math.max(0, ...seg.hops.map((h) => h.ms)));
});

// 근거: 계약 figure-syntax.md 머리 표 "pace: 기준 길이 선을 지나는 시간"(옛 `speed` 머리 줄을 대신한다)
test('buildTimeline_pace_header_scales_every_hop_time', async () => {
  const base = hopPairs(await buildFigure(HOP_SOURCE));
  const slow = hopPairs(await buildFigure(HOP_SOURCE.replace('title', `pace ${values.duration.hop * 2}ms\ntitle`)));

  assert.ok(base.length > 0);
  base.forEach((p, i) => assert.ok(Math.abs(slow[i].ms - p.ms * 2) <= 1));
});

// 근거: 계약 figure-syntax.md 이동 시간 "time=이 있으면 그 이동의 절대 시간"
test('buildTimeline_hop_time_option_is_absolute_regardless_of_length', async () => {
  const { timeline } = await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\nscene "s" mode=once\n  a -> b time=900ms\n  b -> c time=900ms\n');

  assert.deepEqual(timeline.segs.map((s) => s.move), [900, 900]);
});

// 근거: 설계 playback.md 요구사항 "움직이는 SVG의 점이 시간표와 같은 시각에 같은 위치에 있다. keyTimes는 늘어나기만 하고 keySplines 수가 맞으며, 보임 창과 이동 구간이 시간표 이동과 같고, 경로와 점이 한 좌표 그룹에 있다"
test('toSvg_moving_packets_match_the_timeline_in_every_fixture_scene', async () => {
  const { scenes } = await animatedScenes();
  assert.ok(scenes.length >= 10, `이동이 있는 장면 ${scenes.length}개`);
  for (const { name, si, result, sliced, svg } of scenes) {
    const { segs, total } = sliced;
    // SMIL 한 바퀴는 표시 길이(논리 길이를 장면 배속으로 나눈 값에 효과 꼬리를 더한 값)이고 keyTimes는 그 비율이다. 논리 시각 t는 표시 시각 t / speed에 놓인다.
    const display = Math.round(sliced.presentation[si]);
    const { speed } = result.timeline.steps[si];
    const fraction = (logical) => logical / speed / display;
    const hops = segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop })));
    const packets = packetsOf(svg);
    const expectedDur = `${display / 1000}s`;
    // 그림이 캔버스 한가운데로 옮겨진 넓은 그림에만 이동한 그룹이 있다. 없으면 경로와 점은 모두 SVG 바탕 좌표에 있다.
    const groupStart = svg.indexOf('<g transform="translate(');
    assert.equal(packets.length, hops.length, name);
    assert.doesNotMatch(svg, /@keyframes p\d+-\d+ /, `${name}: 점 보임은 CSS가 아니라 SMIL이어야 한다`);

    packets.forEach(({ opacity, motion, slide }, k) => {
      const { seg, hop } = hops[k];
      const start = seg.t0 + (hop.at ?? 0);
      // 흐름의 점은 도형 안을 지나는 구간(gaps)에서 보이지 않는다. 보임 창은 첫 구간 끝까지다.
      const inside = (hop.gaps ?? []).map(([a, b]) => [start + timeAtPosition(a, hop.pace) * hop.ms, start + timeAtPosition(b, hop.pace) * hop.ms]);
      const shownEnd = start + (hop.cut ?? hop.ms);
      const [from, to] = [fraction(start), fraction(Math.min(inside[0]?.[0] ?? shownEnd, shownEnd))];
      const end = fraction(shownEnd);
      for (const times of [opacity.times, motion.times, ...(slide.times ? [slide.times] : [])]) {
        assert.equal(times[0], 0, name);
        assert.ok(times.at(-1) <= 1, name);
        // 글 상자 옮김(slide)은 자리를 순간에 바꾸는 곳에서 같은 시각이 이어진다. 점의 보임과 이동은 늘어나기만 한다.
        times.slice(1).forEach((time, i) => assert.ok(times === slide.times ? time >= times[i] : time > times[i], `${name}: keyTimes ${times}`));
      }
      if (hop.cut === undefined && !hop.pace) assert.equal(motion.splines.length, motion.times.length - 1, name);
      assert.equal(motion.points.length, motion.times.length, name);
      assert.equal(opacity.values.length, opacity.times.length, name);
      assert.deepEqual([opacity.dur, motion.dur, slide.dur ?? expectedDur], [expectedDur, expectedDur, expectedDur], `${name}: 한 바퀴 길이는 장면의 표시 길이(밀리초로 반올림)`);

      const shown = opacity.times[opacity.values.indexOf(1)];
      const hidden = opacity.times[opacity.values.indexOf(1) + 1] ?? 1;
      assert.ok(Math.abs(shown - from) < 1e-5 && Math.abs(hidden - to) < 1e-5, `${name} hop ${k}: 보임 창 ${shown}-${hidden}, 시간표 ${from}-${to}`);
      assert.ok(motion.times.some((time) => Math.abs(time - end) < 1e-5), `${name} hop ${k}: 이동 끝이 시간표 이동 끝과 다르다`);
      if (from > 0) assert.ok(motion.times.some((time) => Math.abs(time - from) < 1e-5), `${name} hop ${k}: 이동 시작이 보임 창 시작과 다르다`);
      if (slide.times) assert.ok(slide.times.every((time) => time === 0 || time === 1 || (time >= from - 1e-5 && time <= end + 1e-5)), `${name} hop ${k}: 글 상자 keyTimes가 이동 구간 밖이다`);

      const probes = [...Array.from({ length: Math.ceil(total / 25) }, (_, i) => i * 25), start, start + 1, shownEnd - 1, shownEnd + 1, total - 1];
      for (const t of probes) {
        // 장면 끝에서 잘린 점(cut)은 사라진 자리에 머문다(cutMotionKeys). 잘린 뒤의 자리는 잘린 순간의 진행으로 센다.
        const progress = Math.min(1, Math.max(0, (Math.min(t, shownEnd) - start) / hop.ms));
        const expected = hop.pace ? positionAt(progress, hop.pace) : hop.isBack ? 1 - ease(MOVE, progress) : ease(MOVE, progress);
        const actual = pathFractionAt(motion, fraction(t));
        assert.ok(Math.abs(actual - expected) < TOLERANCE, `${name} hop ${k} t=${t}ms: 경로 비율 ${actual.toFixed(4)}, 기대 ${expected.toFixed(4)}`);
        const isOn = t >= start && t < shownEnd && !inside.some(([a, b]) => t > a && t < b);
        if (Math.abs(t - start) > 1 && Math.abs(t - shownEnd) > 1 && inside.every(([a, b]) => Math.abs(t - a) > 1 && Math.abs(t - b) > 1)) assert.equal(discreteAt(opacity, fraction(t)), isOn ? 1 : 0, `${name} hop ${k} t=${t}ms: 보임`);
      }
    });
    for (const m of svg.matchAll(/<g class="p\d+-\d+" opacity="0">/g)) {
      const href = svg.slice(m.index).match(/<mpath href="#(t?p-\d+)"/)[1];
      const pathAt = svg.indexOf(`id="${href}"`);
      if (groupStart < 0) {
        assert.ok(pathAt >= 0, `${name}: ${href} 경로가 없다`);
        continue;
      }
      assert.ok(pathAt > groupStart && isInsideGroup(svg, groupStart, pathAt), `${name}: ${href} 경로가 이동한 그룹 밖에 있다`);
      assert.ok(isInsideGroup(svg, groupStart, m.index), `${name}: 점이 이동한 그룹 밖에 있다`);
    }
  }
});

const CUT_SOURCE = (forMs) => `daphnis 2
box a "Alpha service"
box b "Beta service"
box c "Gamma service"
a -> b "request one"
b -> c "request two"
scene "s" mode=once for=${forMs}ms
  track a -> b -> c "x" time=4s
scene "next" mode=once
  a -> b
`;

// 근거: 설계 playback.md 흐름 장면 "잘린 점의 글 상자도 같은 잘림 시각에 끝난다": 도형 바깥 이동 중, 도형 안 통과 중, 도형을 지난 뒤 장면이 끝나는 세 경우에 점과 글 상자의 보임 구간과 keyTimes가 잘림 시각에 끝나고 글 상자 자리는 잘리지 않은 계획과 같다
test('toSvg_cut_flow_dot_and_its_chip_end_at_the_same_cut_time_and_keep_the_uncut_chip_offset', async () => {
  for (const forMs of [1200, 2000, 3000]) {
    const cut = await buildFigure(CUT_SOURCE(forMs));
    const full = await buildFigure(CUT_SOURCE(forMs).replace(/for=\d+ms/, 'for=9000ms'));
    const [hop] = cut.timeline.segs[0].hops;
    const [reference] = full.timeline.segs[0].hops;
    // keyTimes는 표시 길이(논리 길이에 효과 꼬리를 더한 값)의 비율이다
    const total = Math.round(sliceTimeline(cut.timeline, 0, cut.scene).presentation[0]);
    const [packet] = packetsOf(await toSvg(cut, { scene: 0 }));
    const label = `장면 ${forMs}ms`;

    assert.equal(hop.cut, forMs, label);
    assert.equal(reference.cut, undefined, label);
    assert.ok(packet.slide.times, `${label}: 글 상자가 움직인다`);
    const end = hop.cut / total;
    assert.ok(Math.abs(packet.slide.times.at(-2) - end) < 1e-5, `${label}: 글 상자 마지막 키 ${packet.slide.times.at(-2)}, 잘림 ${end}`);
    assert.ok(packet.slide.times.every((time) => time <= end + 1e-5 || time === 1), label);
    assert.ok(packet.motion.times.some((time) => Math.abs(time - end) < 1e-5), label);

    const move = { route: full.timeline.tracks[0].route, hop: reference, chip: sizeChip(reference.data) };
    for (let t = 0; t < hop.cut; t += 25) {
      const expected = chipStateAt(move, reference.chipPath, t);
      const [dx, dy] = slideAt(packet.slide, t / total);
      const base = chipStateAt(move, [[0, 0, 0, 1]], t);

      assert.ok(Math.abs(expected.box.x - base.box.x - dx) < 0.05 && Math.abs(expected.box.y - base.box.y - dy) < 0.05, `${label} t=${t}ms: 글 상자 옮김 ${dx},${dy}`);
    }
  }
});

// 근거: 설계 playback.md 장면과 탭 "설명 글과 장면 이름은 그림 안에 그리지 않는다"(장면 이름은 HTML 탭이 맡는다), 같은 입력은 같은 출력. 옛 시험은 설명 글과 단계 이름이 교차 페이드하지 않는지 봤지만 둘 다 없어졌다
test('toSvg_animated_output_is_deterministic_and_draws_no_caption_or_scene_label_text', async () => {
  const { scenes } = await animatedScenes();
  assert.ok(scenes.length >= 10, `검사한 장면 ${scenes.length}개`);
  for (const { name, si, result, svg } of scenes) {
    assert.equal(await toSvg(result, { name: name.split('#')[0], scene: si }), svg, `${name}: 같은 입력은 같은 SVG다`);
    assert.doesNotMatch(svg, /class="caption"|class="steplabel|fl-caption/, `${name}: 설명 글과 장면 이름은 SVG에 없다`);
  }
});

const STEPPED_BAR = 'daphnis 2\nchart c "정확도" bar {\n  x "정확도(%)"\n  series a "A"\n  series b "B"\n  row "r" a=5 b=3\n}\nscene "하나" mode=once\n  reveal c.a\nscene "둘" mode=once\n  reveal c.b\n';

// 근거: 설계 playback.md 요구사항 "멈춘 SVG는 모든 선과 계열을 보이고 움직임이 없다"
test('toSvg_static_output_has_no_motion_and_shows_every_series', async () => {
  const flow = await toSvg(await buildFigure('daphnis 2\nbox a "A"\nbox b "B"\na -> b quiet\nscene "s" mode=once\n  a -> b\n'), { isStatic: true });
  const chart = await toSvg(await buildFigure(STEPPED_BAR), { isStatic: true });

  assert.doesNotMatch(flow, /@keyframes|animateMotion/);
  assert.doesNotMatch(chart, /@keyframes ls|animation: a\d|cs-\d \{ animation/);
  assert.match(chart, /<g class="cs-0">/);
  assert.match(chart, /<g class="cs-1">/);
  assert.equal(chart.includes('opacity="0"'), false);
});
