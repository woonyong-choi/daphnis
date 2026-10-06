// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 재생 단추와 배속, 진행선, 탭, 설명 글의 백틱 코드.

// ---- 재생 단추와 배속 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function bindControls(root, player) {
  const { clock, pause } = player;
  const rateButton = root.querySelector('.fl-rate');
  const repeat = root.querySelector('.fl-repeat');
  repeat.innerHTML = drawUiIcon(player.data.metrics, 'repeat');
  rateButton.innerHTML = drawUiIcon(player.data.metrics, 'gauge');
  rateButton.title = `배속 ${clock.rate}× · 클릭하여 변경`;
  rateButton.dataset.rate = clock.rate;
  rateButton.setAttribute('aria-description', `${clock.rate}배속`);
  repeat.addEventListener('click', () => {
    clock.repeat = !clock.repeat;
    repeat.setAttribute('aria-pressed', clock.repeat);
    repeat.title = clock.repeat ? '반복 켜짐' : '반복 꺼짐';
  });
  pause.button.addEventListener('click', () => setPlaying(player, !clock.isPlaying));
  rateButton.addEventListener('click', () => {
    clock.rate = nextRate(clock.rate);
    rateButton.title = `배속 ${clock.rate}× · 클릭하여 변경`;
    rateButton.setAttribute('aria-description', `${clock.rate}배속`);
    rateButton.dataset.rate = clock.rate;
    syncChartMotion(player.stage, clock);
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
  if (value && !player.data.segs.length && !player.data.stillMs) return;
  const wasPlaying = clock.isPlaying;
  clock.isPlaying = value;
  if (value && clock.ended) restartPlayback(player);
  clock.before = performance.now();
  if (value && !wasPlaying && clock.elapsed === 0 && player.data.segs.length) {
    drawChartState(player.stage, player.data.segs[clock.index], true);
  }
  pause.icon.innerHTML = playIconSvg(clock.isPlaying, player.data.metrics);
  const label = clock.isPlaying ? '일시정지' : clock.ended ? '다시 재생' : '재생';
  pause.button.setAttribute('aria-label', label);
  pause.button.title = label;
  syncChartMotion(player.stage, clock);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 재생 단추 아이콘. 재생 중이면 일시정지 모양, 멈췄으면 재생 모양이다.
function playIconSvg(isPlaying, metrics) {
  return drawUiIcon(metrics, isPlaying ? 'pause' : 'play');
}

// ---- 진행선 ----

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 마크업의 수평 경로 길이를 읽고 draw(0~1)로 왼쪽부터 채운다.
function createRing(button) {
  const fill = button.querySelector('.fl-ring-fill');
  const length = fill.getTotalLength();
  fill.style.strokeDasharray = length;
  return {
    draw(progress) {
      fill.style.strokeDashoffset = length * (1 - progress);
      fill.style.visibility = progress > 0 ? 'visible' : 'hidden';
    },
  };
}

// ---- 탭 ----

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 탭 수
// basis: estimate
function createTabs(container, player) {
  const { data, stepSegs } = player;
  const buttons = data.steps.map((label, si) => createTab(label, () => {
    setPlaying(player, false);
    enterSegment(player, data.segs.indexOf(stepSegs[si][0]));
    setPlaying(player, false);
  }));
  container.addEventListener('keydown', (event) => moveTab(event, buttons));
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
    button.tabIndex = si === current ? 0 : -1;
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

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 단계 단추 수
// basis: estimate
// 탭 안에서는 화살표로 장면을 고르고 Tab은 조작 묶음 밖으로 이동한다.
function moveTab(event, buttons) {
  const current = buttons.indexOf(event.target);
  if (current < 0) return;
  const keys = { ArrowRight: (current + 1) % buttons.length, ArrowLeft: (current + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 };
  const next = keys[event.key];
  if (next === undefined) return;
  event.preventDefault();
  buttons[next].click();
  buttons[next].focus();
}
