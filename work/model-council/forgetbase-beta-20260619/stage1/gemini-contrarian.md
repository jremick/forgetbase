# Gemini Contrarian Pass

Model route: Gemini CLI helper, `--model pro`, reported `gemini-3.1-pro-preview`
Mode: read-only
Date: 2026-06-19

## Summary Verdict

The current thesis, positioning ForgetBase as an "instruction control plane" to provide governed context for agents, is technically sound but commercially vulnerable. By explicitly rejecting the "CMS/wiki" category and attempting to invent a net-new category, the thesis creates a harder go-to-market motion. Enterprise buyers do not wake up looking to buy an instruction control plane; they already have budgets allocated for knowledge bases, headless CMS platforms, and LLM observability tools.

While the technical architecture, especially MCP, evals, and API-first delivery, is a strong wedge, the positioning risks stranding ForgetBase between enterprise search, which owns general knowledge, and developer tools like LangSmith, which own prompt engineering. To succeed, ForgetBase must either anchor itself to an existing understood category or decisively prove that MCP/agent-native delivery is painful enough to demand net-new budget.

## Strongest Alternative Positioning Options

1. **The open-source headless CMS for AI, or Contentful for agents.**
   Headless CMS is a understood category: structured, versioned content delivered by API. Adding "for AI/agents" communicates what it is and how it is used, while highlighting vector search, evals, MCP, and permission-aware governance.

2. **Prompt and context registry.**
   AI enablement teams already understand the need to manage, version, and evaluate prompts. Positioning ForgetBase as an open-source, self-hosted registry for prompts, playbooks, and tool guidance aligns it with an active buying cycle.

3. **Agent context gateway.**
   If the enterprise pain is excessive agency and sensitive disclosure, position ForgetBase as the secure gateway that filters, redacts, and governs what context an agent can access.

## Competitive Category Map

| Category | Current owners | Contrarian read |
|---|---|---|
| Enterprise search and AI knowledge | Glean, Atlassian Rovo, Notion | They own "read everything" and connector volume. ForgetBase loses if positioned as broad search. |
| Knowledge base / wiki | Guru, Slite, Stack Internal | They retrofit AI agents onto human-first systems. ForgetBase can differentiate as AI/API/MCP-first, but must overcome existing documentation inertia. |
| Prompt / eval / observability | LangSmith, Portkey | Dangerous adjacency: these tools may already own prompt registry mindshare. ForgetBase needs clearer human-governed instruction lifecycle differentiation. |
| Agent platform / orchestration | Copilot Studio, Dust, Onyx | ForgetBase is a feeder system, not the execution platform. Do not overclaim orchestration. |
| Open-source / self-hosted enterprise search | Onyx | Closest open-source competitor. Differentiate on governance, instruction management, and deterministic evals, not just RAG. |

## Biggest Practical Release Mistakes To Avoid

1. **Burying MCP support.** MCP should be a headline beta feature, not a footnote.
2. **Decorative marketing dashboard.** The UI must be utilitarian and high-density, with JSON payloads, version diffs, eval pass rates, and MCP/API details visible to the technical ICP.
3. **Overclaiming orchestration.** The current repo lacks full managed-agent orchestration and side-effecting action adapters.
4. **Failing the 5-minute local dev test.** A developer should be able to run Docker Compose, add a system prompt/instruction, and retrieve it through MCP in minutes.

## UI/UX And Landing Page Recommendations

- Above the fold: show a split-screen between ForgetBase UI and an IDE/local agent fetching the exact approved instruction through MCP.
- App IA: emphasize Operate and Distribute, including telemetry, evals, redaction, API keys, and MCP connection strings, over Read.
- Trust signals: every asset should display lifecycle, sensitivity band, and deterministic eval pass/fail status without requiring submenu digging.

## Beta Release Milestones

| Milestone | Focus | Acceptance check |
|---|---|---|
| Beta 1 | Local dev / MCP wedge | Developer can spin up locally, author a governed instruction, and retrieve it from a third-party MCP client in under five minutes. |
| Beta 2 | Team governance layer | User A drafts an update; User B reviews a version diff and approves; API/MCP fetch reflects only approved state. |
| Beta 3 | Trust and eval console | Instruction changes trigger deterministic evals; UI shows pass/fail and blocks publish when policy requires passing evals; PII redaction is verified. |
| Beta 4 | Self-hosted readiness | Backup/restore, API key rotation, and telemetry retention policies are verified with automated or scripted checks. |

## Missing Evidence And Unresolved Questions

- How do technical teams prefer to author these instructions: web UI, Markdown in IDE, Git sync, or API import?
- Who owns budget: AI enablement, platform engineering, security, knowledge management, or developer productivity?
- Will retrieval quality hold against 10,000 messy real documents, not only synthetic corpus?
- Are current REST/API endpoints shaped correctly for LangChain, LlamaIndex, Claude Code, Codex, and local MCP clients?
