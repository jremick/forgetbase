# ForgetBase Design Package

This folder is the saved design source for the first business-grade UI direction.

## Artifacts

- `forgetbase-brand/index.html`: brand contact sheet with 10 ForgetBase logo options.
- `forgetbase-brand/README.md`: brand rationale, option notes, shortlist, palette, and implementation notes.
- `forgetbase-brand/marks/`: SVG logo option source files.
- `forgetbase-design-system/index.html`: static design-system package with tokens, typography, navigation, cards, tables, forms, empty states, and governance/status patterns.
- `forgetbase-main-page-mockups/index.html`: static page mockup package for the main app surfaces.
- `forgetbase-main-page-mockups/styles.css`: mockup stylesheet, including the tree/folder page navigation and retained draggable nav width behavior.
- `forgetbase-main-page-mockups/app.js`: mockup interaction script.

## Implemented In App

The live React web app now applies this direction in `apps/web/src/App.tsx` and `apps/web/src/styles.css`:

- business-grade app shell with top bar, health state, density toggle, and left page tree
- page hierarchy with folders and sub-pages for read, work, and operate surfaces
- sub-page navigation leaves are iconless by default; add leaf icons only through an explicit optional configuration
- draggable page nav width with keyboard resize support and `localStorage` retention across reloads
- fallback reader/library UI as the default first-release consumer surface
- search/managed-query route and control-plane route wrappers around the existing operational workflows

Keep future UI changes aligned to these artifacts unless a newer design package supersedes them.

## React Design-System Adoption

Adoption mode is `react-custom-css`. The app is React 19/Vite with an existing custom CSS system, so shadcn/ReUI should be introduced workflow-by-workflow instead of through a full rewrite.

Current foundation:

- `components.json` configures shadcn aliases, Tailwind v4 CSS entry, lucide icons, and the ReUI registry namespace.
- `apps/web/src/components/ui/button.tsx` and `apps/web/src/components/ui/badge.tsx` are the first local shadcn-style primitives.
- `apps/web/src/styles.css` maps the existing Quiet Control Plane tokens to shadcn and ReUI semantic variables, including `info`, `success`, `warning`, `destructive`, and `invert`.
- The live library/read surface uses those primitives for command actions, refresh/export controls, lifecycle/status badges, and sensitivity bands.

Use source order:

1. Existing local tokens and local `components/ui` primitives.
2. shadcn core for foundational controls such as buttons, inputs, labels, tabs, dialogs, sheets, tooltips, tables, badges, alerts, progress, skeletons, breadcrumbs, and pagination.
3. ReUI registry components only for richer operational-console needs such as data grids, filters, frames, trees, timelines, steppers, and file upload.
4. Custom components only when the governed-asset interaction, permission model, or security state does not fit shadcn or ReUI.

Do not bulk install components. Install only the component needed for the current workflow, review generated code as project code, and keep public-reader gating intact: anonymous/public surfaces require `public-demo`, `active`, and `approved`.
