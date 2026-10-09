// 점이 출발하지 않은 대기가 박자와 장면의 길이에 들어가는지(docs/design/playback.md 박자 길이, 대기가 끝나는 때, 시간 상한). 이슈 #135.
// 시간표, 움직이는 SVG(SMIL), HTML 재생기(가짜 시계)의 장면 길이가 같은지 본다. 재생기 시험은 Chrome이 없으면 실패한다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { sliceTimeline, toSvg } from '../src/svg.js';
import { TIME_LIMIT_MS } from '../src/source/values.js';
import { PULSE_MS } from '../src/pulse.js';
import { FRAME_MS, launchChrome, readState, withPage } from './chrome.js';
import { playerHtml } from './player-compiled.js';
import { packetsOf } from './smil.js';

// keyTimes는 한 바퀴 비율의 소수 5자리라 시각으로는 이만큼(ms) 어긋난다
const EDGE_MS = 2;
// 값 하나(n)와 도형 셋. 이슈 원본의 앞부분이다.
const HEAD = 'daphnis 2\nbox a "A"\nbox b "B"\nbox c "C"\nvalue n "N" on=a\nvalue holder "쥔 쪽" on=c from=none\na -> b\nb -> c\na -> c\n';
// 이슈 원본: 60초 대기가 점 없이 시간 초과로 끝나고 else가 없다.
const ISSUE = 'daphnis 2\nbox a "A"\nbox b "B"\nvalue n "N" on=a\na -> b\nscene "Wait" mode=once\n a -> b wait="n=1" timeout=60s\nscene "Next" mode=once\n a -> b time=1s\n';

// 장면 si의 박자 구간 목록
const segsOf = (timeline, si) => timeline.segs.filter((seg) => seg.si === si);
// 박자 구간 seg가 대기 w를 품는다
const holds = (seg, w) => seg.t0 <= w.t0 && w.t1 <= seg.t1;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 만들기가 오류로 끝나면 그 진단 목록 { code, line }, 아니면 빈 목록이다.
async function errorsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line }) => ({ code, line }));
  }
}

// 근거: 이슈 #135 완료 조건 "원본의 다음 장면이 60000ms 전에 시작하지 않고 모든 대기 시각이 해당 구간과 전체 시간 안에 있다", 설계 playback.md 박자 길이
test('buildFigure_the_issue_source_starts_the_next_scene_after_the_60s_timeout_and_keeps_every_wait_inside_its_beat', async () => {
  const { timeline } = await buildFigure(ISSUE);
  const [first] = segsOf(timeline, 0);
  const [next] = segsOf(timeline, 1);
  const [wait] = timeline.waits;

  assert.deepEqual([wait.t0, wait.t1, wait.end], [0, 60000, 'timeout']);
  assert.ok(first.t1 >= 60000, `첫 장면이 ${first.t1}ms에 끝난다`);
  assert.ok(next.t0 >= 60000, `다음 장면이 ${next.t0}ms에 시작한다`);
  assert.equal(next.t0, first.t1);
  assert.ok(timeline.waits.every((w) => timeline.segs.some((seg) => holds(seg, w)) && w.t1 <= timeline.total));
  assert.equal(timeline.total, next.t1);
});

// 근거: 이슈 #135 완료 조건 "else 없는 timeout", 설계 playback.md 대기가 끝나는 때 "timeout: else가 없으면 그 점은 만들지 않는다"
test('buildFigure_a_timeout_without_else_runs_the_beat_until_the_wait_ends_and_the_next_beat_and_scene_start_after_it', async () => {
  const { timeline } = await buildFigure(`${HEAD}scene "s" mode=once\n  b -> c time=1s wait="holder='go'" timeout=20s\n  a -> c time=2s\nscene "t" mode=once\n  a -> c time=1s\n`);
  const [first, second] = segsOf(timeline, 0);
  const [after] = segsOf(timeline, 1);

  assert.deepEqual(timeline.waits.map(({ end, t0, t1 }) => [end, t1 - t0]), [['timeout', 20000]]);
  assert.ok(first.t1 - first.t0 >= 20000);
  assert.equal(first.hops.length, 0, '점이 출발하지 않는다');
  assert.ok(second.t0 >= first.t0 + 20000, '다음 박자는 앞 대기가 끝난 뒤 시작한다');
  assert.equal(after.t0, second.t1);
  assert.ok(after.t0 >= 20000 + 2000, '다음 장면은 두 박자가 끝난 뒤 시작한다');
});

// 근거: 이슈 #135 완료 조건 "다른 짧은 이동과 병렬인 대기", 설계 playback.md 박자 길이 "move와 대기가 끝난 시각 가운데 늦은 쪽"
test('buildFigure_a_wait_that_runs_beside_a_short_move_stretches_the_beat_to_the_wait_end', async () => {
  const { timeline } = await buildFigure(`${HEAD}scene "s" mode=once\n  b -> c time=1s wait="holder='go'" timeout=20s & a -> c time=1s\nscene "t" mode=once\n  a -> c time=1s\n`);
  const [beat] = segsOf(timeline, 0);
  const [after] = segsOf(timeline, 1);

  assert.deepEqual(beat.hops.map((hop) => hop.ms), [1000], '짧은 이동만 출발한다');
  assert.equal(beat.move, 1000, 'move는 점의 움직임만 센다');
  assert.ok(beat.t1 - beat.t0 >= 20000);
  assert.ok(after.t0 >= beat.t0 + 20000);
});

// 근거: 이슈 #135 완료 조건 "기다린 뒤 when=false", 설계 playback.md 조건과 대기 "wait가 풀린 직후 when이 거짓이어도 건너뛴 것으로 skips에 남고 waits에는 released로 남는다"
test('buildFigure_a_wait_released_and_then_skipped_by_a_false_when_keeps_the_beat_and_the_next_scene_after_the_release', async () => {
  const source = `${HEAD}b -> a\nscene "s" mode=once\n  a -> c time=3s set="holder=none"\nscene "t" mode=once keep="holder"\n  a -> c time=3s set="holder=go" & b -> c time=1s wait="holder='go'" when="n=9"\nscene "u" mode=once\n  a -> c time=1s\n`;
  const { timeline } = await buildFigure(source);
  const [beat] = segsOf(timeline, 1);
  const [after] = segsOf(timeline, 2);
  const [wait] = timeline.waits;

  assert.equal(wait.end, 'released');
  assert.equal(timeline.skips.length, 1);
  assert.equal(timeline.skips[0].t, wait.t1);
  assert.ok(holds(beat, wait));
  assert.ok(after.t0 >= wait.t1);
});

// 근거: 이슈 #135 완료 조건 "다음 박자와 다음 장면의 시간은 앞 대기 종료 이후", 설계 playback.md 박자 길이. 마지막 박자는 대기 없는 짧은 이동이라 대기에 늘어나지 않는다(설명 글 박자는 없어졌다)
test('buildFigure_every_beat_and_scene_after_a_wait_starts_at_or_after_the_end_of_that_wait', async () => {
  const source = `${HEAD}scene "s" mode=once\n  a -> b wait="n=1" timeout=7s\n  a -> b wait="n=1" timeout=11s\n  a -> c time=1s\nscene "t" mode=once\n  b -> c wait="holder='go'" timeout=5s else=a\n  a -> c time=1s\n`;
  const { timeline } = await buildFigure(source);

  for (const w of timeline.waits) {
    const owner = timeline.segs.find((seg) => holds(seg, w));
    assert.ok(owner, `${w.line}번 줄 대기가 한 박자 안에 든다`);
    for (const later of timeline.segs.filter((seg) => seg.t0 > owner.t0)) assert.ok(later.t0 >= w.t1, `${later.t0}ms 박자는 ${w.t1}ms에 끝난 대기 뒤에 시작한다`);
  }
  assert.deepEqual(segsOf(timeline, 0).map((seg) => seg.t1 - seg.t0 >= 7000), [true, true, false]);
  assert.equal(timeline.waits.length, 3);
});

// 근거: 이슈 #135 완료 조건 "누적 1시간 초과는 입력 진단으로 끝난다", 설계 시간 상한 "장면 길이와 전체 시간에는 시간표가 자동으로 더하는 시간이 모두 들어간다"
describe('time limit with a wait that starts no dot', () => {
  // 박자 뒤에 따로 머무는 시간이 없어 고정 멈춤은 0이다. 그래도 값을 재어(fixed) 자동으로 더하는 시간이 생기면 그만큼을 빼고 대기가 끝난 박자의 끝이 정확히 1시간이 되도록 timeout을 정한다.
  const make = (timeout) => `${HEAD}scene "s" mode=once\n  a -> b wait="n=1" timeout=${timeout}ms\n`;

  test('buildFigure_a_beat_stretched_only_by_a_wait_passes_at_exactly_one_hour_and_ends_with_time_limit_one_millisecond_over', async () => {
    const fixed = (await buildFigure(make(1_000_000))).timeline.total - 1_000_000;

    assert.deepEqual(await errorsOf(make(TIME_LIMIT_MS - fixed)), []);
    const over = await errorsOf(make(TIME_LIMIT_MS - fixed + 1));

    assert.equal(over.length, 1);
    assert.equal(over[0].code, 'time-limit');
  });

  test('buildFigure_waits_that_add_up_over_one_hour_across_beats_end_with_time_limit_at_the_second_wait', async () => {
    const two = (timeout) => `${HEAD}scene "s" mode=once\n  a -> b wait="n=1" timeout=${timeout}ms\n  a -> b wait="n=1" timeout=${timeout}ms\n`;
    const fixed = (await buildFigure(two(1_000_000))).timeline.total - 2_000_000;

    assert.deepEqual(await errorsOf(two((TIME_LIMIT_MS - fixed) / 2)), []);
    const over = await errorsOf(two((TIME_LIMIT_MS - fixed) / 2 + 1));

    assert.equal(over.length, 1);
    assert.equal(over[0].code, 'time-limit');
  });
});

// 근거: 이슈 #135 완료 조건 "점이 없는 대기 시간도 SVG와 HTML의 전체 재생 길이에 반영한다", 설계 playback.md 박자 길이. 움직이는 SVG는 장면 하나를 그리므로 장면마다 한 바퀴 길이를 본다
test('toSvg_the_loop_length_of_a_wait_scene_follows_the_timetable_and_the_next_scene_dot_starts_with_its_scene', async () => {
  const result = await buildFigure(ISSUE);
  const { timeline } = result;
  const waiting = sliceTimeline(timeline, 0, result.scene);
  const next = sliceTimeline(timeline, 1, result.scene);
  const waitSvg = await toSvg(result, { name: 'issue', scene: 0 });
  const nextSvg = await toSvg(result, { name: 'issue', scene: 1 });
  const durations = (svg) => [...new Set([...svg.matchAll(/ dur="([\d.]+)s"/g)].map(([, s]) => s))];
  const [dot] = packetsOf(nextSvg);

  assert.equal(waiting.total, 60000, '대기 장면의 길이는 대기가 끝나는 시각이다(박자 뒤에 따로 머무는 시간이 없다)');
  assert.deepEqual(durations(waitSvg), [`${waiting.total / 1000}`], '대기 장면의 SMIL 한 바퀴가 시간표의 장면 길이와 같다');
  assert.deepEqual(packetsOf(waitSvg), [], '점이 출발하지 않은 대기 장면에는 점이 없다');
  assert.deepEqual(durations(nextSvg), [`${(next.total + PULSE_MS) / 1000}`], '점이 도형에 닿은 장면은 표시 꼬리(PULSE_MS)까지 한 바퀴다. 표시 꼬리는 논리 시간이 아니다');
  assert.ok(Math.abs(dot.opacity.times[dot.opacity.values.indexOf(1)] * next.total) <= EDGE_MS, '다음 장면의 점은 그 장면이 시작할 때 보이기 시작한다');
});

describe('player', () => {
  let browser;
  before(async () => {
    browser = await launchChrome();
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(m), heap O(m), stack O(1), io m
  // vars: m = 잴 시각 수
  // basis: estimate
  // 원본의 첫 장면을 가짜 시계로 틀고 시각 목록 marks(장면 길이)마다 재생기 상태를 모은다.
  async function statesAt(source, marks) {
    const { html, result } = await playerHtml(source, { baseDir: 'test' });
    const total = sliceTimeline(result.timeline, 0, result.scene).total;
    const states = [];
    await withPage(browser, html, {}, async (page) => {
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      let at = 0;
      // 장면이 짧아 앞 시각보다 이른 시각은 건너뛴다(가짜 시계는 되감지 못한다). 건너뛰면 아래 단언의 개수가 모자라 시험이 실패한다.
      for (const until of marks(total)) {
        if (until <= at) continue;
        await page.clock.runFor(until - at);
        at = until;
        states.push({ at, ...(await readState(page)) });
      }
    });
    return { states, total };
  }

  // 근거: 이슈 #135 완료 조건 "점이 없는 대기 시간도 HTML의 전체 재생 길이에 반영한다"(가짜 시계로 재생기를 흘려 장면이 끝나는 시각을 잰다). 한 번 재생하는 장면은 대기가 끝나는 60000ms에 끝난다(점도 값 변화도 없어 효과 꼬리가 없다)
  test('player_once_scene_ends_when_the_wait_ends_and_not_before', async () => {
    const { states, total } = await statesAt(ISSUE, (length) => [59_000, length - 100, length + 100]);

    assert.equal(total, 60_000);
    assert.deepEqual(states.map(({ ended }) => ended), [false, false, true], states.map(({ at, ended, d }) => `${at}ms ended=${ended} d=${Math.round(d)}`).join(', '));
    assert.ok(states.every(({ scene, selected }) => scene === 0 && selected === 'Wait'));
  });

  // 근거: 같은 근거. 반복하는 장면은 시간표의 장면 길이에서 되돌아간다(대기 시간을 한 바퀴에 포함한다)
  test('player_loop_scene_wraps_at_the_timetable_scene_length_including_the_wait', async () => {
    const { states, total } = await statesAt(ISSUE.replace('scene "Wait" mode=once', 'scene "Wait" mode=loop'), (length) => [59_000, length - 100, length + 200]);
    const [during, last, wrapped] = states;

    assert.equal(total, 60_000, '반복하는 장면의 한 바퀴는 대기가 끝나는 시각이다');
    assert.ok(during.d >= 58_000 && during.d <= 60_000, `대기 중 ${during.d}ms`);
    assert.ok(Math.abs(last.d - last.at) <= 2 * FRAME_MS && !last.ended, `끝 직전 장면 안 시각 ${last.d}ms, 시계 ${last.at}ms`);
    assert.ok(wrapped.d < 1000 && !wrapped.ended, `한 바퀴를 돈 뒤 장면 안 시각 ${wrapped.d}ms`);
    assert.ok(states.every(({ scene }) => scene === 0));
  });
});
