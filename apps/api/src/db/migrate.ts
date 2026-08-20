import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPool } from "./pool.js";
import { loadConfig } from "../config/env.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../../migrations");

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedRows = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(appliedRows.rows.map((row) => row.name));
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
