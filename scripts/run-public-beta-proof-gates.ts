import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type GateCommand = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

type GateSpec = {
  name: string;
  fileName: string;
  commands: GateCommand[];
  requiresCleanWorktree?: boolean;
};

const root = process.cwd();
const outputDir = resolve(
  root,
  process.env.PUBLIC_BETA_PROOF_GATE_DIR ?? "work/public-beta-proof/gate-results"
);
const apiUrl = process.env.FORGETBASE_API_URL ?? "http://127.0.0.1:3000";
const pnpm = ["npx", ["-y", "pnpm@11.7.0"]] as const;

const gates: GateSpec[] = [
  {
    name: "clean-checkout",
    fileName: "clean-checkout.json",
    requiresCleanWorktree: true,
    commands: [
      command(...pnpm, ["install", "--frozen-lockfile"]),
      command(...pnpm, ["public-beta:preflight"]),
      command(...pnpm, ["test"])
    ]
  },
  {
    name: "smoke-compose",
    fileName: "smoke-compose.json",
    commands: [command(...pnpm, ["smoke:compose"], { FORGETBASE_API_URL: apiUrl })]
  },
  {
    name: "restricted-leakage",
    fileName: "restricted-leakage.json",
    commands: [command(...pnpm, ["security:verify-restricted-leakage"], { FORGETBASE_API_URL: apiUrl })]
  },
  {
    name: "backup-restore",
    fileName: "backup-restore.json",
    commands: [command(...pnpm, ["db:verify-backup-restore"])]
  }
];

mkdirSync(outputDir, { recursive: true });

const summaries = gates.map((gate) => runGate(gate));
const summary = {
  ok: summaries.every((gate) => gate.ok),
  outputDir,
  gates: summaries.map(({ reportPath, ...gate }) => ({
    ...gate,
    reportPath: reportPath.replace(`${root}/`, "")
  }))
};

writeFileSync(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  process.exit(1);
}

function command(
  commandName: string,
  baseArgs: readonly string[],
  extraArgs: string[] = [],
  extraEnv: NodeJS.ProcessEnv = {}
): GateCommand {
  return {
    command: commandName,
    args: [...baseArgs, ...extraArgs],
    env: {
      ...process.env,
      ...extraEnv
    }
  };
}

function runGate(gate: GateSpec) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const results = [];
  const initialWorktree = gate.requiresCleanWorktree ? readWorktreeState() : undefined;

  for (const commandSpec of gate.commands) {
    const result = spawnSync(commandSpec.command, commandSpec.args, {
      cwd: root,
      encoding: "utf8",
      env: commandSpec.env,
      maxBuffer: 1024 * 1024 * 20
    });

    results.push({
      command: [commandSpec.command, ...commandSpec.args].join(" "),
      status: result.status,
      ok: result.status === 0,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
      json: parseJsonObject(result.stdout)
    });

    if (result.status !== 0) {
      break;
    }
  }

  const finalWorktree = gate.requiresCleanWorktree ? readWorktreeState() : undefined;
  const report = {
    name: gate.name,
    ok: results.every((result) => result.ok) && (!gate.requiresCleanWorktree || finalWorktree?.clean === true),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    ...(gate.requiresCleanWorktree ? { worktree: finalWorktree, initialWorktree, finalWorktree } : {}),
    commands: results
  };
  const reportPath = join(outputDir, gate.fileName);

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}

function readWorktreeState() {
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  const entries = trimOutput(status.stdout).split("\n").map((line) => line.trim()).filter(Boolean);

  return {
    clean: status.status === 0 && entries.length === 0,
    commitSha: trimOutput(commit.stdout),
    statusCommand: "git status --porcelain=v1 --untracked-files=all",
    dirtyEntryCount: entries.length,
    dirtyEntries: entries.slice(0, 200)
  };
}

function trimOutput(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 200_000);
}

function parseJsonObject(value: string | undefined): unknown {
  const trimmed = (value ?? "").trim();

  if (!trimmed.startsWith("{")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}
