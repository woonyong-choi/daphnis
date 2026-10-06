// 조작부 전용 24 격자. 짧은 획과 공통 여백으로 작은 크기에서 시각적 무게를 맞춘다.
export const CONTROL_ICONS = Object.freeze({
  'maximize-2': '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
  'minimize-2': '<path d="M4 8h4V4m8 0v4h4M8 20v-4H4m12 4v-4h4"/>',
  'zoom-in': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M7.5 10.5h6m-3-3v6"/>',
  'zoom-out': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M7.5 10.5h6"/>',
  scan: '<path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3"/>',
  play: '<path d="M7 5.8c0-1.1 1.2-1.7 2.1-1.1l10 6.2a1.3 1.3 0 0 1 0 2.2l-10 6.2C8.2 19.9 7 19.3 7 18.2Z"/>',
  pause: '<path d="M6 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  repeat: '<path d="M4 10V9a3 3 0 0 1 3-3h12m-3-3 3 3-3 3M20 14v1a3 3 0 0 1-3 3H5m3-3-3 3 3 3"/>',
  gauge: '<path d="M5 18a9 9 0 1 1 14 0M12 5v2M6 9l1.5 1M18 9l-6 6"/><path d="M8 19h8"/>',
});
