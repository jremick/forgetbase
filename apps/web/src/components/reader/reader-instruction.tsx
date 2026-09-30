import type { AgentInstruction } from "@forgetbase/schema";
import { MarkdownDocument } from "../markdown/markdown-document.js";
import type { ReaderSectionHeading } from "../../lib/reader-ui.js";

const instructionSections = [
  ["constraints", "Constraints"], ["examples", "Examples"], ["failureModes", "Failure modes"],
  ["escalation", "Escalation"], ["inputContract", "Input contract"], ["outputContract", "Output contract"]
] as const;

function instructionHeadingId(instruction: AgentInstruction, key: string): string {
  return `reader-instruction-${encodeURIComponent(instruction.id)}-${key}`;
}

export function readerInstructionHeadings(instruction: AgentInstruction): ReaderSectionHeading[] {
  return instructionSections.map(([key, text]) => ({ id: instructionHeadingId(instruction, key), text, level: 2 }));
}

export function ReaderInstruction({ instruction, title }: { instruction: AgentInstruction; title: string }) {
  return <div className="reader-instruction" data-source-id={instruction.id}>
    <dl className="reader-instruction-context">
      <div><dt>Instruction kind</dt><dd>{instruction.instructionKind}</dd></div>
      <div><dt>Target agents</dt><dd>{instruction.targetAgents.length ? instruction.targetAgents.join(", ") : "Not specified"}</dd></div>
    </dl>
    <MarkdownDocument body={instruction.body} title={title} />
    {instructionSections.map(([key, label]) => <section className="reader-instruction-section" key={key}>
      <h2 id={instructionHeadingId(instruction, key)} tabIndex={-1}>{label}</h2>
      {key === "inputContract" || key === "outputContract" ? Object.keys(instruction[key]).length
        ? <details className="reader-contract"><summary>Inspect {label.toLowerCase()}</summary><pre><code>{JSON.stringify(instruction[key], null, 2)}</code></pre></details>
        : <p className="reader-field-empty">Not supplied.</p>
        : key === "escalation" ? instruction.escalation
          ? <p className="reader-instruction-text">{instruction.escalation}</p>
          : <p className="reader-field-empty">Not supplied.</p>
          : instruction[key].length ? <ul>{instruction[key].map((value, index) => <li className="reader-instruction-text" key={index}>{value}</li>)}</ul>
            : <p className="reader-field-empty">None supplied.</p>}
    </section>)}
  </div>;
}
