// 브라우저에서 돈다. html.js가 HTML 안에 그대로 넣는다.
// 시간표의 박자 상태를 그대로 그린다. 상태를 다시 계산하지 않는다(docs/architecture.md 불변 조건).
// 역할별로 나뉜다: 시계(clock), 탭(tabs), 진행 고리(ring), 재생 단추와 배속(controls), 그림 그리기(stage).

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLAYER_RATES = [1, 2, 0.5];
const BISECT_STEPS = 30;
const ICON_VIEWBOX = '0 0 16 16';
// 설명 글이 바뀔 때 앞 글이 사라지고 뒤 글이 나타나는 각 시간(ms)을 담은 토큰 변수. 움직이는 SVG와 같은 토큰이다.
const CAPTION_FADE_VAR = '--duration-caption-fade';

// cost: time O(s + c) 시작, 프레임마다 O(h + k), heap O(s + c), stack O(1)
// vars: s = 도형 수, c = 선 수, h = 한 박자의 이동 수, k = 카드 있는 도형 수
// basis: estimate
/**
 * 재생기를 붙인다.
 * @param root `.fl-figure` 요소
 * @param data { segs, steps, cardCounts, edgeEnds, seriesCount, rowCount, metrics }
 */
function figurePlay(root, data) {
  const player = createPlayer(root, data);
  bindControls(root, player);
  highlightOnHover(player.stage);
  figureView(root, data.metrics);
  setPlaying(player, player.clock.isPlaying);
  if (data.segs.length) {
    enterSegment(player, 0);
    requestAnimationFrame(player.tick);
  } else {
    // 시간 흐름이 없는 그림은 조작 막대를 숨긴다. 차트는 SVG 이미지처럼 되풀이해 자란다.
    root.querySelector('.fl-foot').hidden = true;
    player.stage.svg.classList.add('chart-loop');
  }
}

// cost: time O(s + c), heap O(s + c), stack O(1)
// vars: s = 도형 수, c = 선 수
// basis: estimate
// 재생기 상태 한 덩어리. 시계, 그림, 탭, 고리, 설명 줄이 이 객체 하나로 이어진다.
function createPlayer(root, data) {
  const pauseButton = root.querySelector('.fl-pause');
  const player = {
    data,
    stage: createStage(root, data),
    clock: createClock(),
    stepSegs: data.steps.map((_, si) => data.segs.filter((s) => s.si === si)),
    hasCaption: data.segs.some((s) => s.caption),
    caption: root.querySelector('.fl-caption'),
    captionText: undefined,
    captionFade: undefined,
    pause: { button: pauseButton, icon: pauseButton.querySelector('.fl-pause-icon') },
    ring: createRing(pauseButton),
    tabs: [],
    tick: (now) => drawFrame(player, now),
  };
  player.tabs = createTabs(root.querySelector('.fl-tabs'), player);
  return player;
}

// ---- 시계 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function createClock() {
  return {
    index: 0,
    elapsed: 0,
    before: performance.now(),
    isPlaying: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    rate: PLAYER_RATES[0],
  };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function nextRate(rate) {
  return PLAYER_RATES[(PLAYER_RATES.indexOf(rate) + 1) % PLAYER_RATES.length];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 박자 seg가 속한 탭(step) 전체 시간 중 지금까지 지난 비율(0~1).
function tabProgress(player, seg) {
  const steps = player.stepSegs[seg.si];
  const start = steps[0].t0;
  const end = steps.at(-1).t1;
  return (seg.t0 - start + Math.min(player.clock.elapsed, seg.t1 - seg.t0)) / (end - start);
}

// cost: time O(h + k), heap O(1), stack O(1)
// vars: h = 박자의 이동 수, k = 카드가 바뀌는 도형 수
// basis: estimate
// 프레임마다 시계를 흘리고, 점과 카드를 옮기고, 재생 단추 고리를 채운다.
function drawFrame(player, now) {
  const { clock, data } = player;
  if (clock.isPlaying) clock.elapsed += (now - clock.before) * clock.rate;
  clock.before = now;
  const seg = data.segs[clock.index];
  advanceStage(player.stage, seg, clock.elapsed);
  player.ring.draw(tabProgress(player, seg));
  if (clock.elapsed >= seg.t1 - seg.t0) enterSegment(player, (clock.index + 1) % data.segs.length);
  requestAnimationFrame(player.tick);
}

// cost: time O(s + c + k + r), heap O(h), stack O(1)
// vars: s = 도형 수, c = 선 수, k = 카드 내용 수 합, r = 차트 행 수, h = 이동 수
// basis: estimate
// 박자 i로 들어간다. 시계를 0으로 돌리고 그림, 설명, 탭, 고리를 그 박자 상태로 맞춘다.
function enterSegment(player, i) {
  const { clock, data } = player;
  const seg = data.segs[i];
  clock.index = i;
  clock.elapsed = 0;
  drawSegmentState(player.stage, seg);
  showCaption(player, seg.caption);
  markTabs(player.tabs, seg.si);
  resetPackets(player.stage, seg);
  player.ring.draw(tabProgress(player, seg));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 설명 글자 수
// basis: estimate
// 설명 글을 바꾼다. 앞 글이 다 사라진 뒤 뒤 글이 나타난다(순차 페이드). 같은 글이면 그대로 두고, 첫 글과 움직임 줄이기 설정에서는 바로 바꾼다.
function showCaption(player, text) {
  const { caption } = player;
  caption.hidden = !player.hasCaption;
  if (text === player.captionText) return;
  const isFirst = player.captionText === undefined;
  player.captionText = text;
  player.captionFade?.cancel();
  const fadeMs = parseFloat(getComputedStyle(caption).getPropertyValue(CAPTION_FADE_VAR));
  const fill = () => caption.replaceChildren(...richNodes(text, htmlCode));
  if (isFirst || !fadeMs || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fill();
    return;
  }
  const out = caption.animate([{ opacity: getComputedStyle(caption).opacity }, { opacity: 0 }], { duration: fadeMs, fill: 'forwards' });
  player.captionFade = out;
  out.finished.then(() => {
    fill();
    player.captionFade = caption.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs });
    out.cancel();
  }, () => {});
}

// ---- 재생 단추와 배속 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function bindControls(root, player) {
  const { clock, pause } = player;
  const rateButton = root.querySelector('.fl-rate');
  pause.button.addEventListener('click', () => setPlaying(player, !clock.isPlaying));
  rateButton.addEventListener('click', () => {
    clock.rate = nextRate(clock.rate);
    rateButton.textContent = `${clock.rate}×`;
  });
  root.addEventListener('keydown', (e) => {
    // 단추 위의 스페이스는 그 단추를 누르는 키다.
    if (e.key !== ' ' || e.target.closest('button')) return;
    setPlaying(player, !clock.isPlaying);
    e.preventDefault();
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function setPlaying(player, value) {
  const { clock, pause } = player;
  clock.isPlaying = value;
  pause.icon.innerHTML = playIconSvg(clock.isPlaying, player.data.metrics);
  pause.button.setAttribute('aria-label', clock.isPlaying ? '일시정지' : '재생');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 재생 단추 아이콘. 재생 중이면 일시정지 모양, 멈췄으면 재생 모양이다. 도형은 16x16 좌표계다.
function playIconSvg(isPlaying, metrics) {
  const shape = isPlaying
    ? `<path d="M5 2.5v11M11 2.5v11" stroke="currentColor" stroke-width="${metrics.pauseStroke}" stroke-linecap="round"/>`
    : '<path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/>';
  return `<svg width="${metrics.icon}" height="${metrics.icon}" viewBox="${ICON_VIEWBOX}">${shape}</svg>`;
}

// ---- 진행 고리 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 고리 둘레는 마크업의 반지름에서 구한다. draw(0~1)로 12시에서 시계 방향으로 채운다.
function createRing(button) {
  const fill = button.querySelector('.fl-ring-fill');
  const length = 2 * Math.PI * fill.r.baseVal.value;
  fill.style.strokeDasharray = length;
  return {
    draw(progress) {
      fill.style.strokeDashoffset = length * (1 - progress);
    },
  };
}

// ---- 탭 ----

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 탭 수
// basis: estimate
function createTabs(container, player) {
  const { data, stepSegs } = player;
  const buttons = data.steps.map((label, si) => createTab(label, () => enterSegment(player, data.segs.indexOf(stepSegs[si][0]))));
  container.append(...buttons);
  return buttons;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
function createTab(label, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.append(...richNodes(label, htmlCode));
  button.addEventListener('click', onSelect);
  return button;
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 탭 수
// basis: estimate
function markTabs(buttons, current) {
  buttons.forEach((button, si) => {
    button.classList.toggle('on', si === current);
    button.setAttribute('aria-selected', si === current);
  });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 글을 백틱 기준으로 나눠 노드 목록으로 만든다. 홀수 번째 구간(백틱 안)은 makeCode가 만든 요소에 담는다.
function richNodes(text, makeCode) {
  return text
    .split('`')
    .map((part, i) => {
      if (!part) return null;
      if (i % 2 === 0) return document.createTextNode(part);
      const code = makeCode();
      code.textContent = part;
      return code;
    })
    .filter(Boolean);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function htmlCode() {
  const code = document.createElement('code');
  code.className = 'fl-code';
  return code;
}

// ---- 그림 그리기 ----

// cost: time O(s + c + r), heap O(s + c + r), stack O(1)
// vars: s = 도형 수, c = 선 수, r = 차트 행 수
// basis: estimate
// 그림(SVG) 조각을 한 번 찾아 둔 묶음. 점, 카드 대기열 같은 그림 쪽 상태도 여기에 둔다.
function createStage(root, data) {
  const svg = root.querySelector('svg.fl');
  const all = (selector) => [...svg.querySelectorAll(selector)];
  return {
    svg,
    metrics: data.metrics,
    edgeEnds: data.edgeEnds,
    cardCounts: data.cardCounts,
    packetLayer: svg.querySelector('.fl-packets'),
    nodes: data.cardCounts.map((_, i) => svg.querySelector(`#n-${i}`)),
    groups: all('.fl-group'),
    edges: data.edgeEnds.map((_, j) => svg.querySelector(`#e-${j}`)),
    paths: data.edgeEnds.map((_, j) => svg.querySelector(`#p-${j}`)),
    columns: all('.fl-col'),
    seriesEls: Array.from({ length: data.seriesCount }, (_, i) => all(`.cs-${i}`)),
    labelEls: all('.chart-label.shift'),
    rowEls: Array.from({ length: data.rowCount }, (_, k) => all(`.cr-${k}`)),
    packets: [],
    pendingCards: [],
  };
}

// cost: time O(n·c), heap O(n·c), stack O(1)
// vars: n = 도형 수, c = 선 수
// basis: estimate
// 도형에 마우스를 올리면 닿은 선을 밝힌다. 조용한 선도 그때 보인다.
function highlightOnHover(stage) {
  stage.nodes.forEach((g, i) => {
    const touching = stage.edgeEnds.map((e, j) => (e[0] === i || e[1] === i ? stage.edges[j] : null)).filter(Boolean);
    g?.addEventListener('mouseenter', () => touching.forEach((e) => e.classList.add('hover')));
    g?.addEventListener('mouseleave', () => touching.forEach((e) => e.classList.remove('hover')));
  });
}

// cost: time O(s + c + k + r), heap O(1), stack O(1)
// vars: s = 도형 수, c = 선 수, k = 카드 내용 수 합, r = 차트 행 수
// basis: estimate
// 박자 seg의 상태를 그린다. 점이 도착하는 도형의 카드는 cardsAt 시각에 바뀐다.
function drawSegmentState(stage, seg) {
  stage.nodes.forEach((g, n) => g?.classList.toggle('on', seg.nodesOn.includes(n)));
  stage.groups.forEach((g, n) => g.classList.toggle('on', seg.groupsOn.includes(n)));
  stage.edges.forEach((e, j) => e?.classList.toggle('on', seg.edgesOn.includes(j)));
  stage.columns.forEach((c) => c.classList.toggle('on', seg.columnsOn.includes(c.dataset.col)));
  showCards(stage, seg.cardsBefore);
  stage.pendingCards = Object.entries(seg.cardsAt).map(([n, at]) => ({ n: Number(n), at }));
  drawChartState(stage, seg);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 카드 있는 도형 수
// basis: estimate
function showCards(stage, cards, only) {
  stage.cardCounts.forEach((count, n) => {
    if (!count || (only !== undefined && only !== n)) return;
    const shown = cards[n];
    for (let k = 0; k < count; k++) stage.svg.querySelector(`#n-${n}-c${k}`).setAttribute('opacity', shown === k ? 1 : 0);
    stage.nodes[n].querySelector('.fl-empty').setAttribute('opacity', shown === undefined ? 1 : 0);
    stage.nodes[n].querySelector('.fl-card').classList.toggle('on', shown !== undefined);
  });
}

// cost: time O(r + s), heap O(1), stack O(1)
// vars: r = 차트 행 수, s = 계열 수
// basis: estimate
// 차트: 드러낸 계열을 보이고, 이 박자에 드러내는 계열은 자라는 움직임을 다시 건다. light가 있으면 나머지 행을 흐린다.
function drawChartState(stage, seg) {
  stage.seriesEls.forEach((els, s) => {
    const isGrowing = seg.growing.includes(s);
    for (const el of els) {
      el.classList.toggle('hidden', !seg.series.includes(s));
      el.classList.remove('play');
      if (isGrowing) {
        el.getBoundingClientRect();
        el.classList.add('play');
      }
    }
  });
  stage.labelEls.forEach((el, k) => el.style.setProperty('--label-shift', `${seg.labelShifts[k] ?? 0}px`));
  stage.rowEls.forEach((els, k) => els.forEach((el) => el.classList.toggle('dim', seg.lights.length > 0 && !seg.lights.includes(k))));
}

// cost: time O(h), heap O(h), stack O(1)
// vars: h = 박자의 이동 수
// basis: estimate
function resetPackets(stage, seg) {
  stage.packets.forEach((p) => p.remove());
  stage.packets = seg.hops.map((hop) => createPacket(hop, stage));
  stage.packets.forEach((packet) => packet.move(0));
}

// cost: time O(h + k), heap O(1), stack O(1)
// vars: h = 박자의 이동 수, k = 카드가 바뀌는 도형 수
// basis: estimate
// 점을 옮기고, 도착한 도형의 카드를 바꾼다.
function advanceStage(stage, seg, elapsed) {
  stage.packets.forEach((packet) => packet.move(elapsed));
  stage.pendingCards = stage.pendingCards.filter(({ n, at }) => {
    if (elapsed < at) return true;
    showCards(stage, seg.cards, n);
    return false;
  });
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 상자 줄 수
// basis: estimate
// 점과 글 상자. 글 상자 줄과 자리는 시간표가 움직이는 SVG와 같게 정해 넘긴다.
function createPacket(hop, stage) {
  const { metrics } = stage;
  const path = stage.paths[hop.edge];
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'fl-packet');
  g.innerHTML = `<circle r="${metrics.halo}" fill="${metrics.active}" opacity="${metrics.haloOpacity}"/><circle r="${metrics.packet}" fill="${metrics.active}"/>`;
  stage.packetLayer.appendChild(g);
  const chip = hop.data ? createChip(hop.data, stage) : undefined;
  if (chip) g.appendChild(chip.g);
  const length = path.getTotalLength();
  const slide = chipSlide(hop, metrics);
  return {
    remove: () => g.remove(),
    move(t) {
      const p = Math.min(1, t / hop.ms);
      const eased = progressAt(metrics.move, p);
      const point = path.getPointAtLength(length * (hop.isBack ? 1 - eased : eased));
      g.setAttribute('transform', `translate(${point.x} ${point.y})`);
      if (chip) chip.g.setAttribute('transform', `translate(${slide(p)})`);
      g.style.opacity = p >= 1 ? 0 : 1;
    },
  };
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 글 상자 줄 수
// basis: estimate
function createChip(lines, stage) {
  const { metrics } = stage;
  const chip = document.createElementNS(SVG_NS, 'g');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('rx', metrics.chipRadius);
  rect.setAttribute('fill', metrics.chipFill);
  chip.appendChild(rect);
  const texts = lines.map((line) => createChipLine(line, chip));
  stage.packetLayer.appendChild(chip);
  const w = Math.max(...texts.map((t) => t.getComputedTextLength())) + metrics.chipPadX;
  const h = texts.length * metrics.chipLine + metrics.chipPadY;
  const top = -h - metrics.chipGap;
  rect.setAttribute('x', -w / 2);
  rect.setAttribute('y', top);
  rect.setAttribute('width', w);
  rect.setAttribute('height', h);
  texts.forEach((t, li) => t.setAttribute('y', top + metrics.chipLine * (li + 1)));
  return { g: chip, w, h };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
function createChipLine(line, chip) {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'chip');
  text.append(
    ...richNodes(line, () => {
      const code = document.createElementNS(SVG_NS, 'tspan');
      code.setAttribute('class', 'code');
      return code;
    }),
  );
  chip.appendChild(text);
  return text;
}

// ---- 이동 곡선 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 베지어 곡선의 한 축 값. 매개변수 t의 제어점 a, b로 구한다.
function bezierAxis(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = BISECT_STEPS
// basis: estimate
// 곡선의 한 축 값이 target이 되는 매개변수 t를 이분 탐색으로 구한다.
function solveBezier(a, b, target) {
  let [low, high] = [0, 1];
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (low + high) / 2;
    if (bezierAxis(a, b, mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = BISECT_STEPS
// basis: estimate
// 시간 비율 p에서 이동 곡선의 진행 비율. easing.js의 timeAt과 같은 곡선을 반대 방향으로 푼다.
function progressAt([x1, y1, x2, y2], p) {
  return bezierAxis(y1, y2, solveBezier(x1, x2, p));
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = BISECT_STEPS
// basis: estimate
// 진행 비율 f에 닿는 시간 비율. easing.js의 timeAt과 같다.
function timeAtProgress([x1, y1, x2, y2], f) {
  return bezierAxis(x1, x2, solveBezier(y1, y2, f));
}

// cost: time O(STEPS·k), 프레임마다 O(k), heap O(k), stack O(1)
// vars: STEPS = BISECT_STEPS, k = 경로 지점 수(21)
// basis: estimate
// 글 상자 옮김. 빌드 때 시간표에 담은 경로 지점별 옮김 [진행 비율, dx, dy]를 움직이는 SVG의 옮김 움직임(SMIL, 지점이 점에 닿는 시각 사이를 선형)과 같게 시간 비율 p에서 보간한다.
function chipSlide(hop, metrics) {
  const path = hop.chipPath ?? [];
  const times = path.map(([at]) => timeAtProgress(metrics.move, at));
  return (p) => {
    if (!path.length) return '0 0';
    const k = times.findLastIndex((time) => time <= p);
    if (k < 0) return `${path[0][1]} ${path[0][2]}`;
    if (k === path.length - 1) return `${path[k][1]} ${path[k][2]}`;
    const ratio = times[k + 1] > times[k] ? (p - times[k]) / (times[k + 1] - times[k]) : 1;
    return `${path[k][1] + (path[k + 1][1] - path[k][1]) * ratio} ${path[k][2] + (path[k + 1][2] - path[k][2]) * ratio}`;
  };
}
