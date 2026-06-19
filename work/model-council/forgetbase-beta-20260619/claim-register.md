# Claim Register

| claim_id | section | claim_text | claim_type | decision_relevance | load_bearing | evidence_in_document | dependencies |
|---|---|---|---|---|---|---|---|
| C1 | Product category | ForgetBase should be positioned as an agent-native instruction control plane, not a CMS/wiki. | design | high | yes | S1,S2,S3,S4,S5 | - |
| C2 | Beta value | The beta value should center on governed, permission-aware context that agents can retrieve, cite, export, and act from. | design | high | yes | S1,S2,S3,S12-S23,S29 | C1 |
| C3 | Market timing | The category is timely because AI adoption and agent experimentation are broad, but scaling is blocked by governance, risk, trust, and unclear value. | causal | high | yes | S6-S11,S30-S32 | - |
| C4 | ICP | The best initial ICP is AI/platform/enablement teams, AI-heavy SMBs, consultancies/agencies, and technical teams that need reusable governed agent context; broad employee wiki replacement is a weaker beta wedge. | assumption | high | yes | S7-S13,S21-S29 | C1,C2 |
| C5 | Differentiation | The strongest differentiation is open-core/self-hostable governed agent context with API, CLI, MCP, OKF, leakage tests, evals, telemetry, redaction, and action approvals. | design | high | yes | S1-S5,S23,S26-S32 | C1,C2 |
| C6 | UI/UX gap | A credible beta requires a major UI/UX upgrade because the current capability set is difficult to perceive, demo, and trust through an old dense admin surface. | assumption | high | yes | S5,S33-S35 | C2,C5 |
| C7 | App IA | The app should organize around Read, Work, Operate, and Distribute surfaces rather than exposing every admin feature as equal navigation. | design | high | yes | S5,S12-S25,S33-S35 | C6 |
| C8 | Trust signals | Product UI should make source provenance, citation support, permission scope, lifecycle/review status, sensitivity, freshness, eval status, and export eligibility visible by default. | design | high | yes | S3,S12-S23,S30-S35 | C2,C5,C6 |
| C9 | Landing page | The public landing page should teach the category and show real product workflows with screenshots: governed asset, permission-aware search, agent export/MCP, eval/leakage/audit. | design | high | yes | S12-S25,S33-S35 | C1,C2,C5 |
| C10 | Release sequencing | Remaining work should ship in practical releases that first prove a coherent demo journey, then distribution surfaces, then trust/eval hardening, then self-hosted beta operations. | normative | high | yes | S1-S5,S6-S11 | C1-C9 |
| C11 | Overclaiming risk | Calling beta production-ready, hosted-service-ready, enterprise-identity-complete, or full orchestration-ready would overstate the repo's current evidence. | vulnerability | high | yes | S4 | C10 |
| C12 | Competitive risk | If positioned as a generic enterprise search/wiki, ForgetBase will be compared against better-funded incumbents and lose the sharper agent-native wedge. | assumption | high | yes | S12-S25,S28 | C1,C4,C5 |
