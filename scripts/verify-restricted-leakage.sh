#!/usr/bin/env bash
set -euo pipefail

API_URL="${FORGETBASE_API_URL:-http://127.0.0.1:3000}"

API_URL="$API_URL" node --input-type=module <<'NODE'
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const tenantId = `tenant_restricted_leakage_${unique}`;
const stableId = `policy.restricted-leakage-${unique}`;
const token = `restrictedleakage${unique.replace(/[^a-zA-Z0-9]/g, "")}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { method = "GET", apiKey, body } = {}) {
  const headers = {
    accept: "application/json"
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Request failed before receiving a response from ${apiUrl}: ${error.message}`);
  }

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request ${method} ${path} failed with ${response.status}: ${text}`);
  }

  return parsed;
}

function resultStableIds(searchResponse) {
  return (searchResponse?.results ?? []).map((result) => result.asset?.stableId).filter(Boolean);
}

const bootstrap = await request("/auth/bootstrap", {
  method: "POST",
  body: {
    tenantId,
    email: `admin-${unique}@example.test`,
    displayName: "Restricted Leakage Admin",
    keyName: "restricted-leakage-admin"
  }
});

const adminKey = bootstrap.secret;
assert(adminKey, "Bootstrap did not return an admin API key secret");

const reader = await request("/auth/users", {
  method: "POST",
  apiKey: adminKey,
  body: {
    email: `reader-${unique}@example.test`,
    displayName: "Restricted Leakage Reader",
    role: "reader"
  }
});

const readerKey = await request("/auth/api-keys", {
  method: "POST",
  apiKey: adminKey,
  body: {
    userId: reader.id,
    name: "restricted-leakage-reader",
    scopes: ["asset:read"]
  }
});

assert(readerKey.secret, "Reader API key creation did not return a secret");

await request("/assets", {
  method: "POST",
  apiKey: adminKey,
  body: {
    stableId,
    type: "policy",
    ownerId: bootstrap.user.id,
    title: "Restricted Leakage Verification Policy",
    summary: "Fixture used by restricted leakage verification.",
    lifecycleState: "active",
    sensitivity: "restricted",
    audience: ["security-team"],
    status: "approved",
    reviewDueAt: "2027-06-30",
    allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
    allowedExports: ["demo-agent-pack"],
    metadata: {
      verification: "restricted-leakage"
    },
    instruction: {
      instructionKind: "policy",
      body: `Restricted verification token ${token} must not be visible to broad readers or unauthenticated callers.`,
      constraints: [
        "Do not expose this fixture outside authorized admin checks."
      ],
      failureModes: [
        "The unique restricted token appears in an unauthorized search or export response."
      ]
    }
  }
});

const anonymousSearch = await request(`/search?tenantId=${encodeURIComponent(tenantId)}&query=${encodeURIComponent(token)}&limit=10`);
const readerSearch = await request(`/search?query=${encodeURIComponent(token)}&limit=10`, {
  apiKey: readerKey.secret
});
const adminSearch = await request(`/search?query=${encodeURIComponent(token)}&limit=10`, {
  apiKey: adminKey
});
const readerExport = await request("/exports/ai-package?package=demo-agent-pack", {
  apiKey: readerKey.secret
});
const readerOkfExport = await request("/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1", {
  apiKey: readerKey.secret
});

const anonymousStableIds = resultStableIds(anonymousSearch);
const readerStableIds = resultStableIds(readerSearch);
const adminStableIds = resultStableIds(adminSearch);
const exportStableIds = (readerExport.assets ?? []).map((asset) => asset.stableId);
const okfExportText = JSON.stringify(readerOkfExport);

assert(anonymousStableIds.length === 0, "Anonymous search returned restricted fixture results");
assert(readerStableIds.length === 0, "Ungranted reader search returned restricted fixture results");
assert(adminStableIds.includes(stableId), "Admin search did not return the restricted fixture; indexing may have failed");
assert(!exportStableIds.includes(stableId), "Reader export included the restricted fixture");
assert(readerExport.deniedCount >= 1, "Reader export did not report a denied restricted asset");
assert(readerOkfExport.format === "okf", "Reader OKF export did not return an OKF package");
assert(readerOkfExport.deniedCount >= 1, "Reader OKF export did not report a denied restricted asset");
assert(!okfExportText.includes(stableId), "Reader OKF export included the restricted fixture stable ID");
assert(!okfExportText.includes(token), "Reader OKF export included the restricted fixture token");

console.log(JSON.stringify({
  ok: true,
  apiUrl,
  tenantId,
  stableId,
  anonymousSearchResults: anonymousStableIds.length,
  readerSearchResults: readerStableIds.length,
  adminSearchIncludesFixture: adminStableIds.includes(stableId),
  readerExportAssetCount: readerExport.assetCount,
  readerExportDeniedCount: readerExport.deniedCount,
  readerOkfExportFileCount: readerOkfExport.files?.length ?? 0,
  readerOkfExportDeniedCount: readerOkfExport.deniedCount
}, null, 2));
NODE
