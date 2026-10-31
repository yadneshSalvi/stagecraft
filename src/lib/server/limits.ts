import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, transaction } from "./db";
import { ApiError } from "./errors";

export function boundedEnv(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0
    ? Math.min(value, maximum)
    : fallback;
}
export const generationPaused = () => process.env.GENERATION_PAUSED === "true";
export const dailyJobLimit = () => boundedEnv("YOUCAM_DAILY_JOB_LIMIT", 8, 100);
export const ownerDailyJobLimit = () =>
  boundedEnv("YOUCAM_OWNER_DAILY_JOB_LIMIT", 4, 10);

export async function rateLimit(
  key: string,
  maximum: number,
  seconds = 300,
  client?: PoolClient,
) {
  const digest = createHash("sha256").update(key).digest("hex");
  const result = await (client || getPool()).query<{ count: number }>(
    `INSERT INTO sc_rate_windows(key,window_start,count) VALUES($1,to_timestamp(floor(extract(epoch from now())/$2)*$2),1)
     ON CONFLICT(key,window_start) DO UPDATE SET count=sc_rate_windows.count+1 RETURNING count`,
    [digest, seconds],
  );
  if (result.rows[0].count > maximum)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Please wait a moment before trying again.",
      true,
    );
}

/** A sliding 5-minute application cap; this account is also used by STEADY. */
export async function takeProviderRequest(
  existingClient?: PoolClient,
): Promise<boolean> {
  const take = async (client: PoolClient) => {
    await client.query("SELECT pg_advisory_xact_lock(7140321)");
    await client.query(
      "DELETE FROM sc_provider_requests WHERE created_at<now()-interval '5 minutes'",
    );
    const count = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM sc_provider_requests",
    );
    if (
      Number(count.rows[0].n) >=
      boundedEnv("YOUCAM_REQUEST_LIMIT_PER_5_MIN", 40, 100)
    )
      return false;
    await client.query("INSERT INTO sc_provider_requests DEFAULT VALUES");
    return true;
  };
  return existingClient ? take(existingClient) : transaction(take);
}
