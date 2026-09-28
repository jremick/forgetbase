import { HostApprovalAuthority, readHostApprovalJob } from "@forgetbase/updater";

const [command, ...args] = process.argv.slice(2);
if (!["show", "approve", "deny"].includes(command ?? "")) throw new Error("Usage: approval.js show|approve|deny --state-dir <host-state> --job-id <id> [--request-digest <digest>]");
const allowed = new Set(["--state-dir", "--job-id", ...(command === "show" ? [] : ["--request-digest"])]);
const values = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  const name = args[index]!; const value = args[index + 1];
  if (!allowed.has(name) || values.has(name) || !value || value.startsWith("--")) throw new Error("Invalid or duplicate host approval argument");
  values.set(name, value);
}
for (const name of allowed) if (!values.has(name)) throw new Error(`${name} is required`);
const stateDir = values.get("--state-dir")!;
const job = await readHostApprovalJob(stateDir, values.get("--job-id")!);
const summary = { jobId: job.id, phase: job.phase, requestDigest: job.approval!.requestDigest, descriptor: job.approval!.descriptor };
console.log(JSON.stringify(summary, null, 2));
if (command !== "show") {
  const decision = await new HostApprovalAuthority(stateDir).decide(job, values.get("--request-digest")!, command === "approve" ? "approved" : "denied");
  console.log(JSON.stringify(decision, null, 2));
}
