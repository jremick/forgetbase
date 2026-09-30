import { assetCreateInputSchema, assetUpdateInputSchema, type AssetCreateInput } from "../../packages/schema/src/index.js";

// Synthetic inputs for disposable-stack acceptance. These never alter the demo corpus.
export const readerFixture = {
  policyId: "zz-reader.data-sharing-policy",
  checklistId: "zz-reader.data-sharing-checklist",
  instructionId: "zz-reader.assistant-sharing-guide",
  htmlId: "zz-reader.raw-html",
  plainId: "zz-reader.plain-text",
  restrictedId: "zz-reader.restricted-review-notes",
  missingId: "zz-reader.missing-page",
  query: "riverstone safeguards",
  ask: "What are the riverstone sharing safeguards?",
  noAnswer: "unanswerablequartzofficeaccesscode",
  title: "Riverstone Data Sharing Policy",
  checklistTitle: "Riverstone Data Sharing Checklist",
  instructionTitle: "Riverstone Assistant Sharing Guide",
  publishedToken: "RIVERSTONE_PUBLISHED_GUIDANCE",
  draftToken: "RIVERSTONE_UNPUBLISHED_DRAFT_SENTINEL",
  restrictedToken: "RIVERSTONE_RESTRICTED_SENTINEL",
  instructionToken: "RIVERSTONE_INSTRUCTION_GUIDANCE"
} as const;

export const readerPolicyBody = `# ${readerFixture.title}

${readerFixture.publishedToken}. This synthetic policy explains riverstone sharing safeguards for a fictional collection. Check the purpose, permitted audience and information owner before sharing. Reading this guidance grants no export or execution permission.

## Riverstone sharing purpose

Riverstone sharing starts with a clear reason. Record the intended recipient and the minimum information required. The checklist provides operational steps; this policy explains the decision. Keep identifiers distinct when comparing related sources.

## Riverstone sharing safeguards

Redact personal identifiers and private access details before riverstone sharing. Use an approved channel and review the proposed contents with the information owner. A draft must remain outside reader retrieval until publication.

1. Check purpose and audience.
   - Include only needed information.
   - Keep private source details out of the response.
     - Escalate uncertainty to the owner.
2. Record the decision.
3. Review the release.

> Warning: This is synthetic guidance. Read access does not grant export or execution rights.

## Riverstone sharing comparison

| Decision | Approved recipient | Information owner | Required safeguard |
| --- | --- | --- | --- |
| Policy explanation | Fictional reader | Synthetic maintainer | Redact personal details and check purpose |
| Operational checklist | Fictional operator | Synthetic maintainer | Record the review decision before sharing |
| Wide example | recipient-with-a-deliberately-long-unbroken-synthetic-identifier-0123456789 | owner-with-a-deliberately-long-unbroken-synthetic-identifier-0123456789 | Keep this table scrollable inside its own region |

## Riverstone sharing command example

\`\`\`text
synthetic-command --purpose=riverstone-sharing --recipient=fictional-reader --reference=long-synthetic-reference-0123456789-0123456789-0123456789-0123456789-0123456789-0123456789
keep  two spaces
\`\`\`

The command is readable sample text. It must never execute. [Read the related checklist](?page=${readerFixture.checklistId}#reader) or [inspect a safe external reference](https://example.test/riverstone).

## Riverstone sharing review

The review due date is a deadline, not evidence of the last review or source synchronization. The owner value is an identity supplied by the asset. Contact the maintainer if a page, source or permission appears missing. An unavailable page does not establish why access failed.

## Riverstone sharing final check

Retain the approved policy version while editors work on a replacement. Search snippets, Ask citations, article text and source details should all refer to readable published content. The current page link is stable; it does not promise a historical revision or exact passage anchor.
`;

export const readerInitialPolicyBody = `# ${readerFixture.title}\n\nRIVERSTONE_INITIAL_GUIDANCE. This initial approved version predates the synthetic replacement publication. It contains no final safeguards body.\n`;

const common = {
  tenantId: "tenant_demo", ownerId: "user_synthetic_reader_maintainer", lifecycleState: "active", status: "approved",
  sensitivity: "public-demo", audience: ["fictional-readers"], reviewDueAt: "2027-10-15", sourceKind: "synthetic-reader-uat",
  allowedSurfaces: ["api", "web", "cli", "mcp"], allowedExports: [], allowedActions: []
} as const;

export function readerExperienceAssets(tenantId: string): AssetCreateInput[] {
  const inputs = [
    { ...common, stableId: readerFixture.policyId, type: "policy", title: readerFixture.title,
      summary: "Riverstone sharing safeguards and purpose for a fictional collection.",
      metadata: { readerNavOrder: 999900, readerNavLabel: "Riverstone sharing policy", readerIcon: "policy", readerPageInfoFields: ["version", "updated", "access", "maintainer", "review"] },
      instruction: { instructionKind: "policy", targetAgents: ["assistant"], body: "Riverstone sharing requires redaction and an information-owner review. RIVERSTONE_INSTRUCTION_GUIDANCE.", constraints: ["Do not reveal private access details."], examples: ["Describe the published policy."], failureModes: ["Unpublished text appears in a response."], escalation: "Ask the synthetic information owner.", inputContract: { question: "string" }, outputContract: { answer: "string", citations: "array" } },
      humanDocument: { format: "markdown", body: readerInitialPolicyBody } },
    { ...common, stableId: readerFixture.checklistId, type: "sop", title: readerFixture.checklistTitle,
      summary: "Operational riverstone safeguards; related to the sharing policy but a distinct source.",
      metadata: { readerParentId: readerFixture.policyId, readerNavOrder: 1, readerNavLabel: "Riverstone sharing checklist", readerIcon: "checklist" },
      humanDocument: { format: "markdown", body: `# ${readerFixture.checklistTitle}\n\n## Riverstone safeguards\n\nConfirm the recipient, redact identifiers, obtain the information-owner review, and record the decision. RIVERSTONE_CHECKLIST_GUIDANCE.\n\n## Completion\n\nUse the policy for decision rules and this checklist for operational steps.\n` } },
    { ...common, stableId: readerFixture.instructionId, type: "agent-instruction", title: readerFixture.instructionTitle,
      summary: "A published instruction source with no human document.",
      metadata: { readerParentId: readerFixture.policyId, readerNavOrder: 2, readerIcon: "guide" },
      instruction: { instructionKind: "guidance", targetAgents: ["assistant"], body: `${readerFixture.instructionToken}. Explain the published riverstone sharing policy and cite the supplied source.`, constraints: ["Use only accessible published sources."], examples: ["Answer with a supplied citation."], failureModes: ["A missing version becomes a made-up version number."], escalation: "Ask the synthetic information owner.", inputContract: { question: "string", htmlExample: "<script>window.readerFixtureExecuted=true</script>" }, outputContract: { answer: "string", citations: "array" } } },
    { ...common, stableId: readerFixture.restrictedId, type: "policy", sensitivity: "restricted", title: "Private Riverstone Review Notes",
      summary: readerFixture.restrictedToken, metadata: { readerNavOrder: 999999 },
      humanDocument: { format: "markdown", body: `# Private Riverstone Review Notes\n\n${readerFixture.restrictedToken}. Do not disclose these synthetic restricted notes.` } },
    { ...common, stableId: readerFixture.htmlId, type: "human-document", title: "Synthetic HTML source",
      summary: "Unsupported HTML remains readable escaped source.", metadata: { readerNavOrder: 999990 },
      humanDocument: { format: "html", body: "<script>window.readerFixtureExecuted=true</script>\n<h2>RIVERSTONE_ESCAPED_HTML</h2>" } },
    { ...common, stableId: readerFixture.plainId, type: "human-document", title: "Synthetic plain-text source",
      summary: "Plain text retains literal Markdown punctuation.", metadata: { readerNavOrder: 999991 },
      humanDocument: { format: "plain-text", body: "# RIVERSTONE_LITERAL_PLAIN_TEXT\n\n**Keep these literal markers.**\n<script>window.readerFixtureExecuted=true</script>" } }
  ];
  return inputs.map(input => assetCreateInputSchema.parse({ ...input, tenantId }));
}

export function readerUnpublishedReplacement(tenantId: string, expectedVersionId: string) {
  return assetUpdateInputSchema.parse({ tenantId, expectedVersionId, lifecycleState: "draft", status: "draft",
    title: `${readerFixture.draftToken} title`, summary: `${readerFixture.draftToken} summary`,
    metadata: { readerNavOrder: 999900, readerNavLabel: readerFixture.draftToken },
    humanDocument: { format: "markdown", body: `# ${readerFixture.draftToken}\n\nRiverstone sharing ${readerFixture.draftToken}.` },
    instruction: { instructionKind: "policy", body: `${readerFixture.draftToken} instruction.` }
  });
}
