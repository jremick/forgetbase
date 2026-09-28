import { createPool, planMigrations, runMigrations } from "./index.js";

const pool = createPool();
const expectedPendingIds = process.env.FORGETBASE_EXPECTED_MIGRATION_IDS
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const expectedSchemaVersion = process.env.FORGETBASE_EXPECTED_SCHEMA_VERSION;
const signedCandidate = expectedPendingIds !== undefined || expectedSchemaVersion !== undefined;
const allowAlreadyAppliedExpectedIds = process.env.FORGETBASE_ALLOW_APPLIED_EXPECTED_MIGRATIONS === "true";

try {
  const result = process.argv.includes("--plan")
    ? await planMigrations(pool, undefined, expectedPendingIds, expectedSchemaVersion, allowAlreadyAppliedExpectedIds)
    : await runMigrations(pool, undefined, {
      releaseVersion: process.env.FORGETBASE_RELEASE_VERSION,
      expectedPendingIds,
      expectedSchemaVersion,
      allowAlreadyAppliedExpectedIds
    });
  console.log(JSON.stringify(result, null, 2));
  if ("checksumMismatches" in result && (
    result.checksumMismatches.length > 0
    || !result.expectedPendingMatches
    || !result.expectedSchemaVersionMatches
    || (signedCandidate && result.missingAppliedIds.length > 0)
  )) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
