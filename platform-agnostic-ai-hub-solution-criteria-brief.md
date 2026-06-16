# Platform-Agnostic AI Hub Solution Criteria Brief

Use this brief to start a new Codex thread in collaborative, plan-first mode. The goal is to define and then build a lower-cost, fit-for-purpose AI knowledge hub without assuming any existing wiki, intranet, or vendor platform.

## Operating Mode For The Next Codex Instance

You are not in implementation mode yet.

Start by confirming the target operating model, architecture decisions, and acceptance criteria. Do not create a repository, deploy infrastructure, migrate content, or write production code until the user has approved the plan.

Work in this order:

1. Restate the problem and success criteria in your own words.
2. Identify material unknowns and ask the smallest useful set of decision questions.
3. Propose 2-3 viable architecture options with cost, risk, security, maintainability, and AI-retrieval tradeoffs.
4. Recommend one option and explain why.
5. Define the end-to-end working goal as a testable outcome.
6. Create an implementation plan with milestones, validation checks, and rollback/migration strategy.
7. Wait for approval before building.

Use deterministic tools for inventories, exports, parsing, link checks, cost arithmetic, auth verification, and migration validation. Use judgment for product tradeoffs, information architecture, and governance design.

## Business Problem

The organisation needs a central AI Resource Hub that helps staff safely and effectively adopt AI. The Hub should be the single front door for:

- approved AI tools and usage guidance
- policy, governance, risk, privacy, and security guidance
- practical playbooks, templates, examples, and reusable patterns
- role-based learning paths and training materials
- reporting, measurement, and adoption guidance
- program updates and reader-visible activity history
- instructions for connecting AI assistants or search tools to approved knowledge

The current solution should be treated only as source context, not as the target architecture. The replacement or simplified solution must be evaluated from first principles against the requirements below.

## Known Planning Assumptions To Validate

- Initial audience: roughly 170 staff across the immediate group.
- Potential broader audience: up to roughly 1,500 staff over time.
- Current content corpus: roughly 400 pages or equivalent knowledge units.
- Content includes public staff-facing guidance plus some restricted or maintainer-only material.
- Most readers need search, navigation, and trustworthy guidance, not heavy collaboration features.
- A smaller maintainer group needs controlled editing, publishing, review, and auditability.
- AI assistants and search tools need a clean, retrievable, structured content surface.
- Cost matters materially, especially if access scales to hundreds or thousands of users.

Treat these as assumptions until the user confirms or provides better data.

## Primary Outcomes

The successful solution must make AI guidance easier to find, trust, use, maintain, and connect to AI tools.

Expected outcomes:

- Staff can self-serve common AI questions without asking the central AI team.
- Business units can reuse approved patterns instead of reinventing one-off guidance.
- Maintainers can publish updates quickly while preserving governance and review.
- Sensitive or non-public content is protected by design.
- AI assistants can retrieve current Hub content with clear metadata and stable references.
- The solution has a lower total cost of ownership than licensing every reader into a heavyweight knowledge platform.

## Core User Groups

Reader:
Needs fast, low-friction access to approved AI guidance, tools, policies, learning paths, and templates.

Maintainer:
Needs safe authoring, review, publishing, version history, metadata quality checks, and rollback.

Approver or governance owner:
Needs confidence that policy-sensitive content is accurate, reviewed, and visibly current.

AI assistant or connector:
Needs structured, chunkable, permission-aware content with stable URLs, metadata, and machine-readable exports.

Administrator:
Needs simple auth, hosting, monitoring, backups, access control, and low operational burden.

## Required Capabilities

### Reader Experience

- Landing page that makes the Hub purpose and top tasks immediately clear.
- Search across all published reader-facing content.
- Browse by topic, role, audience, tool, policy area, and operational status.
- Stable URLs for every page or knowledge unit.
- Clear page metadata: owner, status, last reviewed date, intended audience, source, and sensitivity level.
- Mobile-readable pages.
- No login friction unless required by the chosen access model.

### Content Model

- Content is stored in a portable canonical format, preferably Markdown plus structured frontmatter or a comparable open format.
- Each content item has a stable identifier independent of display title.
- Metadata supports filtering, AI retrieval, lifecycle review, and migration validation.
- Attachments and images have stable references and documented storage rules.
- Draft, active, deprecated, archived, and restricted states are explicit.

### Authoring And Governance

- Clear maintainer workflow for draft, review, approval, publish, and archive.
- Version control or equivalent history for every published change.
- Review reminders or stale-content reports.
- Link checking and broken-reference reporting.
- Automated validation for required metadata.
- Ability to roll back a bad publish.

### Permissions And Access

- Staff-facing content can be read by the intended audience.
- Restricted content supports narrower access by group or role.
- Maintainer permissions are separate from reader permissions.
- Auth model supports current staff identity where practical.
- The system avoids shared all-staff secrets or embedded long-lived tokens.
- Access decisions must be auditable enough for governance-sensitive content.

### AI Retrieval

- Published content can be exported or indexed for AI assistants.
- Export format should be connector-friendly and machine-readable.
- Content chunks preserve title, hierarchy, URL, owner, audience, status, and sensitivity metadata.
- Restricted content must not leak into public or broader-reader indexes.
- The design should support periodic rebuilds and freshness checks.

### Reporting And Operations

- Ability to report content count, stale pages, missing metadata, broken links, and publish activity.
- Lightweight usage/adoption analytics if available without privacy or cost problems.
- Operational runbook for deploy, rollback, backup, restore, and incident handling.
- Clear source-of-truth rules for content, generated exports, and deployed artifacts.

## Acceptance Criteria

The solution is acceptable when all of these are true:

- A staff reader can open the Hub, search for an approved AI topic, and reach current guidance in under a few clicks.
- A maintainer can update a page, pass validation, publish it, and verify the live result.
- A restricted page or section is not visible to unauthorised readers or exported into broad AI indexes.
- Every published content item has required metadata: owner, status, audience, sensitivity, last reviewed date, and stable ID.
- The system can export a connector-ready knowledge package for AI assistants.
- Broken links and stale content can be detected by a repeatable command or scheduled job.
- A bad release can be rolled back.
- The architecture has an explicit monthly and annual cost model for 170, 500, and 1,500 readers.
- The implementation avoids vendor lock-in where practical by keeping canonical content portable.
- The final handoff includes a runbook, decision record, and validation evidence.

## Non-Goals For The Simplified Solution

Do not recreate a full enterprise wiki unless the user explicitly chooses that path.

Out of scope by default:

- Real-time collaborative editing.
- Complex page macros or vendor-specific layout features.
- Full document-management replacement.
- Heavy workflow engines.
- Social features such as comments, likes, reactions, or feeds.
- Fully custom identity provider.
- Custom search relevance engine unless simple search is inadequate.
- Complex analytics that require invasive tracking.

## Architecture Decisions To Establish Before Build

The next Codex instance must explicitly resolve these decisions with the user.

### 1. Canonical Content Source

Options to consider:

- Git repository with Markdown and frontmatter.
- Existing document library with generated exports.
- Headless CMS.
- Lightweight database-backed admin app.

Decision criteria:

- maintainer comfort
- review and approval needs
- portability
- AI retrieval quality
- auditability
- migration effort
- long-term cost

### 2. Hosting And Delivery

Options to consider:

- Static site hosting.
- Internal document portal.
- Lightweight web app.
- Hybrid: static reader site plus private maintainer workflow.

Decision criteria:

- reader scale
- auth compatibility
- cost at 170, 500, and 1,500 readers
- deployment simplicity
- search/indexing quality
- restricted content needs

### 3. Authentication And Authorisation

Options to consider:

- Existing Microsoft Entra ID / SSO.
- Existing Google Workspace identity.
- GitHub organisation/team access for maintainers only.
- Public or unlisted reader site plus restricted private sections.
- Platform-native access controls from the selected hosting provider.

Decision criteria:

- current staff identity provider
- guest/external access needs
- group sync
- per-reader cost
- restricted content requirements
- audit needs
- operational complexity

### 4. Search

Options to consider:

- Static local index generated at build time.
- Hosted search service.
- Platform-native search.
- Hybrid: static search for public guidance plus secure search for restricted content.

Decision criteria:

- corpus size
- permission boundaries
- indexing freshness
- cost
- search quality
- AI assistant retrieval compatibility

### 5. AI Connector Strategy

Options to consider:

- Generated Markdown repository for AI tool connectors.
- Static JSON/Markdown export endpoint.
- MCP server or API layer.
- Existing enterprise search connector.

Decision criteria:

- which AI assistants must connect
- permission boundaries
- freshness expectations
- source attribution
- setup friction for staff
- maintenance cost

### 6. Migration Strategy

Options to consider:

- Start fresh with only high-value pages.
- Import all current content, then prune.
- Maintain old source temporarily and publish selected content into the new system.

Decision criteria:

- content quality
- page count
- dependency on internal links
- restricted content
- time-to-value
- confidence in automated extraction

### 7. Analytics And Measurement

Options to consider:

- No tracking beyond server logs.
- Privacy-preserving aggregate analytics.
- Search query reporting only.
- Content health metrics only.

Decision criteria:

- privacy expectations
- usefulness for adoption reporting
- operational burden
- staff trust

## Recommended Planning Questions

Ask these before proposing the final architecture:

1. What identity provider should staff use for access: Microsoft, Google, another SSO, or no login for broad reader content?
2. Is the Hub intended for all 170 initial staff immediately, or only a pilot group first?
3. Should the future 1,500-staff audience be treated as a hard requirement now or a scalability scenario?
4. How much content must migrate on day one: all content, only current staff-facing guidance, or a curated subset?
5. What content types are sensitive or restricted?
6. Who can approve policy or governance pages?
7. Who can edit ordinary guidance pages?
8. Which AI tools must be able to connect to the Hub content?
9. Is a static reader experience acceptable if maintainers edit through Git, forms, or a separate admin workflow?
10. What is the target annual run cost ceiling?
11. What is the acceptable build timeline for MVP and production-ready release?
12. What evidence must exist before turning off or downgrading the current platform?

## Architecture Options To Present

The next Codex instance should present at least these options, adapted to the user's answers.

### Option A: Static Knowledge Hub With Git-Based Source

Canonical source is Markdown plus frontmatter in a private repository. A static site builds the reader experience. Search index and AI export are generated at build time. Maintainers edit through pull requests or a lightweight editor workflow.

Best for:

- lowest cost
- portability
- strong AI retrieval
- simple publishing governance

Risks:

- less friendly for non-technical editors unless paired with a simple editing UI
- restricted content needs careful auth design
- no rich collaborative editing

### Option B: Existing Document Platform As Source, Generated Reader Site

Canonical source stays in an existing internal document library. A scheduled export builds a clean reader site and AI connector package.

Best for:

- non-technical authoring
- lower migration friction if staff already use the document platform
- centralised identity and permissions

Risks:

- export complexity
- source formatting can be inconsistent
- AI retrieval metadata may require additional normalization

### Option C: Lightweight Custom Web App

Canonical content lives in a database or headless CMS. The app provides reader UI, maintainer UI, permissions, search, and AI export.

Best for:

- tailored workflow
- non-technical editing
- fine-grained permissions

Risks:

- highest build and maintenance cost
- more security surface
- more operational responsibility

## Default Recommendation To Challenge

Start with Option A unless the user confirms that non-technical editing or fine-grained restricted content is more important than low cost and portability.

The likely best first release is:

- Git-backed Markdown source.
- Static reader site.
- Existing SSO or hosting-native access control.
- Build-time search index.
- Generated AI connector export.
- Automated validation for metadata, links, stale pages, and restricted export leakage.
- Manual or pull-request approval workflow for maintainers.

## End-To-End Working Goal Template

Before implementation, replace bracketed text and confirm this goal with the user:

> Build a platform-agnostic AI Resource Hub MVP for [audience size] staff, using [canonical source], [hosting provider], and [auth provider]. The MVP must publish a curated set of [content count or sections] with search, navigation, required metadata, restricted-content handling, and an AI-connector-ready export. A maintainer must be able to update content, run validation, publish, verify the live site, and roll back a bad release. Success is proven by a scripted validation report covering metadata completeness, broken links, restricted export safety, search index generation, deployment, and reader access.

## MVP Scope

Minimum useful release:

- Content schema and folder structure.
- 20-50 high-value pages or knowledge units.
- Reader landing page and section navigation.
- Search.
- Required metadata validation.
- Link checker.
- AI export package.
- Basic auth/access model.
- Deploy pipeline.
- Maintainer runbook.

Do not migrate all content in the MVP unless the user explicitly chooses a full migration.

## Production Scope

Production-ready release:

- Full content migration or agreed curated corpus.
- Redirect map from old URLs or references.
- Restricted-content policy and tests.
- Scheduled content health checks.
- Stale review report.
- Backup and restore process.
- Maintainer approval workflow.
- Usage or content-health reporting.
- Documented support model.
- Decision record for all major architecture choices.

## Validation Checklist

Before claiming completion, produce evidence for:

- content builds successfully
- metadata validation passes
- link validation passes or known exceptions are documented
- restricted content is excluded from broad exports
- search index contains only eligible content
- AI export contains stable IDs, URLs, titles, hierarchy, audience, status, and sensitivity
- deployment is reachable by intended readers
- unauthorised access is blocked where required
- rollback process has been tested
- cost model is documented
- maintainer runbook exists

## Cost Model Required

Model costs for:

- 170 readers
- 500 readers
- 1,500 readers
- 5 maintainers
- 20 maintainers

Include:

- hosting
- auth/access control
- search
- storage and bandwidth
- build minutes or CI
- AI export/indexing jobs
- monitoring
- support burden
- migration/build cost

Separate one-time build cost from ongoing monthly and annual run cost.

## Handoff Output Expected From Planning Phase

The plan-first Codex instance should produce:

- confirmed problem statement
- decisions needed and user answers
- recommended architecture
- rejected alternatives and reasons
- implementation milestones
- MVP acceptance criteria
- production acceptance criteria
- cost model
- risk register
- validation plan
- end-to-end working goal

Implementation should begin only after the user approves that planning output.
