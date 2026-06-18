# Agentic CMS Design Package

This folder is the saved design source for the first business-grade UI direction.

## Artifacts

- `agentic-cms-design-system/index.html`: static design-system package with tokens, typography, navigation, cards, tables, forms, empty states, and governance/status patterns.
- `agentic-cms-main-page-mockups/index.html`: static page mockup package for the main app surfaces.
- `agentic-cms-main-page-mockups/styles.css`: mockup stylesheet, including the tree/folder page navigation and retained draggable nav width behavior.
- `agentic-cms-main-page-mockups/app.js`: mockup interaction script.

## Implemented In App

The live React web app now applies this direction in `apps/web/src/App.tsx` and `apps/web/src/styles.css`:

- business-grade app shell with top bar, health state, density toggle, and left page tree
- page hierarchy with folders and sub-pages for read, work, and operate surfaces
- sub-page navigation leaves are iconless by default; add leaf icons only through an explicit optional configuration
- draggable page nav width with keyboard resize support and `localStorage` retention across reloads
- fallback reader/library UI as the default first-release consumer surface
- search/managed-query route and control-plane route wrappers around the existing operational workflows

Keep future UI changes aligned to these artifacts unless a newer design package supersedes them.
