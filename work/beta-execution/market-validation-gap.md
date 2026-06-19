# ForgetBase Beta Market Validation Gap

Status: research memo
Date: 2026-06-19
Scope: market and competitor risk for ForgetBase beta, with emphasis on whether git/Markdown instruction management and adjacent paid tools weaken the "permissioned, audited source of truth for agent instructions" wedge.

## Bottom Line

ForgetBase has a credible beta wedge, but it is not yet a proven category. The safest claim is not broad "AI knowledge base," "enterprise search," "LLMOps," or "agent orchestration." It is:

> A self-hostable governed instruction and context registry for AI agents.

The buyer risk is that teams may treat `AGENTS.md`, `CLAUDE.md`, `llms.txt`, git review, existing wikis, MCP registries, prompt-management tools, and enterprise-search suites as "good enough" until they feel a concrete multi-surface governance problem. ForgetBase should therefore validate a narrower paid problem: teams need reviewed, permission-aware, export-safe instructions distributed through API, CLI, MCP, and package exports, with audit evidence for what agents were allowed to use.

No live source found in this pass materially contradicts the beta plan positioning. The research does qualify it: several adjacent tools now use similar language around agents, governance, evals, prompt management, knowledge, and MCP. ForgetBase must show the workflow, not just name the category.

## What Is Sourced Versus Inferred

Sourced facts in this memo are limited to repo documents and linked vendor/standard pages. Strategic conclusions about demand risk, category language, and validation priorities are marked as inference from those facts and from the beta plan.

Confidence shorthand:

- High: repo source of truth or first-party docs directly support the claim.
- Moderate: first-party vendor/standard page supports the product/category description.
- Inference: strategic interpretation; not presented as customer evidence.
- Flagged: relevant but unstable, incomplete, or needing buyer validation.

## Competitor And Category Map

| Category | Tools / alternatives | Relationship to ForgetBase | What buyers get there | Why it weakens the wedge | Where ForgetBase can still win |
|---|---|---|---|---|---|
| Free file-based instruction management | git, Markdown, `AGENTS.md`, `CLAUDE.md`, `llms.txt`, `.cursorrules`, local prompt files | Free alternative; strongest default for developer-led teams | Repo-native review, low ceremony, no new service, easy agent bootstrapping. OpenAI documents Codex instruction discovery through `AGENTS.md` files, Anthropic documents `CLAUDE.md` project/user/org memory, and `llms.txt` proposes Markdown files for LLM-readable website context. [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md), [Claude Code memory docs](https://docs.anthropic.com/en/docs/claude-code/memory), [llms.txt proposal](https://llmstxt.org/) | If teams only need static guidance in one repo, ForgetBase can look like a database around Markdown. | Win only when file-based guidance cannot prove permission eligibility, export safety, review lifecycle, cross-surface distribution, or audited retrieval across API/CLI/MCP/export consumers. |
| MCP discovery and registries | Official MCP Registry, GitHub/community MCP registries, private MCP registry patterns | Adjacent distribution infrastructure, not content governance | The official registry is a preview metadata repository for publicly accessible MCP servers; it provides discovery metadata, standardized install/config info, namespace verification, and REST API access. It explicitly does not support private servers and expects private registries to be separately operated. [MCP Registry docs](https://modelcontextprotocol.io/registry/about), [Official MCP Registry](https://registry.modelcontextprotocol.io/) | MCP registries can make "distribution" feel solved if buyers only need server discovery. | ForgetBase should frame itself as the governed asset source feeding MCP/API/CLI/export consumers, not as a public MCP server marketplace. |
| Open-source / self-hosted enterprise search and AI assistant | Onyx | Adjacent and sometimes direct for self-hosted AI teams | Onyx positions as open-source AI chat connected to docs, apps, and people, with hybrid search, RAG, MCP, agents/actions, connectors, access controls, and self-hosting. [Onyx](https://onyx.app/) | Onyx is the clearest open-source substitute if the buyer primarily wants AI search over existing docs. | ForgetBase should avoid "read everything" competition and focus on curated governed instruction assets, allowed surfaces, export eligibility, lifecycle, and leakage checks. |
| Enterprise search / work AI suites | Glean, Atlassian Rovo, Gemini Enterprise | Adjacent; strong budget incumbents | Glean markets agents, search, enterprise graph, governance, and "system of context"; Rovo searches across SaaS apps and builds agents/automation on Atlassian's Teamwork Graph; Gemini Enterprise is documented as an intranet search, AI assistant, and agentic platform with prebuilt connectors and permissions-aware access. [Glean](https://www.glean.com/), [Atlassian Rovo](https://www.atlassian.com/software/rovo), [Gemini Enterprise](https://docs.cloud.google.com/gemini/enterprise/docs) | If the buyer wants broad workplace search, connector volume, suite integration, or enterprise assistant rollout, these products own the conversation. | Position as a smaller governed source for agent instructions and context packages that can coexist with search suites, not replace them. |
| Microsoft agent builder / suite-native orchestration | Copilot Studio | Adjacent; powerful for Microsoft-heavy teams | Microsoft describes Copilot Studio as a low-code tool for building agents and flows; agents coordinate instructions, context, knowledge sources, topics, tools, inputs, and triggers. [Microsoft Copilot Studio overview](https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-what-is-copilot-studio) | Microsoft shops may prefer a suite-native agent builder and knowledge-source path. | ForgetBase should not claim orchestration parity; the complement story is self-hosted governed instruction packages for non-Microsoft and multi-agent surfaces. |
| Agent workspace / knowledge agent platform | Dust | Adjacent; potentially direct in AI agent teams | Dust docs present knowledge management through information retrieval, semantic search, internal retrieval, team experts, and tools/MCP management. [Dust knowledge docs](https://docs.dust.tt/docs/dust-for-knowledge-management) | Dust can absorb "agent + knowledge + tools" demand if buyers want an agent workspace rather than a registry. | Differentiate on self-hostable governed registry, permission-filtered exports, API/CLI/MCP as core delivery surfaces, and open-core boundaries. |
| Human-first knowledge bases adding AI governance | Guru, Slite, Stack Internal | Adjacent; direct where buyer starts from knowledge management | Guru markets structured and governed company knowledge for people and AI tools; Slite markets a self-maintaining knowledge base for teams and agents; Stack Internal markets a trusted knowledge layer that captures, structures, validates, and delivers enterprise knowledge with trust signals. [Guru](https://www.getguru.com/), [Slite](https://slite.com/), [Stack Internal](https://stackoverflow.co/internal/) | These tools already own human knowledge workflows, verification language, and content-maintenance jobs. | ForgetBase can win where the primary consumer is an agent/harness, where structured instruction objects matter more than pages, and where delivery must be API/CLI/MCP/export-first. |
| LLMOps / prompt, eval, observability, and gateway platforms | Langfuse, LangSmith, Portkey, Humanloop, Braintrust, PromptLayer, Agenta, Helicone | Adjacent; direct for prompt/eval budget | Langfuse combines tracing, prompt management, evals, experiments, human annotation, cost/latency, and self-hosting; LangSmith is an agent engineering platform for observing, evaluating, and deploying agents; Portkey combines AI Gateway, observability, guardrails, governance, and prompt management; Braintrust focuses on observability and evals; PromptLayer calls itself a prompt CMS/eval harness/observability stack; Agenta combines prompt management, evaluation, and observability; Helicone routes, debugs, and analyzes AI apps. Humanloop is now a special case: its official page says the team joined Anthropic and is sunsetting the Humanloop platform. [Langfuse](https://langfuse.com/), [LangSmith](https://www.langchain.com/langsmith-platform), [Portkey](https://portkey.ai/), [Humanloop announcement](https://humanloop.com/), [Braintrust](https://www.braintrust.dev/), [PromptLayer](https://www.promptlayer.com/), [Agenta](https://agenta.ai/), [Helicone](https://www.helicone.ai/) | These tools can claim the "manage prompts, evaluate quality, observe agents" budget before ForgetBase does. | Avoid selling as an eval or observability replacement. Sell the upstream governed instruction corpus that can feed these systems and preserve permission/export state. |

## Is Git / Markdown Enough?

For many beta prospects, yes. Git and Markdown are enough when:

- The instruction surface is mostly one engineering repo.
- The same people who author instructions also approve and consume them.
- Review can happen through pull requests.
- Sensitive content is already handled by repo access.
- The agent reads static instructions at session start.
- The team does not need per-user or per-surface retrieval permissions.

That is why the free alternative is the first thing ForgetBase must beat. `AGENTS.md` and `CLAUDE.md` are first-party supported ways to give coding agents persistent repo guidance, and `llms.txt` is a simple convention for LLM-readable website context. Those files are not "bad"; they are the baseline.

Git and Markdown stop being enough when the buyer needs all of these at once:

- Agent instructions and human-readable docs as separate but linked primitives.
- Lifecycle state, owner, sensitivity, audience, review due date, allowed surfaces, and allowed exports on each asset.
- Permission-aware retrieval before context reaches an agent, export, API, CLI, or MCP client.
- Evidence that restricted assets were excluded from unauthorized search/export/package output.
- Audit events showing who changed, reviewed, published, restored, retrieved, or exported what.
- A UI where non-repo owners can inspect and approve governed instruction changes.
- A package/export story with stable IDs, hashes, and omitted-item explanations.

This is an inference from the ForgetBase docs and competitor scan, not validated customer evidence yet. The beta must prove that enough target teams have crossed this complexity threshold.

## Ranked Falsifiable Beta Validation Questions

1. **Git displacement test:** In 8 target-user calls, do at least 5 users identify one existing `AGENTS.md`/`CLAUDE.md`/prompt-file/wiki instruction set they would move or mirror into ForgetBase within 30 days because of permissions, review state, exports, or audit? Failure means the wedge is too theoretical.
2. **Multi-surface pain test:** In 6 hands-on demos, do at least 4 teams already have or plan at least two agent-consumer surfaces among API, CLI, MCP, IDE agents, ChatGPT/Claude/Codex, or export packages? Failure means the Distribute story may be overbuilt for beta.
3. **Permission/leakage value test:** In 5 pilots, do at least 3 teams bring a realistic restricted-context scenario and treat a passing restricted export/search leakage check as a must-have, not a nice-to-have? Failure means governance copy is ahead of buyer urgency.
4. **15-minute proof test:** Can 5 fresh technical evaluators run locally, import or create a governed instruction, review/publish it, retrieve it through at least one downstream surface, and see restricted exclusion evidence in under 15 minutes? Failure means market interest will not convert.
5. **Budget-owner test:** Across 10 interviews, can at least 4 prospects name a likely owner with budget or mandate: AI platform, developer productivity, security, knowledge management, or systems integrator delivery? Failure means this is a user pain without a buyer.
6. **Adjacent-stack coexistence test:** Among 5 teams already using LangSmith/Langfuse/Portkey/Braintrust/PromptLayer-style tools, do at least 3 still want a separate governed instruction registry rather than extending their LLMOps platform? Failure means ForgetBase should integrate first and market less independently.
7. **Search-suite complement test:** Among 5 teams using or evaluating Glean/Rovo/Gemini/Copilot-style systems, do at least 2 see ForgetBase as a curated governed instruction source rather than redundant search/knowledge tooling? Failure means public copy must steer harder away from enterprise search.
8. **Authoring-mode test:** Do beta users prefer web-first editing, git-backed import/sync, API-first asset creation, or all three? If fewer than 3 of 5 hands-on users accept the current authoring path, prioritize import/sync and demo spine before landing-page spend.

## Safest Public Category Language

Use:

- "Self-hostable governed instruction and context registry for AI agents."
- "A permissioned, audited source of truth for the prompts, policies, playbooks, skills, SOPs, and context packages agents retrieve through API, CLI, MCP, and exports."
- Bridge phrases: "headless CMS for AI agents," "prompt and context registry," "agent context gateway," and "MCP-native instruction distribution layer."

Avoid:

- "Enterprise search."
- "AI knowledge base" as the primary category.
- "Full agent orchestration."
- "Production-ready hosted service."
- "Complete observability."
- "Enterprise identity complete."
- "LLMOps platform" or "eval platform" as the main claim.

## Biggest Demand Risk

The biggest demand risk is not that competitors have the exact same product. It is that the target ICP does not yet believe governed agent instructions deserve a separate system. Free repo files cover early usage, enterprise search covers broad knowledge, LLMOps covers prompts/evals/observability, and suite-native builders cover agent creation. ForgetBase only gets pulled into budget when a buyer has multiple agent consumers, sensitive/restricted instructions, lifecycle/review accountability, and a need to prove what context was distributed.

Inference: before heavier marketing spend, ForgetBase needs evidence of paid-problem urgency, not just positive reactions to the idea.

## Minimum Evidence Before Heavier Marketing Spend

- At least 10-15 target ICP interviews, with notes separating curiosity from concrete workflow pain.
- At least 5 hands-on beta trials from fresh clone or packaged local install.
- At least 3 teams that currently use git/Markdown/wiki/prompt files and can name a specific governance failure or near-miss.
- At least 3 completed 15-minute value-path runs with proof artifacts: created/imported asset, review/publish state, permission-filtered retrieval, MCP/API/CLI/export fetch, and restricted exclusion evidence.
- At least 2 prospects with a named budget owner or paid-pilot path.
- A clear authoring answer: web-first, git-import, API-first, or hybrid.
- A claim-safety gate proving public copy does not imply production readiness, hosted-service maturity, full orchestration, enterprise-search parity, or enterprise identity completeness.

## Verification Evidence

### Files Read

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `work/beta-execution/manager-execution-map.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `work/model-council/forgetbase-beta-20260619/source-register.md`
- `work/model-council/forgetbase-beta-20260619/stage1/gemini-contrarian.md`
- `work/model-council/forgetbase-beta-20260619/stage1/claude-contrarian.md`

### Searches Performed

- `AGENTS.md official specification AI coding agents OpenAI Codex`
- `Claude Code CLAUDE.md memory official docs`
- `llms.txt official specification`
- `Model Context Protocol registry official docs`
- `Humanloop joining Anthropic announcement official 2025 shutdown`
- `Humanloop is joining Anthropic official announcement`
- `Humanloop evaluations prompts product official prompt management AI`

### Live Links Used

- OpenAI Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- Claude Code memory / CLAUDE.md: https://docs.anthropic.com/en/docs/claude-code/memory
- AGENTS.md community spec: https://agents.md/
- llms.txt proposal: https://llmstxt.org/
- MCP Registry docs: https://modelcontextprotocol.io/registry/about
- Official MCP Registry: https://registry.modelcontextprotocol.io/
- Onyx: https://onyx.app/
- Langfuse: https://langfuse.com/
- LangSmith: https://www.langchain.com/langsmith-platform
- Portkey: https://portkey.ai/
- Humanloop announcement: https://humanloop.com/
- Humanloop prompt/eval pages found during research: https://humanloop.com/platform/prompt-management and https://humanloop.com/home
- Braintrust: https://www.braintrust.dev/
- PromptLayer: https://www.promptlayer.com/
- Agenta: https://agenta.ai/
- Helicone: https://www.helicone.ai/
- Glean: https://www.glean.com/
- Atlassian Rovo: https://www.atlassian.com/software/rovo
- Guru: https://www.getguru.com/
- Slite: https://slite.com/
- Stack Internal: https://stackoverflow.co/internal/
- Dust knowledge docs: https://docs.dust.tt/docs/dust-for-knowledge-management
- Microsoft Copilot Studio overview: https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-what-is-copilot-studio
- Gemini Enterprise docs: https://docs.cloud.google.com/gemini/enterprise/docs

### Claim Safety Pass

| Claim | Status | Basis |
|---|---|---|
| ForgetBase should avoid production-ready, hosted-service-ready, enterprise-search parity, and full-orchestration claims. | High | Directly supported by `docs/REMAINING_FUNCTIONAL_GAPS.md`, `docs/BETA_RELEASE_PLAN.md`, and manager execution map. |
| Git/Markdown is the strongest free baseline. | Moderate + inference | First-party OpenAI/Anthropic/llms.txt docs support file-based instruction/context conventions; the competitive importance is inference from beta plan and contrarian passes. |
| Enterprise search/work-AI suites are adjacent, not direct primary targets. | Moderate + inference | Vendor pages support their broad search/agent positioning; ForgetBase complement framing is inference from beta source docs. |
| LLMOps/prompt/eval platforms are dangerous adjacent tools. | Moderate + inference | Vendor pages support prompt/eval/observability/gateway positioning; budget-threat framing is inference. |
| Humanloop is no longer a normal active independent competitor. | Moderate | Humanloop's official announcement says the team joined Anthropic and the platform is being sunset. |
| Minimum marketing-spend evidence should include hands-on pilots, git/Markdown displacement proof, budget owner, and 15-minute proof path. | Inference | Derived from market-risk analysis and beta plan; not sourced customer evidence. |

## Open Questions For Manager Synthesis

- Should beta include a git/Markdown import or mirror path before broader public positioning, given the free-alternative risk?
- Should the landing page explicitly compare to `AGENTS.md`/`CLAUDE.md`, or keep that comparison in docs/demo material to avoid sounding dismissive?
- Should ForgetBase prioritize integrations with Langfuse/LangSmith/Portkey-style tools before trying to own prompt/eval language?
- Should the MCP story emphasize "private governed instruction distribution" rather than generic "MCP registry" to avoid conflict with the public registry ecosystem?
