import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  stat,
  statfs,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  productIdentitySchema,
  recoveryPointSchema,
  releaseManifestSchema,
  type ProductIdentity,
  type RecoveryPoint,
  type ReleaseManifest
} from "@forgetbase/schema";
import { durableWriteFile } from "./store.js";
import type { UpdateExecutor, UpdateSystemProbe } from "./manager.js";
import { approvalDigest } from "./approval.js";

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
  lockFileDescriptor?: number;
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
    // Discovery/preflight must not create directories, files or containers.
    await stat(this.currentEnvPath);
    const realBundle = await realpath(this.bundleDir);
    for (const file of this.composeFiles) assertWithin(realBundle, await realpath(file), "Compose file");
    const details: Record<string, string> = {};
    const [docker, compose, configuration, disk, backupWritable, attachmentSnapshotAvailable] = await Promise.all([
      this.tryDocker(["version", "--format", "{{.Server.Version}}"]),
      this.tryDocker(["compose", "version", "--short"]),
      this.tryDocker([...this.composeArgs(this.currentEnvPath), "config", "--quiet"]),
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
      await this.runScript("scripts/backup-set.sh", [backupSetDirectory], {
        ...this.composeEnvironment(),
        FORGETBASE_BACKUP_DIR: directory
      });
      await this.runScript("scripts/verify-backup-set.sh", [backupSetDirectory], {
        ...this.composeEnvironment()
      });

      const [backupStats, attachmentStats, configurationStats] = await Promise.all([
        stat(backupPath),
        stat(attachmentSnapshotPath),
        stat(configurationPath)
      ]);
      const point = recoveryPointSchema.parse({
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
      await durableWriteFile(join(directory, "recovery-receipt.json"), JSON.stringify({
        point, configurationSha256: createHash("sha256").update(await readFile(configurationPath)).digest("hex"),
        manifestSha256: createHash("sha256").update(await readFile(join(backupSetDirectory, "manifest.json"))).digest("hex")
      }));
      return point;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async stage(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("staging");
    await this.ensureLayout();
    await durableWriteFile(this.candidateEnvPath, buildReleaseEnvironment(manifest, this.options.currentIdentity.updaterVersion, false));
    await this.runDocker([...this.composeArgs(this.candidateEnvPath), "pull"]);
    await this.runDocker([
      ...this.composeArgs(this.candidateEnvPath),
      "run",
      "--no-deps",
      "--rm",
      "--name",
      this.migrationContainerName(),
      "-e",
      `FORGETBASE_EXPECTED_MIGRATION_IDS=${manifest.migration.migrationIds.join(",")}`,
      "-e",
      `FORGETBASE_EXPECTED_SCHEMA_VERSION=${manifest.migration.targetSchemaVersion}`,
      "-e",
      "FORGETBASE_ALLOW_APPLIED_EXPECTED_MIGRATIONS=true",
      "migrate",
      "node",
      "packages/db/dist/migrate.js",
      "--plan"
    ]);
  }

  async enterMaintenance(): Promise<void> {
    this.failIfRequested("maintenance");
    await this.runDocker([...this.composeArgs(this.currentEnvPath), "stop", "proxy", "api", "worker", "migrate"]);
    await this.stopInterruptedMigration();
  }

  async resumeCurrent(): Promise<void> {
    await this.runDocker([...this.composeArgs(this.currentEnvPath), "up", "-d", "postgres", "clamav"]);
    await this.runDocker([...this.composeArgs(this.currentEnvPath), "up", "--no-deps", "-d", "api", "worker", "web", "proxy"]);
    await this.verifyServices(await this.refreshIdentity(), true);
  }

  async migrate(manifest: ReleaseManifest): Promise<void> {
    manifest = releaseManifestSchema.parse(manifest);
    this.failIfRequested("migrating");
    await this.runDocker([
      ...this.composeArgs(this.candidateEnvPath),
      "run",
      "--no-deps",
      "--rm",
      "--name",
      this.migrationContainerName(),
      "-e",
      `FORGETBASE_RELEASE_VERSION=${manifest.version}`,
      "-e",
      `FORGETBASE_EXPECTED_MIGRATION_IDS=${manifest.migration.migrationIds.join(",")}`,
      "-e",
      `FORGETBASE_EXPECTED_SCHEMA_VERSION=${manifest.migration.targetSchemaVersion}`,
      "-e",
      "FORGETBASE_ALLOW_APPLIED_EXPECTED_MIGRATIONS=true",
      "migrate"
    ]);
  }

  async startCandidate(_manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("starting");
    await this.runDocker([...this.composeArgs(this.candidateEnvPath), "up", "-d", "postgres", "clamav"]);
    // The candidate API is fenced by immutable container configuration. No worker starts here.
    await this.runDocker([...this.composeArgs(this.candidateEnvPath), "up", "--no-deps", "-d", "api", "web"]);
  }

  async verifyCandidate(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("verifying");
    await this.verifyServices({ version: manifest.version, sourceRevision: manifest.sourceRevision,
      databaseSchemaVersion: manifest.migration.targetSchemaVersion }, false);
  }

  async reopenWrites(manifest: ReleaseManifest): Promise<void> {
    this.failIfRequested("reopen-writes");
    // Manager has durably committed writesReopened before entering this method.
    // Persist the opened projection before recreating any process able to accept writes.
    await durableWriteFile(this.currentEnvPath, buildReleaseEnvironment(manifest, this.options.currentIdentity.updaterVersion, true));
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
    await durableWriteFile(this.identityPath, `${JSON.stringify(identity, null, 2)}\n`);
    await this.writeBundleReceipt();
    await this.runDocker([...this.composeArgs(this.currentEnvPath), "up", "--no-deps", "-d", "api", "worker", "web", "proxy"]);
    await this.verifyServices(identity, true);
  }

  async rollbackApplication(point: RecoveryPoint): Promise<void> {
    if (!point.configurationPath) throw new Error("Recovery point has no configuration snapshot");
    await this.enterMaintenance();
    await this.verifyRecoveryPoint(point);
    await durableWriteFile(this.currentEnvPath, await readFile(point.configurationPath, "utf8"));
    await this.writeRecoveredIdentity(point);
    await this.resumeCurrent();
  }

  async rollbackDatabase(point: RecoveryPoint): Promise<void> {
    if (!point.backupPath || !point.configurationPath || !point.attachmentSnapshotId) {
      throw new Error("Recovery point does not contain a database, attachment, and configuration backup set");
    }

    await this.enterMaintenance();
    await this.verifyRecoveryPoint(point);
    await durableWriteFile(this.currentEnvPath, await readFile(point.configurationPath, "utf8"));
    const database = this.options.postgresDatabase ?? this.options.environment?.FORGETBASE_POSTGRES_DATABASE ?? "forgetbase";
    await this.runScript("scripts/restore-postgres.sh", [point.backupPath, database], {
      ...this.composeEnvironment(),
      FORGETBASE_RESTORE_CONFIRM: database
    });
    await this.runScript("scripts/restore-attachments.sh", [point.attachmentSnapshotId], {
      ...this.composeEnvironment(),
      FORGETBASE_ATTACHMENT_RESTORE_CONFIRM: "attachments"
    });
    await this.writeRecoveredIdentity(point);
    await this.resumeCurrent();
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
      const installed = productIdentitySchema.parse(JSON.parse(await readFile(this.identityPath, "utf8")));
      // Host runtime replacement does not rewrite the installed application.
      // Keep its fresh identity, using metadata from this running updater.
      return productIdentitySchema.parse({ ...installed, updaterVersion: this.options.currentIdentity.updaterVersion });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (this.options.currentIdentity.installationMode === "managed") throw new Error("Managed installation identity is missing");
        return this.options.currentIdentity;
      }
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
      COMPOSE_FILE: this.composeFiles.join(":"),
      COMPOSE_ENV_FILES: this.currentEnvPath,
      FORGETBASE_DB_NAME: this.options.postgresDatabase ?? this.options.environment?.FORGETBASE_POSTGRES_DATABASE ?? "forgetbase",
      FORGETBASE_DB_USER: this.options.environment?.FORGETBASE_POSTGRES_USER ?? "forgetbase"
    };
  }

  private commandOptions(extraEnvironment: NodeJS.ProcessEnv = {}) {
    return {
      cwd: this.bundleDir,
      timeoutMs: this.options.commandTimeoutMs ?? 15 * 60_000,
      lockFileDescriptor: this.options.lockFileDescriptor,
      environment: this.commandEnvironment(extraEnvironment)
    };
  }

  private async runDocker(args: string[]): Promise<string> {
    const result = await runCommand({
      ...this.commandOptions(),
      launch: (options) => spawn("docker", args, { ...options, shell: false })
    });
    if (!result.ok) throw new Error(`docker failed: ${result.output}`);
    return result.output;
  }

  private async runScript(
    script: "scripts/backup-set.sh" | "scripts/verify-backup-set.sh" | "scripts/restore-postgres.sh" | "scripts/restore-attachments.sh",
    args: string[], extraEnvironment: NodeJS.ProcessEnv = {}
  ): Promise<string> {
    const result = await runCommand({
      ...this.commandOptions(extraEnvironment),
      launch: (options) => spawn("bash", ["--", join(this.bundleDir, script), ...args], { ...options, shell: false })
    });
    if (!result.ok) throw new Error(`bash failed: ${result.output}`);
    return result.output;
  }

  private async tryDocker(args: string[]): Promise<CommandResult> {
    return runCommand({
      ...this.commandOptions(),
      timeoutMs: Math.min(this.options.commandTimeoutMs ?? 30_000, 30_000),
      launch: (options) => spawn("docker", args, { ...options, shell: false })
    });
  }

  private async verifyServices(identity: Pick<ProductIdentity, "version" | "sourceRevision" | "databaseSchemaVersion">, writesEnabled: boolean): Promise<void> {
    const healthUrl = this.options.apiHealthUrl ?? "http://127.0.0.1:3000/health";
    const response = await fetchWithRetries(healthUrl, 30);
    const body = await response.json() as { status?: unknown; version?: unknown; managedWritesEnabled?: unknown; release?: { release?: unknown; sourceRevision?: unknown; schemaHead?: unknown } };
    if (body.status !== "ok" || body.version !== identity.version || body.managedWritesEnabled !== writesEnabled ||
        body.release?.release !== identity.version || body.release.sourceRevision !== identity.sourceRevision ||
        (!writesEnabled && body.release.schemaHead !== identity.databaseSchemaVersion)) {
      throw new Error(`Immutable health identity or write fence mismatch: expected ${identity.version}`);
    }
    await fetchWithRetries(new URL("/ready", healthUrl).href, 30);
    const webUrl = new URL("/release.json", this.options.webHealthUrl ?? "http://127.0.0.1:5175/").href;
    const web = await (await fetchWithRetries(webUrl, 10)).json() as { release?: unknown; sourceRevision?: unknown };
    if (web.release !== identity.version || web.sourceRevision !== identity.sourceRevision) {
      throw new Error("Web immutable release identity mismatch");
    }
  }

  private async readDatabaseSchemaVersion(): Promise<string> {
    const database = this.options.postgresDatabase ?? this.options.environment?.FORGETBASE_POSTGRES_DATABASE ?? "forgetbase";
    const user = this.options.environment?.FORGETBASE_POSTGRES_USER ?? "forgetbase";
    const schema = await this.runDocker([...this.composeArgs(this.currentEnvPath), "exec", "-T", "postgres", "psql", "-U", user,
      "-d", database, "-t", "-A", "-c", "SELECT id FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1"]);
    if (!schema || !/^[A-Za-z0-9_-]+$/.test(schema)) throw new Error("Could not read restored database schema identity");
    return schema;
  }

  private commandEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const environment = { ...process.env, ...this.options.environment };
    // Shell variables outrank --env-file. Never let the host substitute another image,
    // identity or fence permission into the signed release projection.
    for (const key of Object.keys(environment)) {
      if (/^FORGETBASE_(?:[A-Z]+_IMAGE|VERSION|SOURCE_REVISION|RELEASE_CHANNEL|DATABASE_SCHEMA_VERSION|UPDATER_VERSION|MANAGED_WRITES_ENABLED)$/.test(key) ||
          ["COMPOSE_FILE", "COMPOSE_ENV_FILES", "COMPOSE_PROFILES", "COMPOSE_PROJECT_NAME"].includes(key)) delete environment[key];
    }
    return { ...environment, ...extra };
  }

  private migrationContainerName(): string {
    return `${this.options.composeProjectName ?? "forgetbase"}-managed-migration`;
  }

  private async stopInterruptedMigration(): Promise<void> {
    const name = this.migrationContainerName();
    const id = await this.runDocker(["ps", "-aq", "--filter", `name=^/${name}$`]);
    if (!id) return;
    const labels = JSON.parse(await this.runDocker(["inspect", "--format", "{{json .Config.Labels}}", id])) as Record<string, string>;
    if (labels["com.docker.compose.project"] !== (this.options.composeProjectName ?? "forgetbase") || labels["com.docker.compose.service"] !== "migrate") {
      throw new Error("Interrupted migration container ownership mismatch");
    }
    await this.runDocker(["rm", "--force", id]);
  }

  async recoveryReceiptDigest(point: RecoveryPoint): Promise<string> {
    if (!point.configurationPath || !point.backupPath || !point.attachmentSnapshotId) throw new Error("Incomplete recovery point");
    const root = await realpath(this.recoveryDir);
    const expectedDirectory = resolve(this.recoveryDir, point.id);
    assertWithin(this.recoveryDir, expectedDirectory, "Recovery directory");
    const directory = await realpath(expectedDirectory);
    if ((await lstat(expectedDirectory)).isSymbolicLink()) throw new Error("Recovery directory must not be a symlink");
    assertWithin(root, directory, "Recovery directory");
    if (directory === root) throw new Error("Recovery point cannot be the recovery root");
    for (const [path, name] of [[point.configurationPath, "release.env"], [point.backupPath, "backup-set/database.dump"],
      [point.attachmentSnapshotId, "backup-set/attachments.tar"]] as const) {
      if (resolve(path) !== join(expectedDirectory, name) || await realpath(path) !== join(directory, name)) {
        throw new Error("Recovery artifact must use its canonical verified path");
      }
    }
    const receiptBytes = await boundedRecoveryFile(join(directory, "recovery-receipt.json"));
    const manifestBytes = await boundedRecoveryFile(join(dirname(point.backupPath), "manifest.json"));
    const receipt = JSON.parse(receiptBytes.toString("utf8")) as { point: RecoveryPoint; configurationSha256: string; manifestSha256: string };
    if (approvalDigest(receipt.point) !== approvalDigest(point) ||
        receipt.configurationSha256 !== await recoveryFileHash(point.configurationPath) ||
        receipt.manifestSha256 !== createHash("sha256").update(manifestBytes).digest("hex")) {
      throw new Error("Recovery receipt mismatch");
    }
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      format: string; consistency: string; files: { database: { path: string; sha256: string; bytes: number }; attachments: { path: string; sha256: string; bytes: number } }
    };
    if (manifest.format !== "forgetbase-backup-set-v1" || manifest.consistency !== "writers-stopped") throw new Error("Invalid recovery backup manifest");
    for (const [path, entry, name] of [[point.backupPath, manifest.files.database, "database.dump"], [point.attachmentSnapshotId, manifest.files.attachments, "attachments.tar"]] as const) {
      if (entry.path !== name || entry.bytes !== (await stat(path)).size || entry.sha256 !== await recoveryFileHash(path)) throw new Error("Recovery artifact checksum mismatch");
    }
    return createHash("sha256").update(receiptBytes).digest("hex");
  }

  private async verifyRecoveryPoint(point: RecoveryPoint): Promise<void> {
    await this.recoveryReceiptDigest(point);
    // Full restore verification is mutating and is only called after approval.
    await this.runScript("scripts/verify-backup-set.sh", [dirname(point.backupPath!)], this.composeEnvironment());
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
    try {
      await access(this.stateDir, constants.W_OK);
      await access(this.recoveryDir, constants.W_OK).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      return true;
    } catch {
      return false;
    }
  }

  private async checkAttachmentRecoverySupport(): Promise<boolean> {
    try {
      await Promise.all([
        "scripts/backup-attachments.sh",
        "scripts/backup-set.sh",
        "scripts/restore-attachments.sh",
        "scripts/verify-backup-set.sh"
      ].map((script) => stat(join(this.bundleDir, script))));
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
      return true;
    }
  }

  private async bundleDigest(): Promise<string> {
    return computeComposeBundleDigest(this.bundleDir, this.composeFiles);
  }

  private async writeBundleReceipt(): Promise<void> {
    await durableWriteFile(join(this.stateDir, "bundle.sha256"), `${await this.bundleDigest()}\n`);
  }

  private async writeRecoveredIdentity(point: RecoveryPoint): Promise<void> {
    const identity = productIdentitySchema.parse({
      ...this.options.currentIdentity,
      version: point.version,
      sourceRevision: point.sourceRevision,
      databaseSchemaVersion: await this.readDatabaseSchemaVersion(),
      installationMode: "managed",
      managed: true
    });
    await durableWriteFile(this.identityPath, `${JSON.stringify(identity, null, 2)}\n`);
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
  launch(options: SpawnOptions): ChildProcess;
  cwd: string;
  timeoutMs: number;
  environment?: NodeJS.ProcessEnv;
  lockFileDescriptor?: number;
}): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = input.launch({
      cwd: input.cwd,
      env: input.environment ?? process.env,
      detached: process.platform !== "win32",
      stdio: input.lockFileDescriptor === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", input.lockFileDescriptor],
      shell: false
    });
    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < maxCommandOutputBytes) output += chunk.toString("utf8").slice(0, maxCommandOutputBytes - output.length);
    };
    child.stdout!.on("data", append);
    child.stderr!.on("data", append);
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* already exited */ }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 2_000);
    }, input.timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      resolvePromise({ ok: false, output: error.message });
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      resolvePromise({ ok: code === 0 && !timedOut, output: timedOut ? "Command timed out; inspect operation state before retrying" : output.trim().slice(0, maxCommandOutputBytes) });
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

export function buildReleaseEnvironment(manifest: ReleaseManifest, updaterVersion?: string | null, writesEnabled = true): string {
  manifest = releaseManifestSchema.parse(manifest);
  const values = new Map(manifest.images.map((image) => [image.component, image.reference]));
  const components = ["api", "web", "worker", "migrate", "proxy", "updater"] as const;
  return [
    `FORGETBASE_MANAGED_WRITES_ENABLED=${writesEnabled}`,
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

async function boundedRecoveryFile(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("Invalid or oversized recovery receipt file");
    return await file.readFile();
  } finally { await file.close(); }
}

async function recoveryFileHash(path: string): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Recovery artifact must be a regular file");
    const hash = createHash("sha256"); const buffer = Buffer.alloc(1024 * 1024);
    for (;;) {
      const { bytesRead } = await file.read(buffer);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } finally { await file.close(); }
}
