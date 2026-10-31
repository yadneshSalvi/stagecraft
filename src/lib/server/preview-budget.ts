import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getCreditBalance, youcamConfigured } from "@/lib/youcam";
import { transaction } from "./db";
import { generationPaused, takeProviderRequest } from "./limits";
import { ApiError } from "./errors";

const RESTING_MESSAGE =
  "Fresh previews are resting; recorded results and your saved production remain available.";
export interface FreshPreviewAvailability {
  available: boolean;
  reason:
    "ready" | "paused" | "budget_floor" | "budget_unavailable" | "unconfigured";
  message: string;
}
interface PreviewBudget extends FreshPreviewAvailability {
  remaining: number;
}
export function configuredBalanceFloor() {
  const raw = process.env.YOUCAM_BALANCE_FLOOR;
  if (raw === undefined || raw.trim() === "") return 200;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0
    ? Math.min(value, 1_000_000_000)
    : 200;
}
export function previewUnitsAboveFloor(
  balance: number,
  floor = configuredBalanceFloor(),
  reserved = 0,
) {
  return Number.isFinite(balance) && balance >= 0
    ? Math.floor(balance - floor - Math.max(0, reserved))
    : -1;
}
function disabled(): PreviewBudget | undefined {
  if (generationPaused())
    return {
      available: false,
      remaining: -1,
      reason: "paused",
      message: RESTING_MESSAGE,
    };
  if (!youcamConfigured())
    return {
      available: false,
      remaining: -1,
      reason: "unconfigured",
      message:
        "Fresh previews are not configured. Recorded results and saved work remain available.",
    };
}
const unavailable = (): PreviewBudget => ({
  available: false,
  remaining: -1,
  reason: "budget_unavailable",
  message: RESTING_MESSAGE,
});

/** Account hashes and numeric balances stay server-side. */
export async function readPreviewBudget(
  client: PoolClient,
): Promise<PreviewBudget> {
  const off = disabled();
  if (off) return off;
  const key = createHash("sha256")
    .update(`${process.env.YOUCAM_API_BASE_URL}\0${process.env.YOUCAM_API_KEY}`)
    .digest("hex");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `youcam-credit:${key}`,
  ]);
  const cached = await client.query<{
    balance: number | null;
    checked_at: Date;
  }>(
    "SELECT balance,checked_at FROM sc_provider_credit_balances WHERE account_key=$1",
    [key],
  );
  let snapshot = cached.rows[0];
  if (
    !snapshot ||
    Date.now() - new Date(snapshot.checked_at).getTime() >=
      (snapshot.balance == null ? 30_000 : 300_000)
  ) {
    const checkedAt = new Date();
    let balance: number | null = null;
    try {
      if (await takeProviderRequest(client))
        balance = await getCreditBalance({ timeoutMs: 5_000 });
    } catch {
      balance = null;
    }
    await client.query(
      "INSERT INTO sc_provider_credit_balances(account_key,balance,checked_at) VALUES($1,$2,$3) ON CONFLICT(account_key) DO UPDATE SET balance=EXCLUDED.balance,checked_at=EXCLUDED.checked_at",
      [key, balance, checkedAt],
    );
    snapshot = { balance, checked_at: checkedAt };
  }
  if (snapshot.balance == null) return unavailable();
  // Missing/deleted jobs conservatively retain floor headroom protection.
  const held = await client.query<{ units: string }>(
    "SELECT COALESCE(sum(q.estimated_units),0) AS units FROM sc_quota_reservations q LEFT JOIN sc_jobs j ON j.id=q.id WHERE NOT q.released AND (q.created_at>=$1 OR j.submission_started_at>=$1 OR j.id IS NULL OR j.state IN ('queued','preparing','submitting','polling','storing','ambiguous'))",
    [snapshot.checked_at],
  );
  const remaining = previewUnitsAboveFloor(
    snapshot.balance,
    configuredBalanceFloor(),
    Number(held.rows[0]?.units || 0),
  );
  return {
    available: remaining > 0,
    remaining,
    reason: remaining > 0 ? "ready" : "budget_floor",
    message: remaining > 0 ? "Fresh previews are available." : RESTING_MESSAGE,
  };
}
export async function freshPreviewAvailability(): Promise<FreshPreviewAvailability> {
  let budget: PreviewBudget;
  try {
    budget = disabled() || (await transaction(readPreviewBudget));
  } catch {
    budget = unavailable();
  }
  return {
    available: budget.available,
    reason: budget.reason,
    message: budget.message,
  };
}
export async function requireFreshPreviewBudget(estimatedUnits: number) {
  let budget: PreviewBudget;
  try {
    budget = await transaction(readPreviewBudget);
  } catch {
    budget = unavailable();
  }
  if (!budget.available || budget.remaining < estimatedUnits)
    throw new ApiError(
      503,
      "LIVE_PREVIEWS_RESTING",
      budget.reason === "ready" ? RESTING_MESSAGE : budget.message,
      true,
    );
}
