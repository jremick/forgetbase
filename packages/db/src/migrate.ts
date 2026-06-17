import { createPool, runMigrations } from "./index.js";

const pool = createPool();

try {
  const result = await runMigrations(pool);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
