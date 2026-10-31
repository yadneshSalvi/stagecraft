import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required. No environment values were printed.",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(7140322)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS stagecraft_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("migrations"))
    .filter((file) => /^\d+_[a-z_]+\.sql$/.test(file))
    .sort()) {
    if (
      (
        await client.query(
          "SELECT name FROM stagecraft_migrations WHERE name=$1",
          [name],
        )
      ).rowCount
    )
      continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(join("migrations", name), "utf8"));
      await client.query("INSERT INTO stagecraft_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch {
      await client.query("ROLLBACK");
      throw new Error(
        `Migration ${name} failed. Database details are not logged.`,
      );
    }
  }
  console.log("STAGECRAFT database is ready.");
} finally {
  await client.query("SELECT pg_advisory_unlock(7140322)").catch(() => {});
  client.release();
  await pool.end();
}
