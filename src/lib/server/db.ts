import "server-only";
import { Pool, type PoolClient } from "pg";

const state = globalThis as unknown as { stagecraftPool?: Pool };
export const databaseConfigured = () => Boolean(process.env.DATABASE_URL);

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  if (!state.stagecraftPool) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    if (databaseUrl.searchParams.get("sslmode") === "require")
      databaseUrl.searchParams.set("sslmode", "verify-full");
    state.stagecraftPool = new Pool({
      connectionString: databaseUrl.href,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      application_name: "stagecraft",
    });
    state.stagecraftPool.on("error", () =>
      console.error("[database] connection_unavailable"),
    );
  }
  return state.stagecraftPool;
}

export async function transaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
