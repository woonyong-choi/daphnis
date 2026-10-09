// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 이 문서를 단독으로 열리는 HTML 파일로 내려받는다.
// 지금 화면(DOM)을 직렬화하지 않는다. 컴파일러가 만든 정본 템플릿을 문서 머리의 meta 칸에 base64로 넣어 두었으므로, 그 정본에 칸 내용을 다시 채워 내보낸다.
// 그래서 모든 장면, 설정, 글꼴, 아이콘이 들어 있고 현재 장면, 시간, 확대, 테마는 담기지 않으며, 내려받은 파일에서 다시 내려받아도 바이트가 같다.
// CANONICAL_NAME(칸 이름)은 html.js가 이 파일 앞에 상수로 붙인다.

// 내려받기를 시작한 뒤 임시 주소를 거두기까지 기다리는 시간(ms). 브라우저가 파일을 받아 가는 동안 주소가 살아 있어야 한다.
const REVOKE_DELAY_MS = 10_000;

// 도구 막대의 내려받기 단추를 붙인다. 정본 칸이 없으면(손으로 고친 문서) 단추를 숨긴다.
function bindDownload(root, metrics) {
  const button = root.querySelector('.fl-download');
  button.innerHTML = drawUiIcon(metrics, 'download');
  button.title = button.getAttribute('aria-label');
  button.hidden = !document.querySelector(`meta[name="${CANONICAL_NAME}"]`);
  button.addEventListener('click', downloadDocument);
}

// 정본 템플릿을 풀고 칸에 같은 base64를 채워 파일로 내려보낸다. 파일은 서버 없이 만든다.
function downloadDocument() {
  const encoded = document.querySelector(`meta[name="${CANONICAL_NAME}"]`).content;
  const template = new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
  // 칸 머리글을 조각으로 이어 만들어, 이 스크립트 글 안에는 같은 글이 따로 나오지 않는다. 그래서 템플릿에서 첫 번째로 찾은 것이 문서 머리의 칸이다.
  const head = '<meta name="' + CANONICAL_NAME + '" content="';
  const at = template.indexOf(head) + head.length;
  const text = template.slice(0, at) + encoded + template.slice(at);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
  link.download = downloadName();
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), REVOKE_DELAY_MS);
}

// 문서 제목에서 파일 이름을 만든다. 파일 이름에 못 쓰는 글자와 공백은 줄표로 바꾼다.
function downloadName() {
  const stem = document.title.replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return `${stem || 'daphnis'}.html`;
}
