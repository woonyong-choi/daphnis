// 움직이는 SVG의 점이 시간표와 같은 시각에 같은 위치에 있는지 SMIL 값을 직접 풀어 확인한다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { curveOf } from '../src/easing.js';
import { toSvg } from '../src/svg.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const MOVE = curveOf('move');
const TOLERANCE = 0.002;

// cost: time O(f), heap O(out), stack O(1), io f
// vars: f = 예제 수, out = 만든 SVG 글자 수
// basis: estimate
// 이동이 있는 예제마다 { name, result, svg }
async function animatedExamples() {
  const names = readdirSync(EXAMPLES).filter((f) => f.endsWith('.muto'));
  const all = await Promise.all(
    names.map(async (file) => {
      const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: 'examples' });
      return { name: file, result, svg: await toSvg(result, { name: file }) };
    }),
  );
  return all.filter(({ result }) => result.timeline.segs.some((s) => s.hops.length));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 점 요소 하나씩 읽은 속성. 박자 순서와 이동 순서가 같아 시간표의 이동과 차례로 짝이 된다.
function packetsOf(svg) {
  return svg
    .split('<g class="p')
    .slice(1)
    .map((chunk) => {
      const attr = (tag, name) => chunk.match(new RegExp(`<${tag} [^>]*?${name}="([^"]*)"`))?.[1];
      const list = (tag, name, sep = ';') => attr(tag, name)?.split(sep).map((v) => (name === 'keySplines' ? v.split(' ').map(Number) : Number(v)));
      return {
        opacity: { dur: attr('animate', 'dur'), times: list('animate', 'keyTimes'), values: list('animate', 'values') },
        motion: { dur: attr('animateMotion', 'dur'), times: list('animateMotion', 'keyTimes'), splines: list('animateMotion', 'keySplines'), points: list('animateMotion', 'keyPoints') },
        slide: { dur: attr('animateTransform', 'dur'), times: list('animateTransform', 'keyTimes'), values: attr('animateTransform', 'values')?.split(';') },
        href: attr('mpath', 'href'),
      };
    });
}

function bezier(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 3차 곡선에서 시간 비율 x의 진행 비율. SMIL keySplines와 같은 정의다.
function ease([x1, y1, x2, y2], x) {
  let [low, high] = [0, 1];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < x) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

// SMIL calcMode=spline keyPoints의 경로 비율을 한 바퀴 비율 x에서 푼다.
function pathFractionAt({ times, splines, points }, x) {
  const i = Math.min(times.length - 2, times.findLastIndex((time) => time <= x));
  const u = (x - times[i]) / (times[i + 1] - times[i]);
  return points[i] + (points[i + 1] - points[i]) * ease(splines[i], u);
}

// SMIL calcMode=discrete 값을 한 바퀴 비율 x에서 푼다.
function discreteAt({ times, values }, x) {
  return values[times.findLastIndex((time) => time <= x)];
}

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

test('toSvg_packet_key_times_strictly_increase_and_counts_match', async () => {
  for (const { name, svg } of await animatedExamples()) {
    for (const { opacity, motion, slide } of packetsOf(svg)) {
      const keyed = [opacity.times, motion.times, ...(slide.times ? [slide.times] : [])];
      for (const times of keyed) {
        assert.equal(times[0], 0, name);
        assert.ok(times.at(-1) <= 1, name);
        times.slice(1).forEach((time, i) => assert.ok(time > times[i], `${name}: keyTimes ${times}`));
      }
      assert.equal(motion.splines.length, motion.times.length - 1, name);
      assert.equal(motion.points.length, motion.times.length, name);
      assert.equal(opacity.values.length, opacity.times.length, name);
      if (slide.times) assert.equal(slide.values.length, slide.times.length, name);
    }
  }
});

test('toSvg_packet_duration_is_total_not_rounded_to_a_tenth', async () => {
  for (const { name, result, svg } of await animatedExamples()) {
    const expected = `${Math.round(result.timeline.total) / 1000}s`;
    for (const { opacity, motion, slide } of packetsOf(svg)) {
      assert.equal(opacity.dur, expected, name);
      assert.equal(motion.dur, expected, name);
      if (slide.dur) assert.equal(slide.dur, expected, name);
    }
  }
});

test('toSvg_packet_visibility_and_motion_share_one_clock_and_the_hop_window', async () => {
  for (const { name, result, svg } of await animatedExamples()) {
    const { segs, total } = result.timeline;
    const hops = segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop })));
    const packets = packetsOf(svg);
    assert.equal(packets.length, hops.length, name);
    assert.doesNotMatch(svg, /@keyframes p\d+-\d+ /, `${name}: 점 보임은 CSS가 아니라 SMIL이어야 한다`);
    packets.forEach(({ opacity, motion }, k) => {
      const { seg, hop } = hops[k];
      const [from, to] = [seg.t0 / total, (seg.t0 + hop.ms) / total];
      const shown = opacity.times[opacity.values.indexOf(1)];
      const hidden = opacity.times[opacity.values.indexOf(1) + 1] ?? 1;
      assert.ok(Math.abs(shown - from) < 1e-5 && Math.abs(hidden - to) < 1e-5, `${name} hop ${k}: 보임 창 ${shown}-${hidden}, 시간표 ${from}-${to}`);
      assert.ok(motion.times.some((time) => Math.abs(time - to) < 1e-5), `${name} hop ${k}: 이동 끝이 보임 창 끝과 다르다`);
      if (from > 0) assert.ok(motion.times.some((time) => Math.abs(time - from) < 1e-5), `${name} hop ${k}: 이동 시작이 보임 창 시작과 다르다`);
    });
  }
});

test('toSvg_packet_position_matches_timeline_at_many_times', async () => {
  for (const { name, result, svg } of await animatedExamples()) {
    const { segs, total } = result.timeline;
    const hops = segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop })));
    packetsOf(svg).forEach(({ opacity, motion }, k) => {
      const { seg, hop } = hops[k];
      const probes = [];
      for (let t = 0; t < total; t += 25) probes.push(t);
      probes.push(seg.t0, seg.t0 + 1, seg.t0 + hop.ms - 1, seg.t0 + hop.ms + 1, total - 1);
      for (const t of probes) {
        const progress = Math.min(1, Math.max(0, (t - seg.t0) / hop.ms));
        const expected = hop.isBack ? 1 - ease(MOVE, progress) : ease(MOVE, progress);
        const actual = pathFractionAt(motion, t / total);
        assert.ok(Math.abs(actual - expected) < TOLERANCE, `${name} hop ${k} t=${t}ms: 경로 비율 ${actual.toFixed(4)}, 기대 ${expected.toFixed(4)}`);
        const isOn = t >= seg.t0 && t < seg.t0 + hop.ms;
        if (Math.abs(t - seg.t0) > 1 && Math.abs(t - seg.t0 - hop.ms) > 1) assert.equal(discreteAt(opacity, t / total), isOn ? 1 : 0, `${name} hop ${k} t=${t}ms: 보임`);
      }
    });
  }
});

test('toSvg_packet_and_its_path_share_one_coordinate_group', async () => {
  for (const { name, svg } of await animatedExamples()) {
    const groupStart = svg.indexOf('<g transform="translate(');
    assert.ok(groupStart >= 0, name);
    for (const m of svg.matchAll(/<g class="p\d+-\d+" opacity="0">/g)) {
      const href = svg.slice(m.index).match(/<mpath href="#(p-\d+)"/)[1];
      const pathAt = svg.indexOf(`id="${href}"`);
      assert.ok(pathAt > groupStart && isInsideGroup(svg, groupStart, pathAt), `${name}: ${href} 경로가 이동한 그룹 밖에 있다`);
      assert.ok(isInsideGroup(svg, groupStart, m.index), `${name}: 점이 이동한 그룹 밖에 있다`);
    }
  }
});

test('toSvg_packet_chip_slide_reaches_every_key_in_the_hop_window', async () => {
  for (const { name, result, svg } of await animatedExamples()) {
    const { segs, total } = result.timeline;
    const hops = segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop })));
    packetsOf(svg).forEach(({ slide }, k) => {
      if (!slide.times) return;
      const { seg, hop } = hops[k];
      const [from, to] = [seg.t0 / total, (seg.t0 + hop.ms) / total];
      assert.ok(slide.times.every((time) => time === 0 || time === 1 || (time >= from - 1e-5 && time <= to + 1e-5)), `${name} hop ${k}: 글 상자 keyTimes가 이동 구간 밖이다`);
    });
  }
});
