You are Claude Code running as a delegated worker for Codex.

Task:
Perform a careful, practical human-perspective UX and information-architecture review of the current ForgetBase / Agentic CMS design and web UI. Focus on whether the purpose of each page is clear to a human operator, whether elements are located where humans would logically expect them, whether the overall page architecture feels intuitive, and where the current interface is impractical for real beta users.

Context:
- Repo/path: /Users/jarel/Documents/agentic-cms
- Product framing: ForgetBase is an open-core, Apache-2.0, agent-native instruction management platform / instruction control plane. The human web UI is secondary but operationally important: humans inspect, approve, publish, debug, configure, and read governed assets.
- Current design direction: "Quiet Control Plane with a Governed Reading Room." Dense, restrained, provenance/trust-forward, operational-console UI. Avoid generic AI landing-page aesthetics.
- Current implementation note: `apps/web/src/App.tsx` has existing unstaged local changes from another work lane. Treat those changes as part of the current local UI state for review, but do not edit or revert anything.
- Prior durable design rule: folder/group nav rows may use icons, but leaf/sub-page rows should be iconless by default unless explicitly configured.

Relevant source files and artifacts to inspect:
- README.md
- docs/END_TO_END_GOAL.md
- docs/TECHNICAL_SPEC.md
- docs/DECISIONS.md
- docs/MVP_SCOPE.md
- docs/DEVELOPMENT.md
- docs/design/README.md
- docs/design/agentic-cms-design-system/index.html
- docs/design/agentic-cms-main-page-mockups/index.html
- docs/design/agentic-cms-main-page-mockups/styles.css
- apps/web/src/App.tsx
- apps/web/src/styles.css
- apps/web/src/components/app/*.tsx
- apps/web/src/components/ui/*.tsx where relevant

Scope:
- Read-only / inspect-only. Do not modify files.
- You may run read-only shell inspection commands and local type/build checks if helpful.
- Do not use secrets, do not inspect .env files, and do not make network-dependent claims unless you actually verify them.
- Do not rebrand the product or propose a broad visual redesign. This review is about human logic, page purpose, interaction architecture, page-element placement, and practical UI usability.

Frameworks to explicitly apply:
- Nielsen Norman Group: 10 usability heuristics and heuristic evaluation method.
- W3C WCAG 2.2: keyboard, focus, semantics, contrast, form labels, target sizing, and accessible names.
- GOV.UK Service Manual / Service Standard: start with user needs, make the service simple to use, design around end-to-end service journeys.
- Material Design navigation guidance: navigation should help users move between screens to complete tasks, with clear hierarchy and wayfinding.
- IBM Carbon data-table and enterprise-product guidance: tables/toolbars support search, filtering, display settings, row actions, progressive disclosure, and batch actions.
- Atlassian / enterprise admin-console patterns where useful: clear navigation, breadcrumbs, object-context actions, and predictable settings/work administration separation.

Review questions:
1. What are the core human jobs-to-be-done in this product, and do the current pages map cleanly to those jobs?
2. Does each major route/page have a clear purpose, or are multiple purposes mixed together?
3. Are primary actions located near the object or state they act on?
4. Are read, review, distribute, operate, access, provider, policy, telemetry, and approval surfaces grouped in a way humans would naturally understand?
5. Which controls feel like implementation plumbing exposed directly to users instead of operator-facing workflows?
6. Where would a new admin, maintainer, reader, or AI-ops operator hesitate or misinterpret the page?
7. Where are progressive disclosure, defaults, labels, empty states, navigation state, breadcrumbs, and page headings weak?
8. Which parts of the UI are correct for agents/APIs but awkward for humans?
9. What must change before a private beta user can complete a realistic 15-minute first-run path?

Return:
- Executive summary: 5-8 bullets, practical and blunt.
- Route/page inventory table: route/page, intended human job, current purpose clarity, main friction, recommended destination/pattern.
- Prioritized findings: severity P0/P1/P2/P3, page/route/file evidence, best-practice framework mapping, why a human struggles, concrete fix direction.
- Proposed target IA: concise page/group model with page purposes and where cross-page actions belong.
- First implementation lane: smallest high-leverage set of changes to fix the worst human-logic problems.
- Verification plan: how Codex should prove the UX/IA changes worked, including browser walkthroughs and accessibility checks.

Constraints:
- Do not claim visual or behavioral facts unless grounded in files or commands you inspected.
- Do not output hidden reasoning. Provide concise evidence and recommendations.
- If blocked by missing runtime, build failure, unclear source of truth, or permission limits, report exactly what blocked you and continue with file-grounded analysis.
