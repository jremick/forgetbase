import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPool, PostgresAuthRepository, runMigrations } from "../packages/db/src/index.js";
import { buildServer } from "../apps/api/src/server.js";

// Use only a disposable synthetic database. Credentials are never written to the report.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must identify a disposable PostgreSQL database.");
const output = resolve(process.env.BRANDING_PROOF_DIR ?? "work/branding-proof");
await mkdir(output, { recursive: true });
const pool = createPool(databaseUrl);
const tenant = `branding-proof-${Date.now()}`;
const otherTenant = `${tenant}-other`;
const auth = new PostgresAuthRepository(pool);
const checks: string[] = [];
let server = buildServer({ databaseUrl, logger: false, requireAuthentication: true });
let base = "";
const defaults = { displayName: "ForgetBase", logoDataUrl: null };
async function call(path: string, method = "GET", body?: unknown, secret?: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method, headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...headers
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function expectStatus(response: Response, status: number) {
  assert.equal(response.status, status, `HTTP status for ${new URL(response.url).pathname}`);
  return response.json();
}
try {
  await runMigrations(pool);
  const admin = await auth.bootstrapAdmin({ tenantId: tenant, email: "admin@example.test", displayName: "Admin", password: "synthetic-password-123", keyName: "branding-proof" });
  const other = await auth.bootstrapAdmin({ tenantId: otherTenant, email: "admin@example.test", displayName: "Admin", password: "synthetic-password-123", keyName: "branding-proof" });
  assert(admin && other);
  base = await server.listen({ port: 0, host: "127.0.0.1" });
  const publicPath = `/branding?tenantId=${encodeURIComponent(tenant)}`;
  assert.deepEqual(await expectStatus(await call(publicPath), 200), defaults);
  await expectStatus(await call("/admin/branding", "PUT", defaults), 401);
  await expectStatus(await call("/admin/branding"), 401);
  checks.push("Public defaults work with authentication required; anonymous writes and admin reads are denied");

  for (const role of ["reader", "maintainer"] as const) {
    await expectStatus(await call("/auth/users", "POST", { email: `${role}@example.test`, displayName: role, role, password: "synthetic-password-123" }, admin.secret), 201);
    const login = await expectStatus(await call("/auth/login", "POST", { tenantId: tenant, email: `${role}@example.test`, password: "synthetic-password-123" }), 201);
    await expectStatus(await call("/admin/branding", "PUT", defaults, login.secret), 403);
    await expectStatus(await call("/admin/branding", "GET", undefined, login.secret), 403);
  }
  checks.push("Reader and maintainer cannot read admin settings or write branding");
  const loginResponse = await call("/auth/login", "POST", { tenantId: tenant, email: "admin@example.test", password: "synthetic-password-123" });
  assert.equal(loginResponse.status, 201);
  const cookie = loginResponse.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  await expectStatus(await call("/admin/branding", "PUT", defaults, undefined, { cookie }), 403);
  checks.push("Cookie-based updates require CSRF protection");

  let saved = defaults as { displayName: string; logoDataUrl: string | null };
  for (const [extension, media] of [["png", "png"], ["jpg", "jpeg"], ["webp", "webp"]]) {
    const content = await readFile(new URL(`./fixtures/branding/logo.${extension}`, import.meta.url));
    saved = { displayName: "Field Notes & Research", logoDataUrl: `data:image/${media};base64,${content.toString("base64")}` };
    assert.deepEqual(await expectStatus(await call("/admin/branding", "PUT", saved, admin.secret), 200), saved);
    assert.deepEqual(await expectStatus(await call(publicPath), 200), saved);
  }
  checks.push("PNG, JPEG and WebP save through HTTP and are publicly readable without admin metadata");
  assert.deepEqual(await expectStatus(await call("/admin/branding", "GET", undefined, other.secret), 200), defaults);
  await expectStatus(await call("/admin/branding", "PUT", { ...saved, tenantId: otherTenant }, admin.secret), 400);
  checks.push("Admin writes are bound to the authenticated tenant; supplied tenant IDs are rejected");

  const png = await readFile(new URL("./fixtures/branding/logo.png", import.meta.url));
  for (const [extension, media] of [["png", "png"], ["jpg", "jpeg"], ["webp", "webp"]]) {
    const tooWide = await readFile(new URL(`./fixtures/branding/too-wide.${extension}`, import.meta.url));
    await expectStatus(await call("/admin/branding", "PUT", { ...saved, logoDataUrl: `data:image/${media};base64,${tooWide.toString("base64")}` }, admin.secret), 400);
    assert.deepEqual(await expectStatus(await call(publicPath), 200), saved);
  }
  checks.push("Valid images wider than 2048 pixels are rejected for all three supported formats");
  const invalid = [
    { ...saved, displayName: " " }, { ...saved, displayName: "x".repeat(65) },
    { ...saved, logoDataUrl: "https://example.test/logo.png" },
    { ...saved, logoDataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString("base64")}` },
    { ...saved, logoDataUrl: `data:image/png;base64,${Buffer.from("<html>not an image</html>").toString("base64")}` },
    { ...saved, logoDataUrl: `data:image/jpeg;base64,${png.toString("base64")}` },
    { ...saved, logoDataUrl: `data:image/png;base64,${png.subarray(0, 28).toString("base64")}` },
    { ...saved, logoDataUrl: `data:image/png;base64,${Buffer.alloc(256 * 1024 + 1).toString("base64")}` }
  ];
  for (const body of invalid) {
    await expectStatus(await call("/admin/branding", "PUT", body, admin.secret), 400);
    assert.deepEqual(await expectStatus(await call(publicPath), 200), saved);
  }
  await expectStatus(await call("/admin/branding", "PUT", { ...saved, logoDataUrl: "x".repeat(400_000) }, admin.secret), 413);
  checks.push("Invalid text, remote URLs, SVG, mismatched or truncated files, and oversized requests fail without changing saved settings");

  const events = await auth.listAuditEvents({ tenantId: tenant });
  const updates = events.filter(event => event.action === "admin.branding.update");
  assert.equal(updates.length, 3);
  assert(updates.every(event => event.actorUserId === admin.user.id && !JSON.stringify(event).includes("base64")));
  // A failing audit insert must roll back the branding change in the same transaction.
  await pool.query(`CREATE FUNCTION branding_proof_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'admin.branding.update' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query("CREATE TRIGGER branding_proof_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION branding_proof_reject_audit()");
  try {
    await expectStatus(await call("/admin/branding", "PUT", defaults, admin.secret), 500);
    assert.deepEqual(await expectStatus(await call(publicPath), 200), saved);
  } finally {
    await pool.query("DROP TRIGGER branding_proof_audit ON audit_events");
    await pool.query("DROP FUNCTION branding_proof_reject_audit()");
  }
  checks.push("Successful changes are audited without image bytes; an audit failure rolls back the save");
  await server.close();
  server = buildServer({ databaseUrl, logger: false, requireAuthentication: true });
  base = await server.listen({ port: 0, host: "127.0.0.1" });
  assert.deepEqual(await expectStatus(await call(publicPath), 200), saved);
  assert.equal((await runMigrations(pool)).applied.length, 0);
  checks.push("Branding survives API/repository reconstruction; migrations are repeatable");
  assert.deepEqual(await expectStatus(await call("/admin/branding", "PUT", defaults, admin.secret), 200), defaults);
  assert.deepEqual(await expectStatus(await call(publicPath), 200), defaults);
  checks.push("Restore defaults persists and clears the custom image");
  await writeFile(resolve(output, "api-report.json"), JSON.stringify({ status: "passed", checks }, null, 2));
  console.log(`Branding HTTP/PostgreSQL proof passed: ${checks.length} checks. Report: ${output}/api-report.json`);
} catch (error) {
  await writeFile(resolve(output, "api-report.json"), JSON.stringify({ status: "failed", checks, error: error instanceof Error ? error.message : String(error) }, null, 2));
  throw error;
} finally {
  await server.close();
  await pool.query("DELETE FROM tenants WHERE id = ANY($1::text[])", [[tenant, otherTenant]]);
  await pool.end();
}
