// 짧은 꺾인 선의 빠른 이동 글: 경고 하나, 글자와 알약과 카드 안은 덮지 않음, 곧은 선은 다 보임, strict 거부.
// 보존 시나리오(test/mobile-feedback.test.js의 TRAFFIC_SURGE)는 같은 그림을 고정 라벨과 글 없는 점으로 쓴다. 여기가 이동 글 원본을 지킨다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { visibleShare } from '../src/chip-motion.js';
import { CHIP_FRAME_MS, CHIP_VISIBLE_MIN, chipStateAt } from '../src/chip-plan.js';
import { sizeChip } from '../src/chip.js';
import { chipObstacles } from '../src/draw/boxes.js';
import { flattenRoute } from '../src/route.js';

// 짧은 꺾인 선의 빠른 이동 글. 자기 번호 알약이 세로 구간 위에 있고 200ms 박자는 미끄러짐(chip-slide)보다 짧아 자리를 바꿀 수 없다.
// 글 상자는 알약과 글자를 덮지 않고 숨으며, 6할을 못 채우므로 7번 경고로 알린다(docs/design의 이동 글 계약).
const SHORT_HOP_LABEL = [
  'daphnis 2',
  'title "트래픽 급증과 회복"',
  'box client "클라이언트"',
  'queue pending "대기열" slots=12',
  'box worker1 "작업자 1"',
  'box worker2 "작업자 2"',
  'value received "받은 요청" on=client',
  'value done1 "처리 1" on=worker1',
  'value done2 "처리 2" on=worker2',
  'client -> pending no=1',
  'pending -> worker1 no=2',
  'pending -> worker2 no=3',
  'scene "평상시" mode=once',
  '  client -> pending "요청" time=300ms set="received+1, pending+1"',
  '  pending -> worker1 "처리" time=300ms set="pending-1, done1+1"',
  'scene "급증" mode=once keep="pending, received, done1, done2"',
  ...Array.from({ length: 5 }, () => '  client -> pending "요청" time=200ms set="received+1, pending+1"'),
  'scene "정체" mode=once keep="pending, received, done1, done2"',
  '  wait 1s',
  'scene "회복" mode=once keep="pending, received, done1, done2"',
  ...Array.from({ length: 5 }, () => '  pending -> worker2 "처리" time=200ms set="pending-1, done2+1"'),
  '',
].join('\n');

// 읽을 수 있는 한도(chip-visible-share)
const VISIBLE_SHARE = 0.6;
// 겹침 기준은 test/edgecase-final.test.js와 같은 0.5px²
const overlaps = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0.5;

test('a_fast_caption_on_a_short_bent_numbered_edge_hides_instead_of_covering_and_is_reported', async () => {
  const { scene, timeline, warnings } = await buildFigure(SHORT_HOP_LABEL);
  const hidden = warnings.filter((warning) => warning.code === 'check-7' && warning.message.includes('is hidden for'));
  assert.equal(hidden.length, 1);
  assert.match(hidden[0].message, /"처리".*edge pending -> worker2/);
  assert.equal(warnings.length, 1);

  // 알약은 edge 속성이 없고 자기 선의 알약도 하드 장애물이다. 선 이름으로 거르지 않는다.
  const glyphs = chipObstacles(scene, timeline).filter((box) => !box.isFrame);
  const pills = glyphs.filter((box) => box.isPill);
  assert.notEqual(pills.length, 0, '선 번호 알약이 장애물에 있다');
  assert.ok(pills.every((pill) => pill.edge === undefined), '알약 장애물에는 edge가 없다');
  assert.ok(glyphs.some((box) => box.isInner), '카드 안쪽이 장애물에 있다');
  assert.ok(pills.some((pill) => pill.name === '3'), '꺾인 선 자기 번호 알약 "3"');

  const counts = { bent: 0, straight: 0 };
  for (const hop of timeline.segs.flatMap((seg) => seg.hops).filter((candidate) => candidate.data && candidate.track === undefined)) {
    const move = { route: flattenRoute(scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) };
    for (let t = 0; t <= (hop.cut ?? hop.ms); t += CHIP_FRAME_MS) {
      const { box, opacity } = chipStateAt(move, hop.chipPath, t);
      const hit = glyphs.find((glyph) => overlaps(box, glyph));
      assert.ok(opacity < CHIP_VISIBLE_MIN || !hit, `${Math.round(t)}ms "${hop.data.join(' ')}"가 ${hit?.name}을 가린다`);
    }
    const isBent = scene.edges[hop.edge].to === 'worker2';
    counts[isBent ? 'bent' : 'straight'] += 1;
    const share = visibleShare(move, hop.chipPath);
    assert.ok(isBent ? share < VISIBLE_SHARE : share === 1, `${hop.data.join(' ')} ${share}`);
  }
  assert.deepEqual(counts, { bent: 5, straight: 7 });
  await assert.rejects(buildFigure(SHORT_HOP_LABEL, { strict: true }));
});
