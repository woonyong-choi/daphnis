// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 장면 탭과 글의 백틱 코드. 재생을 멈추거나 되감는 조작은 두지 않는다.

// ---- 탭 ----

// 장면마다 탭 하나. 탭은 캔버스 아래 가운데에 놓는 분절 조작이다(CSS .fl-tabs). 누르면 onSelect(장면 번호)를 부르고, 같은 장면을 다시 누를 때의 처리는 부른 쪽이 정한다.
// 탭이 줄 폭보다 많으면 줄을 바꿔 모두 보인다. 탭을 위해 스크롤하거나 가장자리를 흐리지 않는다.
function createTabs(container, scenes, onSelect) {
  const buttons = scenes.map(({ label }, si) => createTab(label, () => onSelect(si)));
  container.addEventListener('keydown', (event) => moveTab(event, buttons));
  container.append(...buttons);
  return buttons;
}

function createTab(label, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.append(...richNodes(label, htmlCode));
  button.addEventListener('click', onSelect);
  return button;
}

function markTabs(buttons, current) {
  buttons.forEach((button, si) => {
    button.classList.toggle('on', si === current);
    button.setAttribute('aria-selected', si === current);
    button.tabIndex = si === current ? 0 : -1;
  });
}

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

function htmlCode() {
  const code = document.createElement('code');
  code.className = 'fl-code';
  return code;
}

// 탭 안에서는 화살표로 장면을 고르고 Tab은 탭 묶음 밖으로 이동한다.
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
