import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
const mocks = vi.hoisted(() => ({ query: vi.fn(), credit: vi.fn() }));
vi.mock("@/lib/youcam", () => ({
  getCreditBalance: mocks.credit,
  youcamConfigured: () => true,
}));
vi.mock("@/lib/server/db", () => ({
  transaction: (operation: (client: unknown) => unknown) =>
    operation({ query: mocks.query }),
}));
vi.mock("@/lib/server/limits", () => ({
  generationPaused: () => process.env.GENERATION_PAUSED === "true",
  takeProviderRequest: async () => true,
}));
import {
  configuredBalanceFloor,
  previewUnitsAboveFloor,
  readPreviewBudget,
  freshPreviewAvailability,
  requireFreshPreviewBudget,
} from "@/lib/server/preview-budget";
let cached: { balance: number | null; checked_at: Date } | undefined;
let held: number;
const client = { query: mocks.query } as unknown as PoolClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  vi.stubEnv("GENERATION_PAUSED", "false");
  vi.stubEnv("YOUCAM_API_KEY", "test-key");
  vi.stubEnv("YOUCAM_API_BASE_URL", "https://api.example.test");
  vi.stubEnv("YOUCAM_BALANCE_FLOOR", "200");
  cached = undefined;
  held = 0;
  mocks.credit.mockResolvedValue(250);
  mocks.query.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT balance"))
      return { rows: cached ? [cached] : [] };
    if (sql.startsWith("INSERT INTO sc_provider_credit_balances"))
      cached = {
        balance: args[1] as number | null,
        checked_at: args[2] as Date,
      };
    if (sql.includes("sum(q.estimated_units)"))
      return { rows: [{ units: String(held) }] };
    return { rows: [] };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("shared balance floor", () => {
  it("protects the default floor and requires two units for a garment", async () => {
    expect(configuredBalanceFloor()).toBe(200);
    expect(previewUnitsAboveFloor(203, 200, 2)).toBe(1);
    expect(previewUnitsAboveFloor(Number.NaN)).toBe(-1);
    mocks.credit.mockResolvedValue(201);
    await expect(requireFreshPreviewBudget(2)).rejects.toMatchObject({
      code: "LIVE_PREVIEWS_RESTING",
    });
    await expect(requireFreshPreviewBudget(1)).resolves.toBeUndefined();
    vi.stubEnv("YOUCAM_BALANCE_FLOOR", "invalid");
    expect(configuredBalanceFloor()).toBe(200);
  });
  it("caches five minutes across requests and deducts outstanding units", async () => {
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      remaining: 50,
    });
    held = 2;
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      remaining: 48,
    });
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300001);
    mocks.credit.mockResolvedValue(199);
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: false,
      reason: "budget_floor",
    });
    expect(mocks.credit).toHaveBeenCalledTimes(2);
  });
  it("fails closed and caches unavailable balance reads briefly", async () => {
    mocks.credit.mockRejectedValue(new Error("unreadable"));
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: false,
      reason: "budget_unavailable",
    });
    await readPreviewBudget(client);
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30001);
    mocks.credit.mockResolvedValue(250);
    await expect(readPreviewBudget(client)).resolves.toMatchObject({
      available: true,
    });
  });
  it("exposes only safe resting state and never reads balance when paused", async () => {
    mocks.credit.mockResolvedValue(200);
    const status = await freshPreviewAvailability();
    expect(status).toMatchObject({ available: false, reason: "budget_floor" });
    expect(Object.keys(status).sort()).toEqual([
      "available",
      "message",
      "reason",
    ]);
    vi.stubEnv("GENERATION_PAUSED", "true");
    await expect(freshPreviewAvailability()).resolves.toMatchObject({
      available: false,
      reason: "paused",
    });
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });
});
