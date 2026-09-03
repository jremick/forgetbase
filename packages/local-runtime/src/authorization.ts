import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { LocalDeviceTokenResponse } from "@forgetbase/schema";
import { ForgetBaseClient } from "@forgetbase/sdk";
import { createLocalDevicePkcePair } from "@forgetbase/local-sync";

const CALLBACK_PATH = "/forgetbase/local/callback";
const DEFAULT_AUTHORIZATION_TIMEOUT_MILLISECONDS = 5 * 60 * 1_000;

export interface LocalBrowserAuthorizationPrompt {
  approvalUrl: string;
  expiresAt: string;
  state: string;
}

export type LocalBrowserAuthorizer = (prompt: LocalBrowserAuthorizationPrompt) => Promise<string>;

export async function authorizeLocalDevice(options: {
  client: ForgetBaseClient;
  deviceName: string;
  authorizer?: LocalBrowserAuthorizer;
  authorizationTimeoutMilliseconds?: number;
}): Promise<LocalDeviceTokenResponse> {
  const state = randomBytes(32).toString("base64url");
  const pkce = createLocalDevicePkcePair();
  const callback = await createLoopbackCallback(state, options.authorizationTimeoutMilliseconds);
  try {
    const started = await options.client.startLocalDeviceAuthorization({
      deviceName: options.deviceName,
      redirectUri: callback.redirectUri,
      state,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: "S256"
    });
    const code = options.authorizer
      ? await options.authorizer({ approvalUrl: started.approvalUrl, expiresAt: started.expiresAt, state })
      : await openBrowserAndWait(started.approvalUrl, callback.code);
    return await options.client.exchangeLocalDeviceAuthorization({ code, codeVerifier: pkce.verifier });
  } finally {
    callback.close();
  }
}

async function createLoopbackCallback(
  expectedState: string,
  timeoutMilliseconds = DEFAULT_AUTHORIZATION_TIMEOUT_MILLISECONDS
): Promise<{ redirectUri: string; code: Promise<string>; close: () => void }> {
  if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds < 1_000 || timeoutMilliseconds > 10 * 60 * 1_000) {
    throw new RangeError("Local browser authorization timeout must be between 1 and 10 minutes");
  }
  let settle: ((value: string) => void) | null = null;
  let reject: ((reason: Error) => void) | null = null;
  let settled = false;
  const code = new Promise<string>((resolve, rejectPromise) => {
    settle = resolve;
    reject = rejectPromise;
  });
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const returnedCode = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      if (request.method !== "GET" || url.pathname !== CALLBACK_PATH || returnedState !== expectedState || !returnedCode) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        response.end("ForgetBase Local authorization was rejected. Return to your terminal and try again.");
        return;
      }
      if (returnedCode.length > 8_192) {
        throw new Error("Local browser authorization code exceeds the safety limit");
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "referrer-policy": "no-referrer"
      });
      response.end("<!doctype html><html><head><meta charset=utf-8><title>ForgetBase Local connected</title>"
        + "<style>body{font:16px system-ui;max-width:36rem;margin:10vh auto;padding:2rem;color:#18211b}</style>"
        + "</head><body><h1>Device approved</h1>"
        + "<p>You can close this tab and return to your terminal.</p></body></html>");
      if (!settled) {
        settled = true;
        settle?.(returnedCode);
      }
    } catch {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      response.end("ForgetBase Local authorization was rejected.");
    }
  });
  await listenOnLoopback(server);
  const address = server.address() as AddressInfo;
  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      reject?.(new Error("Local browser authorization timed out"));
    }
    server.close();
  }, timeoutMilliseconds);
  timeout.unref();
  return {
    redirectUri: `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
    code,
    close: () => {
      clearTimeout(timeout);
      server.close();
    }
  };
}

async function listenOnLoopback(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function openBrowserAndWait(approvalUrl: string, code: Promise<string>): Promise<string> {
  const executable = process.platform === "darwin" ? "/usr/bin/open" : "xdg-open";
  const child = spawn(executable, [approvalUrl], {
    detached: true,
    shell: false,
    stdio: "ignore"
  });
  child.unref();
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", () => reject(new Error("Could not open the browser approval URL")));
  });
  return code;
}
