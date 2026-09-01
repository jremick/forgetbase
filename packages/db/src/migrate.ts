import { createPool, planMigrations, runMigrations } from "./index.js";

const pool = createPool();
const expectedPendingIds = process.env.FORGETBASE_EXPECTED_MIGRATION_IDS
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

try {
  const result = process.argv.includes("--plan")
    ? await planMigrations(pool, undefined, expectedPendingIds)
    : await runMigrations(pool, undefined, {
      releaseVersion: process.env.FORGETBASE_RELEASE_VERSION,
      expectedPendingIds
    });
  console.log(JSON.stringify(result, null, 2));
  if ("checksumMismatches" in result && (result.checksumMismatches.length > 0 || !result.expectedPendingMatches)) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
