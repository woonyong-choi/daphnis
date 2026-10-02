// tokens.json: 생성물, 손으로 고치지 않음
function freeze(node) {
  if (typeof node !== 'object') return node;
  return Object.freeze(Object.fromEntries(Object.entries(node).map(([key, value]) => [key, freeze(value)])));
}

/** CSS에 넣을 토큰 참조. 값은 `var(--…)` 문자열이다. */
export const tokens = freeze({
  "color": {
    "gray": {
      "0": "var(--color-gray-0)",
      "25": "var(--color-gray-25)",
      "40": "var(--color-gray-40)",
      "50": "var(--color-gray-50)",
      "100": "var(--color-gray-100)",
      "200": "var(--color-gray-200)",
      "400": "var(--color-gray-400)",
      "600": "var(--color-gray-600)",
      "900": "var(--color-gray-900)"
    },
    "neutral": {
      "100": "var(--color-neutral-100)",
      "400": "var(--color-neutral-400)",
      "600": "var(--color-neutral-600)",
      "700": "var(--color-neutral-700)",
      "750": "var(--color-neutral-750)",
      "800": "var(--color-neutral-800)",
      "850": "var(--color-neutral-850)",
      "900": "var(--color-neutral-900)",
      "950": "var(--color-neutral-950)"
    },
    "blue": {
      "50": "var(--color-blue-50)",
      "200": "var(--color-blue-200)",
      "400": "var(--color-blue-400)",
      "500": "var(--color-blue-500)",
      "600": "var(--color-blue-600)",
      "900": "var(--color-blue-900)",
      "850": "var(--color-blue-850)",
      "800": "var(--color-blue-800)"
    },
    "tone": {
      "blue": "var(--color-tone-blue)",
      "purple": "var(--color-tone-purple)",
      "green": "var(--color-tone-green)",
      "orange": "var(--color-tone-orange)",
      "gray": "var(--color-tone-gray)"
    },
    "accent": "var(--color-accent)",
    "accent-strong": "var(--color-accent-strong)",
    "accent-fill": "var(--color-accent-fill)",
    "on-accent": "var(--color-on-accent)",
    "fg": "var(--color-fg)",
    "muted": "var(--color-muted)",
    "bg": "var(--color-bg)",
    "node": "var(--color-node)",
    "control-on": "var(--color-control-on)",
    "surface": "var(--color-surface)",
    "border": "var(--color-border)",
    "card-on": "var(--color-card-on)",
    "group": "var(--color-group)",
    "group-border": "var(--color-group-border)",
    "frame": "var(--color-frame)",
    "plate-border": "var(--color-plate-border)",
    "page": "var(--color-page)",
    "gallery": "var(--color-gallery)",
    "tag": {
      "blue": "var(--color-tag-blue)",
      "purple": "var(--color-tag-purple)",
      "green": "var(--color-tag-green)",
      "orange": "var(--color-tag-orange)",
      "gray": "var(--color-tag-gray)"
    },
    "orange": {
      "400": "var(--color-orange-400)",
      "500": "var(--color-orange-500)",
      "600": "var(--color-orange-600)"
    },
    "ink": {
      "900": "var(--color-ink-900)",
      "600": "var(--color-ink-600)",
      "200": "var(--color-ink-200)",
      "1000": "var(--color-ink-1000)",
      "850": "var(--color-ink-850)"
    },
    "series-1": "var(--color-series-1)",
    "series-2": "var(--color-series-2)",
    "heat-low": "var(--color-heat-low)",
    "heat-high": "var(--color-heat-high)",
    "heat-ink": "var(--color-heat-ink)",
    "heat-ink-on": "var(--color-heat-ink-on)",
    "grid": "var(--color-grid)"
  },
  "font": {
    "sans": "var(--font-sans)",
    "mono": "var(--font-mono)"
  },
  "size": {
    "text": {
      "9": "var(--size-text-9)",
      "11": "var(--size-text-11)",
      "12": "var(--size-text-12)",
      "13": "var(--size-text-13)",
      "14": "var(--size-text-14)",
      "15": "var(--size-text-15)",
      "22": "var(--size-text-22)"
    },
    "line": {
      "15": "var(--size-line-15)",
      "18": "var(--size-line-18)",
      "20": "var(--size-line-20)",
      "22": "var(--size-line-22)"
    },
    "control": "var(--size-control)",
    "control-inner": "var(--size-control-inner)",
    "pill": "var(--size-pill)",
    "tag": "var(--size-tag)",
    "icon": "var(--size-icon)",
    "packet": "var(--size-packet)",
    "halo": "var(--size-halo)",
    "marker": "var(--size-marker)",
    "marker-on": "var(--size-marker-on)",
    "card": "var(--size-card)",
    "node-min": "var(--size-node-min)",
    "node-max": "var(--size-node-max)",
    "node-min-h": "var(--size-node-min-h)",
    "store-cap": "var(--size-store-cap)",
    "figure-canvas": "var(--size-figure-canvas)",
    "hop-ref": "var(--size-hop-ref)",
    "chip-max": "var(--size-chip-max)",
    "caption-max": "var(--size-caption-max)",
    "gallery-column": "var(--size-gallery-column)",
    "gallery-frame": "var(--size-gallery-frame)",
    "document-column": "var(--size-document-column)",
    "player-chrome": "var(--size-player-chrome)",
    "embedded-chrome": "var(--size-embedded-chrome)",
    "chart-width": "var(--size-chart-width)",
    "chart-label": "var(--size-chart-label)",
    "chart-label-max": "var(--size-chart-label-max)",
    "chart-bar": "var(--size-chart-bar)",
    "chart-row": "var(--size-chart-row)",
    "chart-dot": "var(--size-chart-dot)",
    "person-w": "var(--size-person-w)",
    "person-head": "var(--size-person-head)",
    "person-shoulder": "var(--size-person-shoulder)",
    "person-body": "var(--size-person-body)",
    "state-dot": "var(--size-state-dot)",
    "table-row": "var(--size-table-row)",
    "seq-row": "var(--size-seq-row)",
    "group-title": "var(--size-group-title)",
    "chart-plot-h": "var(--size-chart-plot-h)",
    "chart-axis": "var(--size-chart-axis)",
    "chart-cell": "var(--size-chart-cell)",
    "chart-cap": "var(--size-chart-cap)",
    "chart-range": "var(--size-chart-range)",
    "chart-arrow-min": "var(--size-chart-arrow-min)"
  },
  "weight": {
    "medium": "var(--weight-medium)",
    "semibold": "var(--weight-semibold)"
  },
  "leading": {
    "normal": "var(--leading-normal)"
  },
  "tracking": {
    "tag": "var(--tracking-tag)",
    "frame": "var(--tracking-frame)"
  },
  "space": {
    "0-5": "var(--space-0-5)",
    "1": "var(--space-1)",
    "1-5": "var(--space-1-5)",
    "2": "var(--space-2)",
    "2-5": "var(--space-2-5)",
    "3": "var(--space-3)",
    "3-5": "var(--space-3-5)",
    "4": "var(--space-4)",
    "5": "var(--space-5)",
    "6": "var(--space-6)",
    "6-5": "var(--space-6-5)",
    "7": "var(--space-7)",
    "8": "var(--space-8)",
    "8-5": "var(--space-8-5)",
    "9": "var(--space-9)",
    "11": "var(--space-11)",
    "12": "var(--space-12)",
    "13": "var(--space-13)",
    "14": "var(--space-14)",
    "15": "var(--space-15)",
    "16": "var(--space-16)",
    "17": "var(--space-17)",
    "18": "var(--space-18)",
    "20": "var(--space-20)",
    "22": "var(--space-22)",
    "30": "var(--space-30)",
    "32": "var(--space-32)"
  },
  "radius": {
    "sm": "var(--radius-sm)",
    "md": "var(--radius-md)",
    "lg": "var(--radius-lg)",
    "xl": "var(--radius-xl)",
    "2xl": "var(--radius-2xl)",
    "route": "var(--radius-route)",
    "full": "var(--radius-full)"
  },
  "border": {
    "hair": "var(--border-hair)",
    "thin": "var(--border-thin)",
    "lifeline": "var(--border-lifeline)",
    "tag": "var(--border-tag)",
    "edge": "var(--border-edge)",
    "strong": "var(--border-strong)",
    "halo": "var(--border-halo)"
  },
  "dash": {
    "line": "var(--dash-line)",
    "gap": "var(--dash-gap)",
    "card": "var(--dash-card)"
  },
  "opacity": {
    "tag": "var(--opacity-tag)",
    "halo": "var(--opacity-halo)",
    "dim": "var(--opacity-dim)",
    "band": "var(--opacity-band)",
    "range": "var(--opacity-range)"
  },
  "z": {
    "raised": "var(--z-raised)",
    "overlay": "var(--z-overlay)"
  },
  "duration": {
    "fast": "var(--duration-fast)",
    "hop": "var(--duration-hop)",
    "hop-min": "var(--duration-hop-min)",
    "dwell": "var(--duration-dwell)",
    "dwell-per-char": "var(--duration-dwell-per-char)",
    "dwell-max": "var(--duration-dwell-max)",
    "step-end": "var(--duration-step-end)",
    "chart-cycle": "var(--duration-chart-cycle)",
    "reveal": "var(--duration-reveal)"
  },
  "easing": {
    "move": "var(--easing-move)",
    "reveal": "var(--easing-reveal)"
  },
  "scale": {
    "zoom-max": "var(--scale-zoom-max)",
    "fold-aspect": "var(--scale-fold-aspect)",
    "fold-step": "var(--scale-fold-step)",
    "zoom-step": "var(--scale-zoom-step)"
  }
});

/** 배치 계산에 쓸 밝은 테마의 실제 값. 크기는 px 숫자, 시간은 ms 숫자다. */
export const values = freeze({
  "color": {
    "gray": {
      "0": "#ffffff",
      "25": "#f6f7f9",
      "40": "#eef0f3",
      "50": "#eef1f5",
      "100": "#e3e7ec",
      "200": "#d5dbe3",
      "400": "#9ba6b4",
      "600": "#4b5563",
      "900": "#111418"
    },
    "neutral": {
      "100": "#e3e3e3",
      "400": "#9aa0a6",
      "600": "#55585c",
      "700": "#3a3b3c",
      "750": "#3c3e42",
      "800": "#2c2d30",
      "850": "#242526",
      "900": "#1b1b1d",
      "950": "#111214"
    },
    "blue": {
      "50": "#edf5fb",
      "200": "#a9cdea",
      "400": "#79c0ff",
      "500": "#2b96ed",
      "600": "#1072c2",
      "900": "#1d2933",
      "850": "#2b4254",
      "800": "#1d5d91"
    },
    "tone": {
      "blue": "#2b96ed",
      "purple": "#8b5cf6",
      "green": "#10b981",
      "orange": "#dc6e22",
      "gray": "#8b949e"
    },
    "accent": "#2b96ed",
    "accent-strong": "#1072c2",
    "accent-fill": "#1072c2",
    "on-accent": "#ffffff",
    "fg": "#0b0b0b",
    "muted": "#52514e",
    "bg": "#f6f7f9",
    "node": "#ffffff",
    "control-on": "#ffffff",
    "surface": "#eef1f5",
    "border": "#9ba6b4",
    "card-on": "#edf5fb",
    "group": "#eef0f3",
    "group-border": "#9ba6b4",
    "frame": "#e3e7ec",
    "plate-border": "#d5dbe3",
    "page": "#ffffff",
    "gallery": "#ffffff",
    "tag": {
      "blue": "#2b96ed",
      "purple": "#8b5cf6",
      "green": "#10b981",
      "orange": "#dc6e22",
      "gray": "#8b949e"
    },
    "orange": {
      "400": "#f5a374",
      "500": "#dc6e22",
      "600": "#b45404"
    },
    "ink": {
      "900": "#0b0b0b",
      "600": "#52514e",
      "200": "#c6cacf",
      "1000": "#000000",
      "850": "#0d1117"
    },
    "series-1": "#2b96ed",
    "series-2": "#dc6e22",
    "heat-low": "#a9cdea",
    "heat-high": "#1d5d91",
    "heat-ink": "#000000",
    "heat-ink-on": "#ffffff",
    "grid": "#c6cacf"
  },
  "font": {
    "sans": "FigSans, FigSansKo, Inter, 'Inter Variable', 'Noto Sans KR', 'Noto Sans KR Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
    "mono": "FigMono, FigSans, FigSansKo, ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  "size": {
    "text": {
      "9": 9,
      "11": 11,
      "12": 12,
      "13": 13,
      "14": 14,
      "15": 15,
      "22": 22
    },
    "line": {
      "15": 15,
      "18": 18,
      "20": 20,
      "22": 22
    },
    "control": 30,
    "control-inner": 22,
    "pill": 18,
    "tag": 14,
    "icon": 12,
    "packet": 4.5,
    "halo": 10,
    "marker": 5,
    "marker-on": 4,
    "card": 176,
    "node-min": 100,
    "node-max": 210,
    "node-min-h": 46,
    "store-cap": 12,
    "figure-canvas": 960,
    "hop-ref": 300,
    "chip-max": 210,
    "caption-max": 720,
    "gallery-column": 960,
    "gallery-frame": 820,
    "document-column": 960,
    "player-chrome": 190,
    "embedded-chrome": 150,
    "chart-width": 960,
    "chart-label": 140,
    "chart-label-max": 240,
    "chart-bar": 12,
    "chart-row": 40,
    "chart-dot": 5,
    "person-w": 56,
    "person-head": 20,
    "person-shoulder": 14,
    "person-body": 22,
    "state-dot": 14,
    "table-row": 26,
    "seq-row": 44,
    "group-title": 28,
    "chart-plot-h": 260,
    "chart-axis": 48,
    "chart-cell": 40,
    "chart-cap": 8,
    "chart-range": 6,
    "chart-arrow-min": 16
  },
  "weight": {
    "medium": 500,
    "semibold": 600
  },
  "leading": {
    "normal": 1.5
  },
  "tracking": {
    "tag": 0.03,
    "frame": 0.04
  },
  "space": {
    "0-5": 1,
    "1": 2,
    "1-5": 3,
    "2": 4,
    "2-5": 5,
    "3": 6,
    "3-5": 7,
    "4": 8,
    "5": 10,
    "6": 12,
    "6-5": 13,
    "7": 14,
    "8": 16,
    "8-5": 17,
    "9": 18,
    "11": 22,
    "12": 24,
    "13": 26,
    "14": 28,
    "15": 30,
    "16": 32,
    "17": 34,
    "18": 36,
    "20": 40,
    "22": 44,
    "30": 60,
    "32": 64
  },
  "radius": {
    "sm": 4,
    "md": 6,
    "lg": 8,
    "xl": 10,
    "2xl": 14,
    "route": 22,
    "full": 999
  },
  "border": {
    "hair": 0.75,
    "thin": 1,
    "lifeline": 1.25,
    "tag": 1.5,
    "edge": 1.75,
    "strong": 2.5,
    "halo": 8
  },
  "dash": {
    "line": 5,
    "gap": 4,
    "card": 3
  },
  "opacity": {
    "tag": 0.15,
    "halo": 0.2,
    "dim": 0.3,
    "band": 0.22,
    "range": 0.4
  },
  "z": {
    "raised": 2,
    "overlay": 10
  },
  "duration": {
    "fast": 200,
    "hop": 3750,
    "hop-min": 500,
    "dwell": 700,
    "dwell-per-char": 45,
    "dwell-max": 3200,
    "step-end": 1600,
    "chart-cycle": 7000,
    "reveal": 900
  },
  "easing": {
    "move": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "reveal": "cubic-bezier(0, 0, 0.58, 1)"
  },
  "scale": {
    "zoom-max": 6,
    "fold-aspect": 1.6,
    "fold-step": 0.75,
    "zoom-step": 1.25
  }
});
