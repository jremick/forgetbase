import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  statfs,
  writeFile
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  productIdentitySchema,
  recoveryPointSchema,
  type ProductIdentity,
  type RecoveryPoint,
  type ReleaseManifest
} from "@forgetbase/schema";
import type { UpdateExecutor, UpdateSystemProbe } from "./manager.js";

const maxCommandOutputBytes = 32_768;

export interface ManagedComposeExecutorOptions {
  bundleDir: string;
  composeFiles: string[];
  stateDir: string;
  currentIdentity: ProductIdentity;
  apiHealthUrl?: string;
  webHealthUrl?: string;
  composeProjectName?: string;
  postgresDatabase?: string;
  commandTimeoutMs?: number;
  minimumFreeBytes?: number;
  environment?: NodeJS.ProcessEnv;
}

export class ManagedComposeExecutor implements UpdateExecutor {
  private readonly bundleDir: string;
  private readonly stateDir: string;
  private readonly recoveryDir: string;
  private readonly composeFiles: string[];
  private readonly currentEnvPath: string;
  private readonly candidateEnvPath: string;
  private readonly identityPath: string;

  constructor(private readonly options: ManagedComposeExecutorOptions) {
    this.bundleDir = resolve(options.bundleDir);
    this.stateDir = resolve(options.stateDir);
    this.recoveryDir = join(this.stateDir, "recovery");
    this.currentEnvPath = join(this.stateDir, "current-release.env");
    this.candidateEnvPath = join(this.stateDir, "candidate-release.env");
    this.identityPath = join(this.stateDir, "identity.json");
    this.composeFiles = options.composeFiles.map((file) => {
      const resolved = resolve(this.bundleDir, file);
      assertWithin(this.bundleDir, resolved, "Compose file");
      return resolved;
    });
  }

  async probe(manifest: ReleaseManifest): Promise<UpdateSystemProbe> {
    await this.ensureLayout();
    const details: Record<string, string> = {};
    const [docker, compose, configuration, disk, backupWritable, attachmentSnapshotAvailable] = await Promise.all([
      this.tryCommand("docker", ["version", "--format", "{{.Server.Version}}"]),
      this.tryCommand("docker", ["compose", "version", "--short"]),
      this.tryCommand("docker", [...this.composeArgs(this.currentEnvPath), "config", "--quiet"]),
      statfs(this.stateDir),
      this.checkBackupWritable(),
      this.checkAttachmentRecoverySupport()
    ]);
    const freeBytes = disk.bavail * disk.bsize;
    const requiredBytes = Math.max(this.options.minimumFreeBytes ?? 2 * 1024 * 1024 * 1024, manifest.images.length * 512 * 1024 * 1024);
    const configurationDrift = await this.configurationDrift();
    details.health = "Current API health is checked separately before maintenance";
    details.docker = docker.ok ? `Docker ${docker.output}` : docker.output;
    details.compose = compose.ok ? `Compose ${compose.output}` : compose.output;
    details.configuration = configuration.ok ? "Managed Compose bundle validates" : configuration.output;
    details.configurationDrift = configurationDrift ? "Managed bundle checksum differs from the installed receipt" : "Managed bundle matches its receipt";
    details.backup = backupWritable ? `Recovery directory writable at ${this.recoveryDir}` : "Recovery directory is not writable";
    details.attachments = attachmentSnapshotAvailable
      ? "Database metadata and attachment blobs will be captured and restore-verified together"
      : "Managed bundle is missing coordinated attachment backup or restore support";

    return {
      healthy: await this.checkUrl(this.options.apiHealthUrl ?? "http://127.0.0.1:3000/health", false),
      dockerAvailable: docker.ok,
      composeAvailable: compose.ok,
      configurationValid: configuration.ok,
      configurationDrift,
      backupWritable,
      freeBytes,
      requiredBytes,
      attachmentSnapshotAvailable,
      details
    };
  }

  async createRecoveryPoint(input: { identity: ProductIdentity; manifest: ReleaseManifest }): Promise<RecoveryPoint> {
    this.failIfRequested("backing-up");
    await this.ensureLayout();
    if (!input.manifest.recovery.components.includes("attachments") || input.manifest.recovery.attachmentMode !== "included") {
      throw new Error("Managed recovery requires an included attachment backup set");
    }
    const id = `recovery_${safeTimestamp(new Date())}_${input.identity.version.replace(/[^0-9A-Za-z.-]/g, "-")}`;
    const directory = join(this.recoveryDir, id);
    assertWithin(this.recoveryDir, directory, "Recovery directory");
    await mkdir(directory, { recursive: false, mode: 0o700 });
    const configurationPath = join(directory, "release.env");
    const backupSetDirectory = join(directory, "backup-set");
    const backupPath = join(backupSetDirectory, "database.dump");
    const attachmentSnapshotPath = join(backupSetDirectory, "attachments.tar");

    try {
      await copyFile(this.currentEnvPath, configurationPath);
      await this.run("bash", [join(this.bundleDir, "scripts/backup-set.sh"), backupSetDirectory], {
        ...this.composeEnvironment(),
        FORGETBASE_BACKUP_DIR: directory
      });
      await this.run("bash", [join(this.bundleDir, "scripts/verify-backup-set.sh"), backupSetDirectory], {
        ...this.composeEnvironment()
      });

      const [backupStats, attachmentStats, configurationStats] = await Promise.all([
        stat(backupPath),
        stat(attachmentSnapshotPath),
        stat(configurationPath)
      ]);
      return recoveryPointSchema.parse({
        id,
        createdAt: new Date().toISOString(),
        version: input.identity.version,
        sourceRevision: input.identity.sourceRevision,
        databaseSchemaVersion: input.identity.databaseSchemaVersion,
        imageReferences: await readImageReferences(this.currentEnvPath),
        backupPath,
        configurationPath,
        attachmentSnapshotId: attachmentSnapshotPath,
        verified: backupStats.size > 0 && attachmentStats.size > 0,
        protected: false,
        sizeBytes: backupStats.size + attachmentStats.size + configurationStats.size
      });
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async stage(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("staging");
    await this.ensureLayout();
    await writeFile(this.candidateEnvPath, buildReleaseEnvironment(manifest, this.options.currentIdentity.updaterVersion), { encoding: "utf8", mode: 0o600 });
    await this.run("docker", [...this.composeArgs(this.candidateEnvPath), "pull"]);
    await this.run("docker", [
      ...this.composeArgs(this.candidateEnvPath),
      "run",
      "--rm",
      "-e",
      `FORGETBASE_EXPECTED_MIGRATION_IDS=${manifest.migration.migrationIds.join(",")}`,
      "migrate",
      "pnpm",
      "--filter",
      "@forgetbase/db",
      "migrate",
      "--",
      "--plan"
    ]);
  }

  async enterMaintenance(): Promise<void> {
    this.failIfRequested("maintenance");
    await this.run("docker", [...this.composeArgs(this.currentEnvPath), "stop", "proxy", "api", "worker"]);
  }

  async resumeCurrent(): Promise<void> {
    await this.run("docker", [...this.composeArgs(this.currentEnvPath), "up", "-d", "postgres", "clamav"]);
    await this.run("docker", [...this.composeArgs(this.currentEnvPath), "up", "--no-deps", "-d", "api", "worker", "web", "proxy"]);
  }

  async migrate(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("migrating");
    await this.run("docker", [
      ...this.composeArgs(this.candidateEnvPath),
      "run",
      "--rm",
      "-e",
      `FORGETBASE_RELEASE_VERSION=${manifest.version}`,
      "-e",
      `FORGETBASE_EXPECTED_MIGRATION_IDS=${manifest.migration.migrationIds.join(",")}`,
      "migrate"
    ]);
  }

  async startCandidate(_manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("starting");
    await this.run("docker", [...this.composeArgs(this.candidateEnvPath), "up", "-d", "postgres", "clamav"]);
    await this.run("docker", [...this.composeArgs(this.candidateEnvPath), "up", "--no-deps", "-d", "api", "worker", "web"]);
  }

  async verifyCandidate(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("verifying");
    const response = await fetchWithRetries(this.options.apiHealthUrl ?? "http://127.0.0.1:3000/health", 30);
    const body = await response.json() as { status?: unknown; version?: unknown };
    if (body.status !== "ok" || body.version !== manifest.version) {
      throw new Error(`Candidate health identity mismatch: expected ${manifest.version}`);
    }
    await fetchWithRetries(this.options.webHealthUrl ?? "http://127.0.0.1:5175/", 10);
  }

  async reopenWrites(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("reopen-writes");
    await this.run("docker", [...this.composeArgs(this.candidateEnvPath), "up", "--no-deps", "-d", "proxy"]);
    await copyFile(this.candidateEnvPath, this.currentEnvPath);
    const identity = productIdentitySchema.parse({
      ...this.options.currentIdentity,
      version: manifest.version,
      sourceRevision: manifest.sourceRevision,
      builtAt: manifest.publishedAt,
      channel: manifest.channel,
      databaseSchemaVersion: manifest.migration.targetSchemaVersion,
      installationMode: "managed",
      managed: true
    });
    await writeFile(this.identityPath, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await this.writeBundleReceipt();
  }

  async rollbackApplication(point: RecoveryPoint): Promise<void> {
    if (!point.configurationPath) throw new Error("Recovery point has no configuration snapshot");
    await copyFile(point.configurationPath, this.currentEnvPath);
    await this.resumeCurrent();
    await this.writeRecoveredIdentity(point);
  }

  async rollbackDatabase(point: RecoveryPoint): Promise<void> {
    if (!point.backupPath || !point.configurationPath || !point.attachmentSnapshotId) {
      throw new Error("Recovery point does not contain a database, attachment, and configuration backup set");
    }

    await copyFile(point.configurationPath, this.currentEnvPath);
    await this.run("docker", [...this.composeArgs(this.currentEnvPath), "stop", "proxy", "api", "worker"]);
    const database = this.options.postgresDatabase ?? "forgetbase";
    await this.run("bash", [join(this.bundleDir, "scripts/restore-postgres.sh"), point.backupPath, database], {
      ...this.composeEnvironment(),
      FORGETBASE_RESTORE_CONFIRM: database
    });
    await this.run("bash", [join(this.bundleDir, "scripts/restore-attachments.sh"), point.attachmentSnapshotId], {
      ...this.composeEnvironment(),
      FORGETBASE_ATTACHMENT_RESTORE_CONFIRM: "attachments"
    });
    await this.resumeCurrent();
    await this.writeRecoveredIdentity(point);
  }

  async deleteRecoveryPoint(point: RecoveryPoint): Promise<void> {
    const paths = [point.backupPath, point.configurationPath, point.attachmentSnapshotId]
      .filter((value): value is string => Boolean(value));
    for (const path of paths) assertWithin(this.recoveryDir, resolve(path), "Recovery artifact");
    const directory = point.configurationPath ? dirname(point.configurationPath) : join(this.recoveryDir, point.id);
    assertWithin(this.recoveryDir, directory, "Recovery directory");
    await rm(directory, { recursive: true, force: true });
  }

  async refreshIdentity(): Promise<ProductIdentity> {
    try {
      return productIdentitySchema.parse(JSON.parse(await readFile(this.identityPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.options.currentIdentity;
      throw error;
    }
  }

  private async ensureLayout(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await mkdir(this.recoveryDir, { recursive: true, mode: 0o700 });

    const realBundle = await realpath(this.bundleDir);
    for (const file of this.composeFiles) {
      const realFile = await realpath(file);
      assertWithin(realBundle, realFile, "Compose file");
    }

    try {
      await stat(this.currentEnvPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (this.options.currentIdentity.installationMode === "managed") {
        throw new Error("Managed installation state is missing current-release.env; run the verified bootstrap installer");
      }
      await writeFile(this.currentEnvPath, buildIdentityEnvironment(this.options.currentIdentity), { encoding: "utf8", mode: 0o600 });
    }
  }

  private composeArgs(envPath: string): string[] {
    return [
      "compose",
      "--project-name",
      this.options.composeProjectName ?? "forgetbase",
      "--env-file",
      envPath,
      ...this.composeFiles.flatMap((file) => ["-f", file])
    ];
  }

  private composeEnvironment(): NodeJS.ProcessEnv {
    return {
      COMPOSE_PROJECT_NAME: this.options.composeProjectName ?? "forgetbase",
      COMPOSE_FILE: this.composeFiles.join(":")
    };
  }

  private async run(command: string, args: string[], extraEnvironment: NodeJS.ProcessEnv = {}): Promise<string> {
    const result = await runCommand({
      command,
      args,
      cwd: this.bundleDir,
      timeoutMs: this.options.commandTimeoutMs ?? 15 * 60_000,
      environment: { ...this.options.environment, ...extraEnvironment }
    });
    if (!result.ok) throw new Error(`${basename(command)} failed: ${result.output}`);
    return result.output;
  }

  private async tryCommand(command: string, args: string[]): Promise<CommandResult> {
    return runCommand({
      command,
      args,
      cwd: this.bundleDir,
      timeoutMs: Math.min(this.options.commandTimeoutMs ?? 30_000, 30_000),
      environment: this.options.environment
    });
  }

  private async checkUrl(url: string, requireVersion: boolean): Promise<boolean> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return false;
      if (!requireVersion) return true;
      const body = await response.json() as { version?: unknown };
      return body.version === this.options.currentIdentity.version;
    } catch {
      return false;
    }
  }

  private async checkBackupWritable(): Promise<boolean> {
    const probePath = join(this.recoveryDir, `.write-probe-${process.pid}`);
    try {
      await writeFile(probePath, "probe", { encoding: "utf8", mode: 0o600 });
      await rm(probePath);
      return true;
    } catch {
      return false;
    }
  }

  private async checkAttachmentRecoverySupport(): Promise<boolean> {
    try {
      await Promise.all([
        "backup-attachments.sh",
        "backup-set.sh",
        "restore-attachments.sh",
        "verify-backup-set.sh"
      ].map((script) => stat(join(this.bundleDir, "scripts", script))));
      return true;
    } catch {
      return false;
    }
  }

  private async configurationDrift(): Promise<boolean> {
    const receiptPath = join(this.stateDir, "bundle.sha256");
    try {
      const expected = (await readFile(receiptPath, "utf8")).trim();
      return expected !== await this.bundleDigest();
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ENOENT";
    }
  }

  private async bundleDigest(): Promise<string> {
    return computeComposeBundleDigest(this.bundleDir, this.composeFiles);
  }

  private async writeBundleReceipt(): Promise<void> {
    await writeFile(join(this.stateDir, "bundle.sha256"), `${await this.bundleDigest()}\n`, { encoding: "utf8", mode: 0o600 });
  }

  private async writeRecoveredIdentity(point: RecoveryPoint): Promise<void> {
    const identity = productIdentitySchema.parse({
      ...this.options.currentIdentity,
      version: point.version,
      sourceRevision: point.sourceRevision,
      databaseSchemaVersion: point.databaseSchemaVersion,
      installationMode: "managed",
      managed: true
    });
    await writeFile(this.identityPath, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  private failIfRequested(phase: string): void {
    if (this.options.environment?.FORGETBASE_UPDATER_FAIL_PHASE === phase) {
      throw new Error(`Injected updater failure at ${phase}`);
    }
  }
}

export async function computeComposeBundleDigest(bundleDir: string, composeFiles: readonly string[]): Promise<string> {
  const root = resolve(bundleDir);
  const hash = createHash("sha256");
  for (const input of [...composeFiles].sort()) {
    const file = resolve(input);
    assertWithin(root, file, "Compose file");
    hash.update(file.slice(root.length));
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}

interface CommandResult {
  ok: boolean;
  output: string;
}

async function runCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  environment?: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.environment },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < maxCommandOutputBytes) output += chunk.toString("utf8");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timeout = setTimeout(() => child.kill("SIGTERM"), input.timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ ok: false, output: error.message });
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ ok: code === 0, output: output.trim().slice(0, maxCommandOutputBytes) });
    });
  });
}

async function fetchWithRetries(url: string, attempts: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5_000) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`Health verification failed for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export function buildReleaseEnvironment(manifest: ReleaseManifest, updaterVersion?: string | null): string {
  const values = new Map(manifest.images.map((image) => [image.component, image.reference]));
  const components = ["api", "web", "worker", "migrate", "proxy", "updater"] as const;
  return [
    `FORGETBASE_VERSION=${manifest.version}`,
    `FORGETBASE_SOURCE_REVISION=${manifest.sourceRevision}`,
    `FORGETBASE_RELEASE_CHANNEL=${manifest.channel}`,
    `FORGETBASE_DATABASE_SCHEMA_VERSION=${manifest.migration.targetSchemaVersion}`,
    `FORGETBASE_UPDATER_VERSION=${updaterVersion ?? manifest.minUpdaterVersion}`,
    ...components.map((component) =>
      `FORGETBASE_${component.toUpperCase()}_IMAGE=${values.get(component) ?? ""}`
    )
  ].join("\n") + "\n";
}

function buildIdentityEnvironment(identity: ProductIdentity): string {
  return [
    `FORGETBASE_VERSION=${identity.version}`,
    `FORGETBASE_SOURCE_REVISION=${identity.sourceRevision}`,
    `FORGETBASE_RELEASE_CHANNEL=${identity.channel}`,
    `FORGETBASE_DATABASE_SCHEMA_VERSION=${identity.databaseSchemaVersion ?? "unknown"}`
  ].join("\n") + "\n";
}

async function readImageReferences(envPath: string): Promise<string[]> {
  const source = await readFile(envPath, "utf8");
  return source.split("\n")
    .filter((line) => /^FORGETBASE_[A-Z]+_IMAGE=/.test(line))
    .map((line) => line.slice(line.indexOf("=") + 1))
    .filter(Boolean);
}

function assertWithin(root: string, target: string, label: string): void {
  const path = relative(root, target);
  if (path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))) return;
  throw new Error(`${label} must remain within ${root}`);
}

function safeTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
