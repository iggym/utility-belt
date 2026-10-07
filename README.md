# 🛠️ Utility Belt

<div align="center">

# Utility Belt

A growing collection of useful tools, utilities, experiments, calculators, generators, dashboards, and interactive web apps.

Built with simplicity, speed, and usefulness in mind.

[Launch Website](https://iggym.github.io/utility-belt/)

</div>

---

## What is Utility Belt?

Utility Belt is my personal collection of practical tools and micro-applications.

Every tool is:

- Lightweight
- Browser-based
- Mobile friendly
- Free to use
- Zero installation
- Built with HTML, CSS and JavaScript

The goal is simple:

> Create useful things that solve real problems.

---

## Features

- ⚡ Fast loading
- 📱 Mobile-first
- 🎨 Beautiful UI
- 🔍 Fuzzy, searchable catalog with match highlighting
- ⌘ Command palette (`Ctrl`/`⌘` + `K`, or `/`)
- 🏷️ Auto-generated tool directory driven by `manifest.json`
- 🕘 "Recently opened" rail (stored locally, nothing leaves the browser)
- 🔗 Shareable URLs — search, category and sort survive reload and Back
- 🌗 Dark and light themes, following your system preference
- ♿ Keyboard-first, reduced-motion aware
- 🚀 GitHub Pages hosted

### Keyboard shortcuts (catalog page)

| Keys | Action |
|---|---|
| `Ctrl`/`⌘` + `K` | Open the command palette |
| `/` | Open the command palette |
| `↑` `↓` | Move through palette results |
| `Enter` | Open the highlighted tool |
| `Esc` | Close the palette, or clear the search box |

---

## Adding a tool

1. Drop a self-contained file in `tools/`.
2. Add an entry to `manifest.json`:

```json
{
  "title": "My Tool",
  "file": "tools/my-tool.html",
  "description": "One line explaining what it does.",
  "category": ["Productivity"],
  "icon": "🧰"
}
```

The catalog page reads `manifest.json` at runtime — every count, filter pill and
search index is derived from it, so nothing has to be updated by hand.

---

## Repository Structure

```text
utility-belt/
│
├── index.html              ← catalog page: search, filters, command palette
├── manifest.json           ← the single source of truth for the catalog
│
├── tools/                  ← 28 self-contained single-file apps
│   ├── prompt-architect.html         ← 24 enterprise workflows × 12 frontier models
│   ├── everyday-prompt-studio.html   ← 12 everyday workflows × 12 models + saved household context
│   ├── command-palette.html          ← Ctrl/⌘+K launcher over the whole catalog
│   ├── pivot-table.html              ← Excel-style pivots from pasted CSV
│   ├── text-diff.html                ← line + word-level diff, unified/split
│   ├── color-studio.html             ← harmonies, ramps, WCAG contrast
│   └── …
│
├── docs/
│   └── useful-features.md   ← research: features from the world's most-used software
│
├── tests/
│   └── index.test.mjs       ← jsdom tests that boot index.html and exercise it
│
├── package.json             ← dev-only: test harness, no runtime dependencies
└── README.md
```

---

## Running locally

The catalog fetches `manifest.json`, so it needs to be served over HTTP rather
than opened as a `file://` URL:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# → http://localhost:8080
```

## Tests

The catalog page has a jsdom test suite that boots the real `index.html`,
stubs the manifest fetch, and exercises search, filtering, sorting, the command
palette, deep links, theming and the error states:

```bash
npm install
npm test
```

The suite needs no browser and no network access.
