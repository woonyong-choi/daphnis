// 조작부 전용 24 격자. 짧은 획과 공통 여백으로 작은 크기에서 시각적 무게를 맞춘다. 도구 막대의 세 단추(복사, 다운로드, 전체 화면)와 확대·축소, 단추에 잠깐 나타나는 결과 표시가 모두 같은 격자와 같은 선 굵기를 쓴다.
export const CONTROL_ICONS = Object.freeze({
  copy: '<path d="M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"/><path d="M5 15V7a3 3 0 0 1 3-3h8"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5M5 19h14"/>',
  'maximize-2': '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
  'minimize-2': '<path d="M4 8h4V4m8 0v4h4M8 20v-4H4m12 4v-4h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5m0 3.5v.01"/>',
  'zoom-in': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M7.5 10.5h6m-3-3v6"/>',
  'zoom-out': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M7.5 10.5h6"/>',
  scan: '<path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3"/>',
});
