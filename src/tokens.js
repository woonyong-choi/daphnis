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
      "27": "var(--color-gray-27)",
      "43": "var(--color-gray-43)",
      "59": "var(--color-gray-59)",
      "71": "var(--color-gray-71)",
      "106": "var(--color-gray-106)",
      "118": "var(--color-gray-118)",
      "145": "var(--color-gray-145)",
      "161": "var(--color-gray-161)",
      "212": "var(--color-gray-212)",
      "220": "var(--color-gray-220)",
      "282": "var(--color-gray-282)",
      "333": "var(--color-gray-333)",
      "467": "var(--color-gray-467)",
      "529": "var(--color-gray-529)",
      "545": "var(--color-gray-545)",
      "635": "var(--color-gray-635)",
      "651": "var(--color-gray-651)",
      "757": "var(--color-gray-757)",
      "776": "var(--color-gray-776)",
      "788": "var(--color-gray-788)",
      "796": "var(--color-gray-796)",
      "835": "var(--color-gray-835)",
      "875": "var(--color-gray-875)",
      "878": "var(--color-gray-878)",
      "910": "var(--color-gray-910)",
      "929": "var(--color-gray-929)",
      "933": "var(--color-gray-933)",
      "1000": "var(--color-gray-1000)"
    },
    "blue": {
      "anchor": "var(--color-blue-anchor)",
      "light-fill": "var(--color-blue-light-fill)",
      "light-stroke": "var(--color-blue-light-stroke)",
      "light-ink": "var(--color-blue-light-ink)",
      "light-heat-low": "var(--color-blue-light-heat-low)",
      "light-heat-high": "var(--color-blue-light-heat-high)",
      "light-outline": "var(--color-blue-light-outline)",
      "light-tint-1": "var(--color-blue-light-tint-1)",
      "light-tint-2": "var(--color-blue-light-tint-2)",
      "light-tint-3": "var(--color-blue-light-tint-3)",
      "dark-fill": "var(--color-blue-dark-fill)",
      "dark-stroke": "var(--color-blue-dark-stroke)",
      "dark-ink": "var(--color-blue-dark-ink)",
      "dark-heat-low": "var(--color-blue-dark-heat-low)",
      "dark-heat-high": "var(--color-blue-dark-heat-high)",
      "dark-outline": "var(--color-blue-dark-outline)",
      "dark-tint-1": "var(--color-blue-dark-tint-1)",
      "dark-tint-2": "var(--color-blue-dark-tint-2)",
      "dark-tint-3": "var(--color-blue-dark-tint-3)"
    },
    "purple": {
      "anchor": "var(--color-purple-anchor)",
      "light-fill": "var(--color-purple-light-fill)",
      "light-stroke": "var(--color-purple-light-stroke)",
      "light-ink": "var(--color-purple-light-ink)",
      "light-dot": "var(--color-purple-light-dot)",
      "light-outline": "var(--color-purple-light-outline)",
      "light-tint-1": "var(--color-purple-light-tint-1)",
      "light-tint-2": "var(--color-purple-light-tint-2)",
      "light-tint-3": "var(--color-purple-light-tint-3)",
      "dark-fill": "var(--color-purple-dark-fill)",
      "dark-stroke": "var(--color-purple-dark-stroke)",
      "dark-ink": "var(--color-purple-dark-ink)",
      "dark-dot": "var(--color-purple-dark-dot)",
      "dark-outline": "var(--color-purple-dark-outline)",
      "dark-tint-1": "var(--color-purple-dark-tint-1)",
      "dark-tint-2": "var(--color-purple-dark-tint-2)",
      "dark-tint-3": "var(--color-purple-dark-tint-3)"
    },
    "red": {
      "anchor": "var(--color-red-anchor)",
      "light-fill": "var(--color-red-light-fill)",
      "light-stroke": "var(--color-red-light-stroke)",
      "light-ink": "var(--color-red-light-ink)",
      "light-dot": "var(--color-red-light-dot)",
      "light-outline": "var(--color-red-light-outline)",
      "dark-fill": "var(--color-red-dark-fill)",
      "dark-stroke": "var(--color-red-dark-stroke)",
      "dark-ink": "var(--color-red-dark-ink)",
      "dark-dot": "var(--color-red-dark-dot)",
      "dark-outline": "var(--color-red-dark-outline)"
    },
    "green": {
      "anchor": "var(--color-green-anchor)",
      "light-fill": "var(--color-green-light-fill)",
      "light-stroke": "var(--color-green-light-stroke)",
      "light-ink": "var(--color-green-light-ink)",
      "light-dot": "var(--color-green-light-dot)",
      "light-outline": "var(--color-green-light-outline)",
      "dark-fill": "var(--color-green-dark-fill)",
      "dark-stroke": "var(--color-green-dark-stroke)",
      "dark-ink": "var(--color-green-dark-ink)",
      "dark-dot": "var(--color-green-dark-dot)",
      "dark-outline": "var(--color-green-dark-outline)"
    },
    "orange": {
      "anchor": "var(--color-orange-anchor)",
      "light-fill": "var(--color-orange-light-fill)",
      "light-stroke": "var(--color-orange-light-stroke)",
      "light-ink": "var(--color-orange-light-ink)",
      "light-outline": "var(--color-orange-light-outline)",
      "dark-fill": "var(--color-orange-dark-fill)",
      "dark-stroke": "var(--color-orange-dark-stroke)",
      "dark-ink": "var(--color-orange-dark-ink)",
      "dark-outline": "var(--color-orange-dark-outline)"
    },
    "fg": "var(--color-fg)",
    "muted": "var(--color-muted)",
    "group-title": "var(--color-group-title)",
    "bg": "var(--color-bg)",
    "node": "var(--color-node)",
    "surface": "var(--color-surface)",
    "card": "var(--color-card)",
    "card-on": "var(--color-card-on)",
    "page": "var(--color-page)",
    "outline": "var(--color-outline)",
    "border": "var(--color-border)",
    "plate-border": "var(--color-plate-border)",
    "line": "var(--color-line)",
    "state": {
      "active": "var(--color-state-active)",
      "active-fill": "var(--color-state-active-fill)",
      "active-text": "var(--color-state-active-text)",
      "on-active": "var(--color-state-on-active)",
      "error": "var(--color-state-error)",
      "success": "var(--color-state-success)",
      "warning": "var(--color-state-warning)",
      "glow": "var(--color-state-glow)"
    },
    "flow": {
      "brand": "var(--color-flow-brand)",
      "purple": "var(--color-flow-purple)",
      "green": "var(--color-flow-green)",
      "gray": "var(--color-flow-gray)",
      "red": "var(--color-flow-red)",
      "amber": "var(--color-flow-amber)"
    },
    "ui": {
      "link": "var(--color-ui-link)",
      "focus": "var(--color-ui-focus)",
      "progress": "var(--color-ui-progress)",
      "control-on": "var(--color-ui-control-on)"
    },
    "data": {
      "main": "var(--color-data-main)",
      "compare": "var(--color-data-compare)",
      "heat-low": "var(--color-data-heat-low)",
      "heat-high": "var(--color-data-heat-high)",
      "heat-ink": "var(--color-data-heat-ink)",
      "heat-ink-on": "var(--color-data-heat-ink-on)",
      "grid": "var(--color-data-grid)",
      "compare-fill": "var(--color-data-compare-fill)",
      "compare-outline": "var(--color-data-compare-outline)",
      "main-fill": "var(--color-data-main-fill)",
      "category-family": {
        "1": "var(--color-data-category-family-1)",
        "2": "var(--color-data-category-family-2)",
        "3": "var(--color-data-category-family-3)",
        "4": "var(--color-data-category-family-4)",
        "5": "var(--color-data-category-family-5)",
        "6": "var(--color-data-category-family-6)",
        "7": "var(--color-data-category-family-7)"
      },
      "category": {
        "1": "var(--color-data-category-1)",
        "2": "var(--color-data-category-2)",
        "3": "var(--color-data-category-3)",
        "4": "var(--color-data-category-4)",
        "5": "var(--color-data-category-5)",
        "6": "var(--color-data-category-6)",
        "7": "var(--color-data-category-7)"
      },
      "category-outline": {
        "1": "var(--color-data-category-outline-1)",
        "2": "var(--color-data-category-outline-2)",
        "3": "var(--color-data-category-outline-3)",
        "4": "var(--color-data-category-outline-4)",
        "5": "var(--color-data-category-outline-5)",
        "6": "var(--color-data-category-outline-6)",
        "7": "var(--color-data-category-outline-7)"
      },
      "category-ink": {
        "1": "var(--color-data-category-ink-1)",
        "2": "var(--color-data-category-ink-2)",
        "3": "var(--color-data-category-ink-3)",
        "4": "var(--color-data-category-ink-4)",
        "5": "var(--color-data-category-ink-5)",
        "6": "var(--color-data-category-ink-6)",
        "7": "var(--color-data-category-ink-7)"
      },
      "category-effect": {
        "1": "var(--color-data-category-effect-1)",
        "2": "var(--color-data-category-effect-2)",
        "3": "var(--color-data-category-effect-3)",
        "4": "var(--color-data-category-effect-4)",
        "5": "var(--color-data-category-effect-5)",
        "6": "var(--color-data-category-effect-6)",
        "7": "var(--color-data-category-effect-7)"
      },
      "category-tint": {
        "1": "var(--color-data-category-tint-1)",
        "2": "var(--color-data-category-tint-2)",
        "3": "var(--color-data-category-tint-3)",
        "4": "var(--color-data-category-tint-4)",
        "5": "var(--color-data-category-tint-5)",
        "6": "var(--color-data-category-tint-6)",
        "7": "var(--color-data-category-tint-7)"
      },
      "category-on": {
        "1": "var(--color-data-category-on-1)",
        "2": "var(--color-data-category-on-2)",
        "3": "var(--color-data-category-on-3)",
        "4": "var(--color-data-category-on-4)",
        "5": "var(--color-data-category-on-5)",
        "6": "var(--color-data-category-on-6)",
        "7": "var(--color-data-category-on-7)"
      },
      "category-pattern": {
        "1": "var(--color-data-category-pattern-1)",
        "2": "var(--color-data-category-pattern-2)",
        "3": "var(--color-data-category-pattern-3)"
      },
      "category-shape": {
        "1": "var(--color-data-category-shape-1)",
        "2": "var(--color-data-category-shape-2)",
        "3": "var(--color-data-category-shape-3)",
        "4": "var(--color-data-category-shape-4)"
      },
      "category-revision": {
        "1": {
          "family": "var(--color-data-category-revision-1-family)",
          "pattern": "var(--color-data-category-revision-1-pattern)",
          "shape": "var(--color-data-category-revision-1-shape)",
          "step": "var(--color-data-category-revision-1-step)"
        }
      },
      "category-label": {
        "1": "var(--color-data-category-label-1)",
        "2": "var(--color-data-category-label-2)",
        "3": "var(--color-data-category-label-3)",
        "4": "var(--color-data-category-label-4)",
        "5": "var(--color-data-category-label-5)",
        "6": "var(--color-data-category-label-6)",
        "7": "var(--color-data-category-label-7)"
      },
      "category-area": {
        "1": "var(--color-data-category-area-1)",
        "2": "var(--color-data-category-area-2)",
        "3": "var(--color-data-category-area-3)",
        "4": "var(--color-data-category-area-4)",
        "5": "var(--color-data-category-area-5)",
        "6": "var(--color-data-category-area-6)",
        "7": "var(--color-data-category-area-7)"
      },
      "category-on-area": {
        "1": "var(--color-data-category-on-area-1)",
        "2": "var(--color-data-category-on-area-2)",
        "3": "var(--color-data-category-on-area-3)",
        "4": "var(--color-data-category-on-area-4)",
        "5": "var(--color-data-category-on-area-5)",
        "6": "var(--color-data-category-on-area-6)",
        "7": "var(--color-data-category-on-area-7)"
      }
    },
    "accent": "var(--color-accent)",
    "figure": {
      "icon-service-ink": "var(--color-figure-icon-service-ink)",
      "icon-service-surface": "var(--color-figure-icon-service-surface)",
      "icon-data-ink": "var(--color-figure-icon-data-ink)",
      "icon-data-surface": "var(--color-figure-icon-data-surface)",
      "icon-access-ink": "var(--color-figure-icon-access-ink)",
      "icon-access-surface": "var(--color-figure-icon-access-surface)",
      "icon-person-ink": "var(--color-figure-icon-person-ink)",
      "icon-person-surface": "var(--color-figure-icon-person-surface)",
      "icon-brand-ink": "var(--color-figure-icon-brand-ink)",
      "icon-brand-surface": "var(--color-figure-icon-brand-surface)",
      "number-fill": "var(--color-figure-number-fill)",
      "number-ink": "var(--color-figure-number-ink)",
      "icon": "var(--color-figure-icon)",
      "icon-tile": "var(--color-figure-icon-tile)",
      "queue-fill": "var(--color-figure-queue-fill)",
      "queue-empty": "var(--color-figure-queue-empty)"
    },
    "category": {
      "blue": {
        "anchor": "var(--color-category-blue-anchor)",
        "fill": "var(--color-category-blue-fill)",
        "on": "var(--color-category-blue-on)",
        "light-border": "var(--color-category-blue-light-border)",
        "light-ink": "var(--color-category-blue-light-ink)",
        "light-tint-1": "var(--color-category-blue-light-tint-1)",
        "light-tint-2": "var(--color-category-blue-light-tint-2)",
        "light-tint-3": "var(--color-category-blue-light-tint-3)",
        "dark-border": "var(--color-category-blue-dark-border)",
        "dark-ink": "var(--color-category-blue-dark-ink)",
        "dark-tint-1": "var(--color-category-blue-dark-tint-1)",
        "dark-tint-2": "var(--color-category-blue-dark-tint-2)",
        "dark-tint-3": "var(--color-category-blue-dark-tint-3)",
        "light-effect": "var(--color-category-blue-light-effect)",
        "dark-effect": "var(--color-category-blue-dark-effect)",
        "area": "var(--color-category-blue-area)",
        "on-area": "var(--color-category-blue-on-area)"
      },
      "yellow": {
        "anchor": "var(--color-category-yellow-anchor)",
        "fill": "var(--color-category-yellow-fill)",
        "on": "var(--color-category-yellow-on)",
        "light-border": "var(--color-category-yellow-light-border)",
        "light-ink": "var(--color-category-yellow-light-ink)",
        "light-tint-1": "var(--color-category-yellow-light-tint-1)",
        "light-tint-2": "var(--color-category-yellow-light-tint-2)",
        "light-tint-3": "var(--color-category-yellow-light-tint-3)",
        "dark-border": "var(--color-category-yellow-dark-border)",
        "dark-ink": "var(--color-category-yellow-dark-ink)",
        "dark-tint-1": "var(--color-category-yellow-dark-tint-1)",
        "dark-tint-2": "var(--color-category-yellow-dark-tint-2)",
        "dark-tint-3": "var(--color-category-yellow-dark-tint-3)",
        "light-effect": "var(--color-category-yellow-light-effect)",
        "dark-effect": "var(--color-category-yellow-dark-effect)",
        "area": "var(--color-category-yellow-area)",
        "on-area": "var(--color-category-yellow-on-area)"
      },
      "red": {
        "anchor": "var(--color-category-red-anchor)",
        "fill": "var(--color-category-red-fill)",
        "on": "var(--color-category-red-on)",
        "light-border": "var(--color-category-red-light-border)",
        "light-ink": "var(--color-category-red-light-ink)",
        "light-tint-1": "var(--color-category-red-light-tint-1)",
        "light-tint-2": "var(--color-category-red-light-tint-2)",
        "light-tint-3": "var(--color-category-red-light-tint-3)",
        "dark-border": "var(--color-category-red-dark-border)",
        "dark-ink": "var(--color-category-red-dark-ink)",
        "dark-tint-1": "var(--color-category-red-dark-tint-1)",
        "dark-tint-2": "var(--color-category-red-dark-tint-2)",
        "dark-tint-3": "var(--color-category-red-dark-tint-3)",
        "light-effect": "var(--color-category-red-light-effect)",
        "dark-effect": "var(--color-category-red-dark-effect)",
        "area": "var(--color-category-red-area)",
        "on-area": "var(--color-category-red-on-area)"
      },
      "green": {
        "anchor": "var(--color-category-green-anchor)",
        "fill": "var(--color-category-green-fill)",
        "on": "var(--color-category-green-on)",
        "light-border": "var(--color-category-green-light-border)",
        "light-ink": "var(--color-category-green-light-ink)",
        "light-tint-1": "var(--color-category-green-light-tint-1)",
        "light-tint-2": "var(--color-category-green-light-tint-2)",
        "light-tint-3": "var(--color-category-green-light-tint-3)",
        "dark-border": "var(--color-category-green-dark-border)",
        "dark-ink": "var(--color-category-green-dark-ink)",
        "dark-tint-1": "var(--color-category-green-dark-tint-1)",
        "dark-tint-2": "var(--color-category-green-dark-tint-2)",
        "dark-tint-3": "var(--color-category-green-dark-tint-3)",
        "light-effect": "var(--color-category-green-light-effect)",
        "dark-effect": "var(--color-category-green-dark-effect)",
        "area": "var(--color-category-green-area)",
        "on-area": "var(--color-category-green-on-area)"
      },
      "orange": {
        "anchor": "var(--color-category-orange-anchor)",
        "fill": "var(--color-category-orange-fill)",
        "on": "var(--color-category-orange-on)",
        "light-border": "var(--color-category-orange-light-border)",
        "light-ink": "var(--color-category-orange-light-ink)",
        "light-tint-1": "var(--color-category-orange-light-tint-1)",
        "light-tint-2": "var(--color-category-orange-light-tint-2)",
        "light-tint-3": "var(--color-category-orange-light-tint-3)",
        "dark-border": "var(--color-category-orange-dark-border)",
        "dark-ink": "var(--color-category-orange-dark-ink)",
        "dark-tint-1": "var(--color-category-orange-dark-tint-1)",
        "dark-tint-2": "var(--color-category-orange-dark-tint-2)",
        "dark-tint-3": "var(--color-category-orange-dark-tint-3)",
        "light-effect": "var(--color-category-orange-light-effect)",
        "dark-effect": "var(--color-category-orange-dark-effect)",
        "area": "var(--color-category-orange-area)",
        "on-area": "var(--color-category-orange-on-area)"
      },
      "purple": {
        "anchor": "var(--color-category-purple-anchor)",
        "fill": "var(--color-category-purple-fill)",
        "on": "var(--color-category-purple-on)",
        "light-border": "var(--color-category-purple-light-border)",
        "light-ink": "var(--color-category-purple-light-ink)",
        "light-tint-1": "var(--color-category-purple-light-tint-1)",
        "light-tint-2": "var(--color-category-purple-light-tint-2)",
        "light-tint-3": "var(--color-category-purple-light-tint-3)",
        "dark-border": "var(--color-category-purple-dark-border)",
        "dark-ink": "var(--color-category-purple-dark-ink)",
        "dark-tint-1": "var(--color-category-purple-dark-tint-1)",
        "dark-tint-2": "var(--color-category-purple-dark-tint-2)",
        "dark-tint-3": "var(--color-category-purple-dark-tint-3)",
        "light-effect": "var(--color-category-purple-light-effect)",
        "dark-effect": "var(--color-category-purple-dark-effect)",
        "area": "var(--color-category-purple-area)",
        "on-area": "var(--color-category-purple-on-area)"
      },
      "cyan": {
        "anchor": "var(--color-category-cyan-anchor)",
        "fill": "var(--color-category-cyan-fill)",
        "on": "var(--color-category-cyan-on)",
        "light-border": "var(--color-category-cyan-light-border)",
        "light-ink": "var(--color-category-cyan-light-ink)",
        "light-tint-1": "var(--color-category-cyan-light-tint-1)",
        "light-tint-2": "var(--color-category-cyan-light-tint-2)",
        "light-tint-3": "var(--color-category-cyan-light-tint-3)",
        "dark-border": "var(--color-category-cyan-dark-border)",
        "dark-ink": "var(--color-category-cyan-dark-ink)",
        "dark-tint-1": "var(--color-category-cyan-dark-tint-1)",
        "dark-tint-2": "var(--color-category-cyan-dark-tint-2)",
        "dark-tint-3": "var(--color-category-cyan-dark-tint-3)",
        "light-effect": "var(--color-category-cyan-light-effect)",
        "dark-effect": "var(--color-category-cyan-dark-effect)",
        "area": "var(--color-category-cyan-area)",
        "on-area": "var(--color-category-cyan-on-area)"
      }
    },
    "sequential": {
      "light-low": "var(--color-sequential-light-low)",
      "dark-low": "var(--color-sequential-dark-low)",
      "high": "var(--color-sequential-high)"
    },
    "palette": {
      "sky": {
        "light-fill": "var(--color-palette-sky-light-fill)",
        "light-stroke": "var(--color-palette-sky-light-stroke)",
        "light-ink": "var(--color-palette-sky-light-ink)",
        "light-tint-1": "var(--color-palette-sky-light-tint-1)",
        "light-tint-2": "var(--color-palette-sky-light-tint-2)",
        "light-tint-3": "var(--color-palette-sky-light-tint-3)",
        "light-outline": "var(--color-palette-sky-light-outline)",
        "dark-fill": "var(--color-palette-sky-dark-fill)",
        "dark-stroke": "var(--color-palette-sky-dark-stroke)",
        "dark-ink": "var(--color-palette-sky-dark-ink)",
        "dark-tint-1": "var(--color-palette-sky-dark-tint-1)",
        "dark-tint-2": "var(--color-palette-sky-dark-tint-2)",
        "dark-tint-3": "var(--color-palette-sky-dark-tint-3)",
        "dark-outline": "var(--color-palette-sky-dark-outline)"
      },
      "slate": {
        "light-fill": "var(--color-palette-slate-light-fill)",
        "light-stroke": "var(--color-palette-slate-light-stroke)",
        "light-ink": "var(--color-palette-slate-light-ink)",
        "light-dot": "var(--color-palette-slate-light-dot)",
        "dark-fill": "var(--color-palette-slate-dark-fill)",
        "dark-stroke": "var(--color-palette-slate-dark-stroke)",
        "dark-ink": "var(--color-palette-slate-dark-ink)",
        "dark-dot": "var(--color-palette-slate-dark-dot)",
        "light-outline": "var(--color-palette-slate-light-outline)",
        "dark-outline": "var(--color-palette-slate-dark-outline)"
      }
    },
    "tag": {
      "purple": "var(--color-tag-purple)",
      "green": "var(--color-tag-green)",
      "gray": "var(--color-tag-gray)",
      "red": "var(--color-tag-red)",
      "brand": "var(--color-tag-brand)",
      "amber": "var(--color-tag-amber)"
    },
    "paint": {
      "red": {
        "fill": "var(--color-paint-red-fill)",
        "stroke": "var(--color-paint-red-stroke)",
        "outline": "var(--color-paint-red-outline)",
        "ink": "var(--color-paint-red-ink)",
        "dot": "var(--color-paint-red-dot)"
      },
      "green": {
        "fill": "var(--color-paint-green-fill)",
        "stroke": "var(--color-paint-green-stroke)",
        "outline": "var(--color-paint-green-outline)",
        "ink": "var(--color-paint-green-ink)",
        "dot": "var(--color-paint-green-dot)"
      },
      "purple": {
        "fill": "var(--color-paint-purple-fill)",
        "stroke": "var(--color-paint-purple-stroke)",
        "outline": "var(--color-paint-purple-outline)",
        "ink": "var(--color-paint-purple-ink)",
        "dot": "var(--color-paint-purple-dot)",
        "group-1": "var(--color-paint-purple-group-1)",
        "group-2": "var(--color-paint-purple-group-2)",
        "group-3": "var(--color-paint-purple-group-3)"
      },
      "sky": {
        "fill": "var(--color-paint-sky-fill)",
        "stroke": "var(--color-paint-sky-stroke)",
        "outline": "var(--color-paint-sky-outline)",
        "ink": "var(--color-paint-sky-ink)",
        "group-1": "var(--color-paint-sky-group-1)",
        "group-2": "var(--color-paint-sky-group-2)",
        "group-3": "var(--color-paint-sky-group-3)"
      },
      "gray": {
        "fill": "var(--color-paint-gray-fill)",
        "stroke": "var(--color-paint-gray-stroke)",
        "outline": "var(--color-paint-gray-outline)",
        "ink": "var(--color-paint-gray-ink)",
        "dot": "var(--color-paint-gray-dot)"
      },
      "blue": {
        "fill": "var(--color-paint-blue-fill)",
        "stroke": "var(--color-paint-blue-stroke)",
        "outline": "var(--color-paint-blue-outline)",
        "ink": "var(--color-paint-blue-ink)",
        "dot": "var(--color-paint-blue-dot)",
        "group-1": "var(--color-paint-blue-group-1)",
        "group-2": "var(--color-paint-blue-group-2)",
        "group-3": "var(--color-paint-blue-group-3)",
        "effect": "var(--color-paint-blue-effect)"
      },
      "yellow": {
        "fill": "var(--color-paint-yellow-fill)",
        "stroke": "var(--color-paint-yellow-stroke)",
        "outline": "var(--color-paint-yellow-outline)",
        "ink": "var(--color-paint-yellow-ink)",
        "dot": "var(--color-paint-yellow-dot)",
        "group-1": "var(--color-paint-yellow-group-1)",
        "group-2": "var(--color-paint-yellow-group-2)",
        "group-3": "var(--color-paint-yellow-group-3)",
        "effect": "var(--color-paint-yellow-effect)"
      },
      "orange": {
        "fill": "var(--color-paint-orange-fill)",
        "stroke": "var(--color-paint-orange-stroke)",
        "outline": "var(--color-paint-orange-outline)",
        "ink": "var(--color-paint-orange-ink)",
        "dot": "var(--color-paint-orange-dot)",
        "group-1": "var(--color-paint-orange-group-1)",
        "group-2": "var(--color-paint-orange-group-2)",
        "group-3": "var(--color-paint-orange-group-3)",
        "effect": "var(--color-paint-orange-effect)"
      },
      "cyan": {
        "fill": "var(--color-paint-cyan-fill)",
        "stroke": "var(--color-paint-cyan-stroke)",
        "outline": "var(--color-paint-cyan-outline)",
        "ink": "var(--color-paint-cyan-ink)",
        "dot": "var(--color-paint-cyan-dot)",
        "group-1": "var(--color-paint-cyan-group-1)",
        "group-2": "var(--color-paint-cyan-group-2)",
        "group-3": "var(--color-paint-cyan-group-3)",
        "effect": "var(--color-paint-cyan-effect)"
      }
    },
    "flow-ink": {
      "amber": "var(--color-flow-ink-amber)",
      "brand": "var(--color-flow-ink-brand)",
      "purple": "var(--color-flow-ink-purple)",
      "green": "var(--color-flow-ink-green)",
      "red": "var(--color-flow-ink-red)",
      "gray": "var(--color-flow-ink-gray)"
    },
    "flow-outline": {
      "amber": "var(--color-flow-outline-amber)",
      "brand": "var(--color-flow-outline-brand)",
      "purple": "var(--color-flow-outline-purple)",
      "green": "var(--color-flow-outline-green)",
      "red": "var(--color-flow-outline-red)"
    }
  },
  "font": {
    "sans": "var(--font-sans)",
    "mono": "var(--font-mono)",
    "figure-sans": "var(--font-figure-sans)",
    "figure-mono": "var(--font-figure-mono)"
  },
  "size": {
    "text": {
      "9": "var(--size-text-9)",
      "11": "var(--size-text-11)",
      "13": "var(--size-text-13)",
      "15": "var(--size-text-15)",
      "22": "var(--size-text-22)"
    },
    "control": {
      "outer": "var(--size-control-outer)",
      "inner": "var(--size-control-inner)",
      "icon": "var(--size-control-icon)",
      "icon-stroke": "var(--size-control-icon-stroke)"
    },
    "pill": {
      "height": "var(--size-pill-height)"
    },
    "icon": {
      "node": "var(--size-icon-node)",
      "group": "var(--size-icon-group)",
      "tile": "var(--size-icon-tile)",
      "tile-gap": "var(--size-icon-tile-gap)",
      "grid": "var(--size-icon-grid)"
    },
    "tag": {
      "height": "var(--size-tag-height)"
    },
    "packet": {
      "radius": "var(--size-packet-radius)",
      "halo": "var(--size-packet-halo)",
      "hop-ref": "var(--size-packet-hop-ref)",
      "chip-reach": "var(--size-packet-chip-reach)"
    },
    "arrow": {
      "head": "var(--size-arrow-head)"
    },
    "node": {
      "card-width": "var(--size-node-card-width)",
      "min-width": "var(--size-node-min-width)",
      "max-width": "var(--size-node-max-width)",
      "min-height": "var(--size-node-min-height)",
      "store-cap": "var(--size-node-store-cap)",
      "state-dot": "var(--size-node-state-dot)",
      "table-row": "var(--size-node-table-row)",
      "circle": "var(--size-node-circle)",
      "tile-width": "var(--size-node-tile-width)",
      "tile-pad": "var(--size-node-tile-pad)"
    },
    "grid": {
      "cell": "var(--size-grid-cell)"
    },
    "figure-compact-width": "var(--size-figure-compact-width)",
    "figure-canvas": "var(--size-figure-canvas)",
    "figure-canvas-wide": "var(--size-figure-canvas-wide)",
    "chip": {
      "max-width": "var(--size-chip-max-width)"
    },
    "player": {
      "caption-max": "var(--size-player-caption-max)",
      "embedded-chrome": "var(--size-player-embedded-chrome)"
    },
    "gallery": {
      "column": "var(--size-gallery-column)",
      "frame": "var(--size-gallery-frame)"
    },
    "document": {
      "column": "var(--size-document-column)"
    },
    "chart": {
      "width": "var(--size-chart-width)",
      "compact-width": "var(--size-chart-compact-width)",
      "pattern-spacing": "var(--size-chart-pattern-spacing)",
      "label": "var(--size-chart-label)",
      "label-max": "var(--size-chart-label-max)",
      "bar": "var(--size-chart-bar)",
      "row": "var(--size-chart-row)",
      "dot": "var(--size-chart-dot)",
      "plot-h": "var(--size-chart-plot-h)",
      "axis": "var(--size-chart-axis)",
      "cell": "var(--size-chart-cell)",
      "cap": "var(--size-chart-cap)",
      "range": "var(--size-chart-range)",
      "arrow-min": "var(--size-chart-arrow-min)"
    },
    "queue": {
      "slot-width": "var(--size-queue-slot-width)",
      "slot-height": "var(--size-queue-slot-height)",
      "slot-gap": "var(--size-queue-slot-gap)"
    },
    "sequence": {
      "row": "var(--size-sequence-row)"
    },
    "group": {
      "title": "var(--size-group-title)"
    }
  },
  "weight": {
    "medium": "var(--weight-medium)",
    "semibold": "var(--weight-semibold)"
  },
  "leading": {
    "normal": "var(--leading-normal)",
    "snug": "var(--leading-snug)"
  },
  "tracking": {
    "text": "var(--tracking-text)",
    "tag": "var(--tracking-tag)",
    "frame": "var(--tracking-frame)"
  },
  "space": {
    "1": "var(--space-1)",
    "2": "var(--space-2)",
    "3": "var(--space-3)",
    "4": "var(--space-4)",
    "5": "var(--space-5)",
    "6": "var(--space-6)",
    "7": "var(--space-7)",
    "8": "var(--space-8)",
    "9": "var(--space-9)",
    "11": "var(--space-11)",
    "12": "var(--space-12)",
    "14": "var(--space-14)",
    "15": "var(--space-15)",
    "16": "var(--space-16)",
    "20": "var(--space-20)",
    "22": "var(--space-22)",
    "30": "var(--space-30)",
    "0-5": "var(--space-0-5)",
    "1-5": "var(--space-1-5)",
    "2-5": "var(--space-2-5)"
  },
  "radius": {
    "sm": "var(--radius-sm)",
    "md": "var(--radius-md)",
    "lg": "var(--radius-lg)",
    "xl": "var(--radius-xl)",
    "2xl": "var(--radius-2xl)",
    "full": "var(--radius-full)",
    "route": "var(--radius-route)"
  },
  "border": {
    "hair": "var(--border-hair)",
    "thin": "var(--border-thin)",
    "strong": "var(--border-strong)",
    "lifeline": "var(--border-lifeline)",
    "tag": "var(--border-tag)",
    "edge": "var(--border-edge)",
    "casing": "var(--border-casing)",
    "halo": "var(--border-halo)"
  },
  "z": {
    "raised": "var(--z-raised)",
    "overlay": "var(--z-overlay)"
  },
  "duration": {
    "fast": "var(--duration-fast)",
    "effect-rise": "var(--duration-effect-rise)",
    "effect-hold": "var(--duration-effect-hold)",
    "effect-decay": "var(--duration-effect-decay)",
    "notice": "var(--duration-notice)",
    "hop": "var(--duration-hop)",
    "hop-min": "var(--duration-hop-min)",
    "chip-slide": "var(--duration-chip-slide)",
    "chip-fade": "var(--duration-chip-fade)",
    "chart-cycle": "var(--duration-chart-cycle)",
    "reveal": "var(--duration-reveal)",
    "value-flash": "var(--duration-value-flash)",
    "pulse": "var(--duration-pulse)",
    "chip-frame": "var(--duration-chip-frame)",
    "flow-step": "var(--duration-flow-step)",
    "cut-fade": "var(--duration-cut-fade)"
  },
  "easing": {
    "move": "var(--easing-move)",
    "reveal": "var(--easing-reveal)"
  },
  "simple2": {
    "heading": "var(--simple2-heading)",
    "subheading": "var(--simple2-subheading)",
    "body": "var(--simple2-body)",
    "control": "var(--simple2-control)",
    "caption": "var(--simple2-caption)",
    "page-gutter": "var(--simple2-page-gutter)",
    "page-gap": "var(--simple2-page-gap)",
    "page-width": "var(--simple2-page-width)",
    "reading-width": "var(--simple2-reading-width)",
    "control-gap": "var(--simple2-control-gap)",
    "focus-width": "var(--simple2-focus-width)",
    "leading": "var(--simple2-leading)",
    "title-leading": "var(--simple2-title-leading)",
    "shadow": "var(--simple2-shadow)",
    "node-shadow": "var(--simple2-node-shadow)",
    "corner": "var(--simple2-corner)",
    "control-radius": "var(--simple2-control-radius)",
    "card-gap": "var(--simple2-card-gap)",
    "node-stroke": "var(--simple2-node-stroke)",
    "heading-weight": "var(--simple2-heading-weight)",
    "node-corner": "var(--simple2-node-corner)",
    "separator": "var(--simple2-separator)",
    "canvas-corner": "var(--simple2-canvas-corner)",
    "canvas-fill": "var(--simple2-canvas-fill)",
    "symbol-stroke": "var(--simple2-symbol-stroke)",
    "segment-track": "var(--simple2-segment-track)",
    "segment-ink": "var(--simple2-segment-ink)",
    "segment-hover": "var(--simple2-segment-hover)",
    "segment-on": "var(--simple2-segment-on)",
    "segment-on-hover": "var(--simple2-segment-on-hover)",
    "segment-on-ink": "var(--simple2-segment-on-ink)",
    "segment-radius": "var(--simple2-segment-radius)",
    "segment-item-radius": "var(--simple2-segment-item-radius)",
    "segment-pad": "var(--simple2-segment-pad)",
    "label-size": "var(--simple2-label-size)",
    "detail-size": "var(--simple2-detail-size)",
    "micro-size": "var(--simple2-micro-size)",
    "surface-edge": "var(--simple2-surface-edge)",
    "hover-fill": "var(--simple2-hover-fill)",
    "row-selection": "var(--simple2-row-selection)",
    "card-active-fill": "var(--simple2-card-active-fill)",
    "data-line": "var(--simple2-data-line)",
    "chart-hole": "var(--simple2-chart-hole)",
    "figure-leading": "var(--simple2-figure-leading)",
    "card-row-gap": "var(--simple2-card-row-gap)"
  },
  "primitive": {
    "simple2": {
      "fg": "var(--primitive-simple2-fg)",
      "muted": "var(--primitive-simple2-muted)",
      "bg": "var(--primitive-simple2-bg)",
      "page": "var(--primitive-simple2-page)",
      "node": "var(--primitive-simple2-node)",
      "surface": "var(--primitive-simple2-surface)",
      "plate-border": "var(--primitive-simple2-plate-border)",
      "border": "var(--primitive-simple2-border)",
      "shadow": "var(--primitive-simple2-shadow)",
      "node-shadow": "var(--primitive-simple2-node-shadow)",
      "group-title": "var(--primitive-simple2-group-title)",
      "canvas": "var(--primitive-simple2-canvas)",
      "ui-accent": "var(--primitive-simple2-ui-accent)",
      "ui-accent-hover": "var(--primitive-simple2-ui-accent-hover)",
      "on-ui-accent": "var(--primitive-simple2-on-ui-accent)",
      "hover-fill": "var(--primitive-simple2-hover-fill)",
      "row-selection": "var(--primitive-simple2-row-selection)",
      "card-active-fill": "var(--primitive-simple2-card-active-fill)",
      "line": "var(--primitive-simple2-line)",
      "data-line": "var(--primitive-simple2-data-line)",
      "dark-bg": "var(--primitive-simple2-dark-bg)",
      "dark-page": "var(--primitive-simple2-dark-page)",
      "dark-node": "var(--primitive-simple2-dark-node)",
      "dark-card": "var(--primitive-simple2-dark-card)",
      "dark-edge": "var(--primitive-simple2-dark-edge)",
      "dark-separator": "var(--primitive-simple2-dark-separator)",
      "dark-hover": "var(--primitive-simple2-dark-hover)",
      "dark-selection": "var(--primitive-simple2-dark-selection)",
      "dark-card-active-fill": "var(--primitive-simple2-dark-card-active-fill)",
      "dark-muted": "var(--primitive-simple2-dark-muted)",
      "dark-line": "var(--primitive-simple2-dark-line)",
      "dark-data-line": "var(--primitive-simple2-dark-data-line)",
      "light-outline": "var(--primitive-simple2-light-outline)",
      "dark-outline": "var(--primitive-simple2-dark-outline)",
      "dark-paint-gray": "var(--primitive-simple2-dark-paint-gray)",
      "number-fill": "var(--primitive-simple2-number-fill)",
      "number-ink": "var(--primitive-simple2-number-ink)",
      "chart-hole": "var(--primitive-simple2-chart-hole)"
    }
  },
  "breakpoint": {
    "tablet": "var(--breakpoint-tablet)"
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
    "dim-ink": "var(--opacity-dim-ink)",
    "band": "var(--opacity-band)",
    "range": "var(--opacity-range)",
    "chip-visible-min": "var(--opacity-chip-visible-min)"
  },
  "distance": {
    "card": {
      "min": "var(--distance-card-min)",
      "max": "var(--distance-card-max)"
    },
    "flow": "var(--distance-flow)",
    "neighbor": "var(--distance-neighbor)",
    "neighbor-cvd": "var(--distance-neighbor-cvd)",
    "fill": "var(--distance-fill)",
    "fill-dark": {
      "bg": "var(--distance-fill-dark-bg)",
      "node": "var(--distance-fill-dark-node)"
    }
  },
  "scale": {
    "zoom-max": "var(--scale-zoom-max)",
    "aspect-fit-max": "var(--scale-aspect-fit-max)",
    "fold-aspect": "var(--scale-fold-aspect)",
    "fold-step": "var(--scale-fold-step)",
    "aspect-max": "var(--scale-aspect-max)",
    "zoom-step": "var(--scale-zoom-step)",
    "flow-dots-max": "var(--scale-flow-dots-max)",
    "chip-visible-share": "var(--scale-chip-visible-share)",
    "chip-room-tries": "var(--scale-chip-room-tries)",
    "chip-room-step": "var(--scale-chip-room-step)"
  }
});

/** 배치 계산에 쓸 밝은 테마의 실제 값. 크기는 px 숫자, 시간은 ms 숫자다. */
export const values = freeze({
  "color": {
    "gray": {
      "0": "#ffffff",
      "27": "#f8f8f8",
      "43": "#f4f4f4",
      "59": "#f0f0f0",
      "71": "#ededed",
      "106": "#e4e4e4",
      "118": "#e1e1e1",
      "145": "#dadada",
      "161": "#d6d6d6",
      "212": "#c9c9c9",
      "220": "#c7c7c7",
      "282": "#b7b7b7",
      "333": "#aaaaaa",
      "467": "#888888",
      "529": "#787878",
      "545": "#747474",
      "635": "#5d5d5d",
      "651": "#595959",
      "757": "#3e3e3e",
      "776": "#393939",
      "788": "#363636",
      "796": "#343434",
      "835": "#2a2a2a",
      "875": "#202020",
      "878": "#1f1f1f",
      "910": "#171717",
      "929": "#121212",
      "933": "#111111",
      "1000": "#000000"
    },
    "blue": {
      "anchor": "#1e6bd6",
      "light-fill": "#f7fafe",
      "light-stroke": "#1e6bd6",
      "light-ink": "#1161cb",
      "light-heat-low": "#b2cbf1",
      "light-heat-high": "#1e6bd6",
      "light-outline": "#1e6bd6",
      "light-tint-1": "#f7fafe",
      "light-tint-2": "#e5eefc",
      "light-tint-3": "#d5e4fa",
      "dark-fill": "#303948",
      "dark-stroke": "#3a85f2",
      "dark-ink": "#6da8ff",
      "dark-heat-low": "#32445e",
      "dark-heat-high": "#1e6bd6",
      "dark-outline": "#3a85f2",
      "dark-tint-1": "#303948",
      "dark-tint-2": "#303b4e",
      "dark-tint-3": "#303d54"
    },
    "purple": {
      "anchor": "#7d40c8",
      "light-fill": "#fbf9fe",
      "light-stroke": "#7d40c8",
      "light-ink": "#7d40c8",
      "light-dot": "#7d40c8",
      "light-outline": "#7d40c8",
      "light-tint-1": "#fbf9fe",
      "light-tint-2": "#f1ecfb",
      "light-tint-3": "#e7dff8",
      "dark-fill": "#383547",
      "dark-stroke": "#a269f3",
      "dark-ink": "#bb91ff",
      "dark-dot": "#a269f3",
      "dark-outline": "#a269f3",
      "dark-tint-1": "#383547",
      "dark-tint-2": "#3c364e",
      "dark-tint-3": "#403756"
    },
    "red": {
      "anchor": "#fa1955",
      "light-fill": "#fff8f8",
      "light-stroke": "#fa1955",
      "light-ink": "#cc0041",
      "light-dot": "#fa1955",
      "light-outline": "#fa1955",
      "dark-fill": "#413439",
      "dark-stroke": "#ff315d",
      "dark-ink": "#ff7f8b",
      "dark-dot": "#ff315d",
      "dark-outline": "#ff315d"
    },
    "green": {
      "anchor": "#269c6e",
      "light-fill": "#f7fbf9",
      "light-stroke": "#149265",
      "light-ink": "#00744e",
      "light-dot": "#149265",
      "light-outline": "#149265",
      "dark-fill": "#323b3c",
      "dark-stroke": "#269c6e",
      "dark-ink": "#4cba8a",
      "dark-dot": "#269c6e",
      "dark-outline": "#269c6e"
    },
    "orange": {
      "anchor": "#ff8906",
      "light-fill": "#fff9f5",
      "light-stroke": "#c46800",
      "light-ink": "#9d5100",
      "light-outline": "#c46800",
      "dark-fill": "#3d3738",
      "dark-stroke": "#ff8906",
      "dark-ink": "#ff8906",
      "dark-outline": "#ff8906"
    },
    "fg": "#303336",
    "muted": "#566170",
    "group-title": "#566170",
    "bg": "#f2f5f7",
    "node": "#ffffff",
    "surface": "#eef0f3",
    "card": "#ffffff",
    "card-on": "#f7fafe",
    "page": "#ffffff",
    "outline": "#818181",
    "border": "#838b96",
    "plate-border": "#d4d8de",
    "line": "#9da5b0",
    "state": {
      "active": "#3c84f3",
      "active-fill": "#1e6bd6",
      "active-text": "#1161cb",
      "on-active": "#ffffff",
      "error": "#fa1955",
      "success": "#149265",
      "warning": "#d6b600",
      "glow": "#f7fafe"
    },
    "flow": {
      "brand": "#1e6bd6",
      "purple": "#7d40c8",
      "green": "#269c6e",
      "gray": "#747474",
      "red": "#fa1955",
      "amber": "#f2d024"
    },
    "ui": {
      "link": "#1161cb",
      "focus": "#3c84f3",
      "progress": "#1e6bd6",
      "control-on": "#3c84f3"
    },
    "data": {
      "main": "#1e6bd6",
      "compare": "#f2d024",
      "heat-low": "#b2cbf1",
      "heat-high": "#1e6bd6",
      "heat-ink": "#000000",
      "heat-ink-on": "#ffffff",
      "grid": "#c9c9c9",
      "compare-fill": "#f2d024",
      "compare-outline": "#d6b600",
      "main-fill": "#1e6bd6",
      "category-family": {
        "1": "blue",
        "2": "yellow",
        "3": "red",
        "4": "green",
        "5": "orange",
        "6": "purple",
        "7": "cyan"
      },
      "category": {
        "1": "#1e6bd6",
        "2": "#f2d024",
        "3": "#fa1955",
        "4": "#269c6e",
        "5": "#ff8906",
        "6": "#7d40c8",
        "7": "#25c0cf"
      },
      "category-outline": {
        "1": "#1e6bd6",
        "2": "#d6b600",
        "3": "#fa1955",
        "4": "#149265",
        "5": "#c46800",
        "6": "#7d40c8",
        "7": "#008e9a"
      },
      "category-ink": {
        "1": "#1161cb",
        "2": "#303336",
        "3": "#cc0041",
        "4": "#00744e",
        "5": "#9d5100",
        "6": "#7d40c8",
        "7": "#00717b"
      },
      "category-effect": {
        "1": "#3984f2",
        "2": "#f0d03b",
        "3": "#ff697b",
        "4": "#3aab7c",
        "5": "#df812e",
        "6": "#945ae3",
        "7": "#33a7b3"
      },
      "category-tint": {
        "1": "#f7fafe",
        "2": "#fefcf3",
        "3": "#fff8f8",
        "4": "#f7fbf9",
        "5": "#fff9f5",
        "6": "#fbf9fe",
        "7": "#f5fbfc"
      },
      "category-on": {
        "1": "#ffffff",
        "2": "#000000",
        "3": "#000000",
        "4": "#000000",
        "5": "#000000",
        "6": "#ffffff",
        "7": "#000000"
      },
      "category-pattern": {
        "1": "hatch",
        "2": "dots",
        "3": "cross"
      },
      "category-shape": {
        "1": "circle",
        "2": "square",
        "3": "diamond",
        "4": "triangle"
      },
      "category-revision": {
        "1": {
          "family": 7,
          "pattern": 3,
          "shape": 4,
          "step": 0.5
        }
      },
      "category-label": {
        "1": "optional",
        "2": "required",
        "3": "optional",
        "4": "optional",
        "5": "optional",
        "6": "optional",
        "7": "optional"
      },
      "category-area": {
        "1": "#4370b3",
        "2": "#e6d27a",
        "3": "#d85a69",
        "4": "#569576",
        "5": "#e59960",
        "6": "#7554a8",
        "7": "#6bb9c2"
      },
      "category-on-area": {
        "1": "#ffffff",
        "2": "#000000",
        "3": "#000000",
        "4": "#000000",
        "5": "#000000",
        "6": "#ffffff",
        "7": "#000000"
      }
    },
    "accent": "#1e6bd6",
    "figure": {
      "icon-service-ink": "#1e6bd6",
      "icon-service-surface": "#ffffff",
      "icon-data-ink": "#269c6e",
      "icon-data-surface": "#000000",
      "icon-access-ink": "#f2d024",
      "icon-access-surface": "#000000",
      "icon-person-ink": "#1e6bd6",
      "icon-person-surface": "#ffffff",
      "icon-brand-ink": "#888888",
      "icon-brand-surface": "#f0f0f0",
      "number-fill": "#303336",
      "number-ink": "#ffffff",
      "icon": "#1e6bd6",
      "icon-tile": "#f7fafe",
      "queue-fill": "#1161cb",
      "queue-empty": "#d6d6d6"
    },
    "category": {
      "blue": {
        "anchor": "#1e6bd6",
        "fill": "#1e6bd6",
        "on": "#ffffff",
        "light-border": "#1e6bd6",
        "light-ink": "#1161cb",
        "light-tint-1": "#f7fafe",
        "light-tint-2": "#e5eefc",
        "light-tint-3": "#d5e4fa",
        "dark-border": "#3a85f2",
        "dark-ink": "#6da8ff",
        "dark-tint-1": "#303948",
        "dark-tint-2": "#303b4e",
        "dark-tint-3": "#303d54",
        "light-effect": "#3984f2",
        "dark-effect": "#60a0ff",
        "area": "#4370b3",
        "on-area": "#ffffff"
      },
      "yellow": {
        "anchor": "#f2d024",
        "fill": "#f2d024",
        "on": "#000000",
        "light-border": "#d6b600",
        "light-ink": "#303336",
        "light-tint-1": "#fefcf3",
        "light-tint-2": "#fdf9e9",
        "light-tint-3": "#fcf7df",
        "dark-border": "#f2d024",
        "dark-ink": "#f2d024",
        "dark-tint-1": "#393938",
        "dark-tint-2": "#3b3a39",
        "dark-tint-3": "#3c3c39",
        "light-effect": "#f0d03b",
        "dark-effect": "#ffec9a",
        "area": "#e6d27a",
        "on-area": "#000000"
      },
      "red": {
        "anchor": "#fa1955",
        "fill": "#fa1955",
        "on": "#000000",
        "light-border": "#fa1955",
        "light-ink": "#cc0041",
        "light-tint-1": "#fff8f8",
        "light-tint-2": "#ffecec",
        "light-tint-3": "#ffdfe0",
        "dark-border": "#ff315d",
        "dark-ink": "#ff7f8b",
        "dark-tint-1": "#413439",
        "dark-tint-2": "#48353a",
        "dark-tint-3": "#4e363b",
        "light-effect": "#ff697b",
        "dark-effect": "#ff7785",
        "area": "#d85a69",
        "on-area": "#000000"
      },
      "green": {
        "anchor": "#269c6e",
        "fill": "#269c6e",
        "on": "#000000",
        "light-border": "#149265",
        "light-ink": "#00744e",
        "light-tint-1": "#f7fbf9",
        "light-tint-2": "#e9f4ed",
        "light-tint-3": "#daece2",
        "dark-border": "#269c6e",
        "dark-ink": "#4cba8a",
        "dark-tint-1": "#323b3c",
        "dark-tint-2": "#333d3d",
        "dark-tint-3": "#333f3e",
        "light-effect": "#3aab7c",
        "dark-effect": "#46b586",
        "area": "#569576",
        "on-area": "#000000"
      },
      "orange": {
        "anchor": "#ff8906",
        "fill": "#ff8906",
        "on": "#000000",
        "light-border": "#c46800",
        "light-ink": "#9d5100",
        "light-tint-1": "#fff9f5",
        "light-tint-2": "#fff2e9",
        "light-tint-3": "#ffebdd",
        "dark-border": "#ff8906",
        "dark-ink": "#ff8906",
        "dark-tint-1": "#3d3738",
        "dark-tint-2": "#403938",
        "dark-tint-3": "#433a38",
        "light-effect": "#df812e",
        "dark-effect": "#ffb27a",
        "area": "#e59960",
        "on-area": "#000000"
      },
      "purple": {
        "anchor": "#7d40c8",
        "fill": "#7d40c8",
        "on": "#ffffff",
        "light-border": "#7d40c8",
        "light-ink": "#7d40c8",
        "light-tint-1": "#fbf9fe",
        "light-tint-2": "#f1ecfb",
        "light-tint-3": "#e7dff8",
        "dark-border": "#a269f3",
        "dark-ink": "#bb91ff",
        "dark-tint-1": "#383547",
        "dark-tint-2": "#3c364e",
        "dark-tint-3": "#403756",
        "light-effect": "#945ae3",
        "dark-effect": "#b78aff",
        "area": "#7554a8",
        "on-area": "#ffffff"
      },
      "cyan": {
        "anchor": "#25c0cf",
        "fill": "#25c0cf",
        "on": "#000000",
        "light-border": "#008e9a",
        "light-ink": "#00717b",
        "light-tint-1": "#f5fbfc",
        "light-tint-2": "#e9f7f9",
        "light-tint-3": "#def3f6",
        "dark-border": "#25c0cf",
        "dark-ink": "#25c0cf",
        "dark-tint-1": "#333a3f",
        "dark-tint-2": "#333c42",
        "dark-tint-3": "#343e44",
        "light-effect": "#33a7b3",
        "dark-effect": "#4ddae9",
        "area": "#6bb9c2",
        "on-area": "#000000"
      }
    },
    "sequential": {
      "light-low": "#b2cbf1",
      "dark-low": "#32445e",
      "high": "#1e6bd6"
    },
    "palette": {
      "sky": {
        "light-fill": "#e8f1fe",
        "light-stroke": "#1e6bd6",
        "light-ink": "#1161cb",
        "light-tint-1": "#f7fafe",
        "light-tint-2": "#e5eefc",
        "light-tint-3": "#d5e4fa",
        "light-outline": "#648cc7",
        "dark-fill": "#07162c",
        "dark-stroke": "#3a85f2",
        "dark-ink": "#6da8ff",
        "dark-tint-1": "#303948",
        "dark-tint-2": "#303b4e",
        "dark-tint-3": "#303d54",
        "dark-outline": "#4e7bbd"
      },
      "slate": {
        "light-fill": "#e7e7e7",
        "light-stroke": "#5d5d5d",
        "light-ink": "#5d5d5d",
        "light-dot": "#747474",
        "dark-fill": "#121318",
        "dark-stroke": "#aaaaaa",
        "dark-ink": "#aaaaaa",
        "dark-dot": "#c7c7c7",
        "light-outline": "#848484",
        "dark-outline": "#797a7d"
      }
    },
    "tag": {
      "purple": "#7d40c8",
      "green": "#269c6e",
      "gray": "#5d5d5d",
      "red": "#fa1955",
      "brand": "#3c84f3",
      "amber": "#f2d024"
    },
    "paint": {
      "red": {
        "fill": "#fff8f8",
        "stroke": "#fa1955",
        "outline": "#fa1955",
        "ink": "#cc0041",
        "dot": "#fa1955"
      },
      "green": {
        "fill": "#f7fbf9",
        "stroke": "#149265",
        "outline": "#149265",
        "ink": "#00744e",
        "dot": "#149265"
      },
      "purple": {
        "fill": "#fbf9fe",
        "stroke": "#7d40c8",
        "outline": "#7d40c8",
        "ink": "#7d40c8",
        "dot": "#7d40c8",
        "group-1": "#fbf9fe",
        "group-2": "#f1ecfb",
        "group-3": "#e7dff8"
      },
      "sky": {
        "fill": "#e8f1fe",
        "stroke": "#1e6bd6",
        "outline": "#648cc7",
        "ink": "#1161cb",
        "group-1": "#f7fafe",
        "group-2": "#e5eefc",
        "group-3": "#d5e4fa"
      },
      "gray": {
        "fill": "#e7e7e7",
        "stroke": "#5d5d5d",
        "outline": "#848484",
        "ink": "#5d5d5d",
        "dot": "#747474"
      },
      "blue": {
        "fill": "#f7fafe",
        "stroke": "#1e6bd6",
        "outline": "#1e6bd6",
        "ink": "#1161cb",
        "dot": "#1e6bd6",
        "group-1": "#f7fafe",
        "group-2": "#e5eefc",
        "group-3": "#d5e4fa",
        "effect": "#3984f2"
      },
      "yellow": {
        "fill": "#fefcf3",
        "stroke": "#d6b600",
        "outline": "#d6b600",
        "ink": "#303336",
        "dot": "#d6b600",
        "group-1": "#fefcf3",
        "group-2": "#fdf9e9",
        "group-3": "#fcf7df",
        "effect": "#f0d03b"
      },
      "orange": {
        "fill": "#fff9f5",
        "stroke": "#c46800",
        "outline": "#c46800",
        "ink": "#9d5100",
        "dot": "#c46800",
        "group-1": "#fff9f5",
        "group-2": "#fff2e9",
        "group-3": "#ffebdd",
        "effect": "#df812e"
      },
      "cyan": {
        "fill": "#f5fbfc",
        "stroke": "#008e9a",
        "outline": "#008e9a",
        "ink": "#00717b",
        "dot": "#008e9a",
        "group-1": "#f5fbfc",
        "group-2": "#e9f7f9",
        "group-3": "#def3f6",
        "effect": "#33a7b3"
      }
    },
    "flow-ink": {
      "amber": "#000000",
      "brand": "#ffffff",
      "purple": "#ffffff",
      "green": "#000000",
      "red": "#000000",
      "gray": "#ffffff"
    },
    "flow-outline": {
      "amber": "#d6b600",
      "brand": "#1e6bd6",
      "purple": "#7d40c8",
      "green": "#149265",
      "red": "#fa1955"
    }
  },
  "font": {
    "sans": "ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
    "mono": "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    "figure-sans": "FigSans, FigSansSym, FigSansMath, ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
    "figure-mono": "FigMono, FigSans, FigSansSym, FigSansMath, ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  "size": {
    "text": {
      "9": 9,
      "11": 11,
      "13": 13,
      "15": 15,
      "22": 22
    },
    "control": {
      "outer": 52,
      "inner": 44,
      "icon": 20,
      "icon-stroke": 2.5
    },
    "pill": {
      "height": 18
    },
    "icon": {
      "node": 20,
      "group": 18,
      "tile": 32,
      "tile-gap": 6,
      "grid": 24
    },
    "tag": {
      "height": 14
    },
    "packet": {
      "radius": 4.5,
      "halo": 10,
      "hop-ref": 300,
      "chip-reach": 16
    },
    "arrow": {
      "head": 5
    },
    "node": {
      "card-width": 176,
      "min-width": 100,
      "max-width": 210,
      "min-height": 46,
      "store-cap": 12,
      "state-dot": 14,
      "table-row": 26,
      "circle": 40,
      "tile-width": 80,
      "tile-pad": 8
    },
    "grid": {
      "cell": 32
    },
    "figure-compact-width": 320,
    "figure-canvas": 960,
    "figure-canvas-wide": 1440,
    "chip": {
      "max-width": 210
    },
    "player": {
      "caption-max": 720,
      "embedded-chrome": 150
    },
    "gallery": {
      "column": 960,
      "frame": 820
    },
    "document": {
      "column": 960
    },
    "chart": {
      "width": 720,
      "compact-width": 296,
      "pattern-spacing": 8,
      "label": 140,
      "label-max": 240,
      "bar": 12,
      "row": 40,
      "dot": 5,
      "plot-h": 260,
      "axis": 48,
      "cell": 40,
      "cap": 8,
      "range": 6,
      "arrow-min": 16
    },
    "queue": {
      "slot-width": 16,
      "slot-height": 14,
      "slot-gap": 4
    },
    "sequence": {
      "row": 44
    },
    "group": {
      "title": 28
    }
  },
  "weight": {
    "medium": 500,
    "semibold": 600
  },
  "leading": {
    "normal": 1.5,
    "snug": 1.35
  },
  "tracking": {
    "text": -0.3,
    "tag": 0.03,
    "frame": 0.04
  },
  "space": {
    "1": 2,
    "2": 4,
    "3": 6,
    "4": 8,
    "5": 10,
    "6": 12,
    "7": 14,
    "8": 16,
    "9": 18,
    "11": 22,
    "12": 24,
    "14": 28,
    "15": 30,
    "16": 32,
    "20": 40,
    "22": 44,
    "30": 60,
    "0-5": 1,
    "1-5": 3,
    "2-5": 5
  },
  "radius": {
    "sm": 4,
    "md": 6,
    "lg": 8,
    "xl": 10,
    "2xl": 18,
    "full": 999,
    "route": 22
  },
  "border": {
    "hair": 0.75,
    "thin": 1,
    "strong": 2.5,
    "lifeline": 1.25,
    "tag": 1.5,
    "edge": 1.75,
    "casing": 4.5,
    "halo": 8
  },
  "z": {
    "raised": 2,
    "overlay": 10
  },
  "duration": {
    "fast": 200,
    "effect-rise": 80,
    "effect-hold": 80,
    "effect-decay": 240,
    "notice": 2400,
    "hop": 3750,
    "hop-min": 500,
    "chip-slide": 300,
    "chip-fade": 150,
    "chart-cycle": 7000,
    "reveal": 900,
    "value-flash": 700,
    "pulse": 450,
    "chip-frame": 16.666666666666668,
    "flow-step": 12000,
    "cut-fade": 600
  },
  "easing": {
    "move": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "reveal": "cubic-bezier(0, 0, 0.58, 1)"
  },
  "simple2": {
    "heading": 36,
    "subheading": 27,
    "body": 18,
    "control": 15,
    "caption": 13,
    "page-gutter": 24,
    "page-gap": 48,
    "page-width": 960,
    "reading-width": 948,
    "control-gap": 8,
    "focus-width": 3,
    "leading": 1.6,
    "title-leading": 1.2,
    "shadow": "0 2px 8px rgba(0,0,0,.10), 0 0 2px rgba(0,0,0,.10)",
    "node-shadow": "drop-shadow(0px 1px 1px rgba(0,0,0,.07))",
    "corner": 18,
    "control-radius": 6,
    "card-gap": 48,
    "node-stroke": 1,
    "heading-weight": 700,
    "node-corner": 8,
    "separator": "#d4d8de",
    "canvas-corner": 18,
    "canvas-fill": "#f5f5f6",
    "symbol-stroke": 1.5,
    "segment-track": "rgba(0, 25, 61, 0.1)",
    "segment-ink": "rgba(0, 4, 9, 0.78)",
    "segment-hover": "rgba(0, 25, 61, 0.08)",
    "segment-on": "#3c84f3",
    "segment-on-hover": "#3779e0",
    "segment-on-ink": "#ffffff",
    "segment-radius": 12,
    "segment-item-radius": 9,
    "segment-pad": 4,
    "label-size": 15,
    "detail-size": 13,
    "micro-size": 11,
    "surface-edge": "#d4d8de",
    "hover-fill": "#eef4fc",
    "row-selection": "#cee2fd",
    "card-active-fill": "#f3f7fd",
    "data-line": "#737e8b",
    "chart-hole": 0.55,
    "figure-leading": 1.5,
    "card-row-gap": 6
  },
  "primitive": {
    "simple2": {
      "fg": "#303336",
      "muted": "#566170",
      "bg": "#f2f5f7",
      "page": "#ffffff",
      "node": "#ffffff",
      "surface": "#eef0f3",
      "plate-border": "#d4d8de",
      "border": "#838b96",
      "shadow": "0 2px 8px rgba(0,0,0,.10), 0 0 2px rgba(0,0,0,.10)",
      "node-shadow": "drop-shadow(0px 1px 1px rgba(0,0,0,.07))",
      "group-title": "#566170",
      "canvas": "#f5f5f6",
      "ui-accent": "#3c84f3",
      "ui-accent-hover": "#3779e0",
      "on-ui-accent": "#ffffff",
      "hover-fill": "#eef4fc",
      "row-selection": "#cee2fd",
      "card-active-fill": "#f3f7fd",
      "line": "#9da5b0",
      "data-line": "#737e8b",
      "dark-bg": "#26272b",
      "dark-page": "#1d1e22",
      "dark-node": "#303136",
      "dark-card": "#36373b",
      "dark-edge": "#50535b",
      "dark-separator": "#454850",
      "dark-hover": "#343e50",
      "dark-selection": "#274174",
      "dark-card-active-fill": "#333a48",
      "dark-muted": "#a9adb6",
      "dark-line": "#7f8793",
      "dark-data-line": "#acb4c0",
      "light-outline": "#818181",
      "dark-outline": "#868686",
      "dark-paint-gray": "#121318",
      "number-fill": "#303336",
      "number-ink": "#ffffff",
      "chart-hole": 0.55
    }
  },
  "breakpoint": {
    "tablet": 800
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
    "dim-ink": 0.9,
    "band": 0.22,
    "range": 0.4,
    "chip-visible-min": 0.1
  },
  "distance": {
    "card": {
      "min": 0.015,
      "max": 0.04
    },
    "flow": 0.1,
    "neighbor": 0.06,
    "neighbor-cvd": 0.025,
    "fill": 0.015,
    "fill-dark": {
      "bg": 0.07,
      "node": 0.03
    }
  },
  "scale": {
    "zoom-max": 6,
    "aspect-fit-max": 1.6,
    "fold-aspect": 1.6,
    "fold-step": 0.75,
    "aspect-max": 3,
    "zoom-step": 1.25,
    "flow-dots-max": 80,
    "chip-visible-share": 0.6,
    "chip-room-tries": 4,
    "chip-room-step": 16
  }
});
