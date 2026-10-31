import { describe, expect, it } from "vitest";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";

describe("production timezone input", () => {
  it("keeps a Kolkata call independent of the machine timezone", () => {
    expect(fromLocalDateTime("2026-11-06T09:30", "Asia/Kolkata")).toBe(
      "2026-11-06T04:00:00.000Z",
    );
    expect(toLocalDateTime("2026-11-06T04:00:00.000Z", "Asia/Kolkata")).toBe(
      "2026-11-06T09:30",
    );
  });
  it("uses seasonal offsets and rejects nonexistent spring-forward times", () => {
    expect(fromLocalDateTime("2026-07-06T09:00", "Europe/London")).toBe(
      "2026-07-06T08:00:00.000Z",
    );
    expect(fromLocalDateTime("2026-11-06T09:00", "Europe/London")).toBe(
      "2026-11-06T09:00:00.000Z",
    );
    expect(() =>
      fromLocalDateTime("2026-03-29T01:30", "Europe/London"),
    ).toThrow(/does not exist/);
  });
});
