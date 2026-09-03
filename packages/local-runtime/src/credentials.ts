import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEYCHAIN_SERVICE = "io.forgetbase.local";
const MAXIMUM_CREDENTIAL_BYTES = 16 * 1024;
const BASE64URL_32_BYTE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface LocalCredentialBundle {
  schemaVersion: 1;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  profileIntegrityKey: string;
}

export interface LocalCredentialStore {
  readonly backend: "macos-keychain" | "linux-secret-service" | "test";
  get(account: string): Promise<LocalCredentialBundle | null>;
  set(account: string, bundle: LocalCredentialBundle): Promise<void>;
  delete(account: string): Promise<void>;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
}

export type CredentialCommandRunner = (
  executable: string,
  args: string[],
  input?: string
) => Promise<CommandResult>;

export function createSystemCredentialStore(options: {
  platform?: NodeJS.Platform;
  commandRunner?: CredentialCommandRunner;
} = {}): LocalCredentialStore {
  const platform = options.platform ?? process.platform;
  const run = options.commandRunner ?? runCredentialCommand;
  if (platform === "darwin") {
    return new MacOsKeychainCredentialStore(run);
  }
  if (platform === "linux") {
    return new LinuxSecretServiceCredentialStore(run);
  }
  throw new Error("ForgetBase Local supports credential storage on macOS Keychain and Linux Secret Service only");
}

export class MemoryLocalCredentialStore implements LocalCredentialStore {
  readonly backend = "test" as const;
  private readonly values = new Map<string, LocalCredentialBundle>();

  async get(account: string): Promise<LocalCredentialBundle | null> {
    const value = this.values.get(validateAccount(account));
    return value ? { ...value } : null;
  }

  async set(account: string, bundle: LocalCredentialBundle): Promise<void> {
    this.values.set(validateAccount(account), validateCredentialBundle(bundle));
  }

  async delete(account: string): Promise<void> {
    this.values.delete(validateAccount(account));
  }
}

class MacOsKeychainCredentialStore implements LocalCredentialStore {
  readonly backend = "macos-keychain" as const;

  constructor(private readonly run: CredentialCommandRunner) {}

  async get(account: string): Promise<LocalCredentialBundle | null> {
    const result = await runMacKeychainHelper(this.run, {
      operation: "get",
      account: validateAccount(account)
    });
    if (result.exitCode === 44) return null;
    if (result.exitCode !== 0) throw new Error("macOS Keychain could not read the ForgetBase Local credential");
    return parseCredentialBundle(result.stdout.trim());
  }

  async set(account: string, bundle: LocalCredentialBundle): Promise<void> {
    const serialized = serializeCredentialBundle(bundle);
    const result = await runMacKeychainHelper(this.run, {
      operation: "set",
      account: validateAccount(account),
      value: serialized
    });
    if (result.exitCode !== 0) {
      throw new Error("macOS Keychain refused the ForgetBase Local credential");
    }
  }

  async delete(account: string): Promise<void> {
    const result = await runMacKeychainHelper(this.run, {
      operation: "delete",
      account: validateAccount(account)
    });
    if (result.exitCode !== 0) {
      throw new Error("macOS Keychain could not remove the ForgetBase Local credential");
    }
  }
}

class LinuxSecretServiceCredentialStore implements LocalCredentialStore {
  readonly backend = "linux-secret-service" as const;

  constructor(private readonly run: CredentialCommandRunner) {}

  async get(account: string): Promise<LocalCredentialBundle | null> {
    const result = await this.run("secret-tool", [
      "lookup",
      "service",
      KEYCHAIN_SERVICE,
      "account",
      validateAccount(account)
    ]);
    if (result.exitCode !== 0 || !result.stdout.trim()) return null;
    return parseCredentialBundle(result.stdout.trim());
  }

  async set(account: string, bundle: LocalCredentialBundle): Promise<void> {
    const result = await this.run("secret-tool", [
      "store",
      "--label=ForgetBase Local",
      "service",
      KEYCHAIN_SERVICE,
      "account",
      validateAccount(account)
    ], `${serializeCredentialBundle(bundle)}\n`);
    if (result.exitCode !== 0) {
      throw new Error("Linux Secret Service refused the ForgetBase Local credential");
    }
  }

  async delete(account: string): Promise<void> {
    const result = await this.run("secret-tool", [
      "clear",
      "service",
      KEYCHAIN_SERVICE,
      "account",
      validateAccount(account)
    ]);
    if (result.exitCode !== 0 && await this.get(account) !== null) {
      throw new Error("Linux Secret Service could not remove the ForgetBase Local credential");
    }
  }
}

function validateCredentialBundle(input: LocalCredentialBundle): LocalCredentialBundle {
  if (input.schemaVersion !== 1
    || typeof input.refreshToken !== "string"
    || input.refreshToken.length < 32
    || input.refreshToken.length > 1_024
    || typeof input.refreshTokenExpiresAt !== "string"
    || !Number.isFinite(Date.parse(input.refreshTokenExpiresAt))
    || !BASE64URL_32_BYTE_PATTERN.test(input.profileIntegrityKey)) {
    throw new Error("ForgetBase Local credential has an unsupported or invalid shape");
  }
  return { ...input };
}

function parseCredentialBundle(serialized: string): LocalCredentialBundle {
  if (Buffer.byteLength(serialized, "utf8") > MAXIMUM_CREDENTIAL_BYTES) {
    throw new Error("ForgetBase Local credential exceeds the safety limit");
  }
  try {
    return validateCredentialBundle(JSON.parse(serialized) as LocalCredentialBundle);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ForgetBase Local credential")) throw error;
    throw new Error("ForgetBase Local credential is not valid JSON", { cause: error });
  }
}

function serializeCredentialBundle(bundle: LocalCredentialBundle): string {
  return JSON.stringify(validateCredentialBundle(bundle));
}

function validateAccount(account: string): string {
  if (!/^[a-z0-9:_-]{1,128}$/.test(account)) {
    throw new Error("ForgetBase Local credential account is invalid");
  }
  return account;
}

async function runCredentialCommand(executable: string, args: string[], input?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes <= MAXIMUM_CREDENTIAL_BYTES) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAXIMUM_CREDENTIAL_BYTES) child.kill();
    });
    child.on("error", () => reject(new Error("The operating-system credential service is unavailable")));
    child.on("close", (exitCode) => {
      if (stdoutBytes > MAXIMUM_CREDENTIAL_BYTES || stderrBytes > MAXIMUM_CREDENTIAL_BYTES) {
        reject(new Error("The operating-system credential service returned excessive output"));
        return;
      }
      resolve({ exitCode: exitCode ?? 1, stdout: Buffer.concat(stdout).toString("utf8") });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

async function runMacKeychainHelper(
  run: CredentialCommandRunner,
  request: { operation: "get" | "set" | "delete"; account: string; value?: string }
): Promise<CommandResult> {
  const nativeDirectory = join(dirname(fileURLToPath(import.meta.url)), "native");
  const compiledHelper = join(nativeDirectory, "forgetbase-keychain");
  const sourceHelper = join(nativeDirectory, "keychain.swift");
  const command = existsSync(compiledHelper)
    ? { executable: compiledHelper, args: [] }
    : { executable: "/usr/bin/swift", args: [sourceHelper] };
  return run(command.executable, command.args, JSON.stringify(request));
}
