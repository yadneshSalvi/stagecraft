import { describe, expect, it } from "vitest";
import {
  createBlankProduction,
  createExampleProduction,
} from "@/lib/domain/fixture";
import { suggestedSourcingWindow } from "@/lib/sourcing-window";

describe("preparation-inclusive sourcing defaults", () => {
  it("starts the recurring coat's custody before its first call and covers all scoped preparation", () => {
    const production = createExampleProduction("sourcing-window");
    const looks = production.looks.filter((look) =>
      look.unitIds.includes("unit-coat-oxblood"),
    );
    const calls = production.occurrences.filter((call) =>
      looks.some((look) => look.sceneIds.includes(call.sceneId)),
    );
    const window = suggestedSourcingWindow(production, ["unit-coat-oxblood"])!;
    expect(Date.parse(window.from)).toBeLessThan(
      Math.min(...calls.map((call) => Date.parse(call.start))),
    );
    for (const call of calls) {
      const preparation = Math.max(
        ...looks
          .filter((look) => look.sceneIds.includes(call.sceneId))
          .map((look) => look.preparationMinutes || 0),
      );
      expect(Date.parse(window.from)).toBeLessThanOrEqual(
        Date.parse(call.start) - preparation * 60_000,
      );
      expect(Date.parse(window.to)).toBeGreaterThanOrEqual(
        Date.parse(call.end),
      );
    }
  });
  it("retains earlier allocated use while excluding historical assignments", () => {
    const production = createExampleProduction("sourcing-allocated");
    const baseline = suggestedSourcingWindow(production, [
      "unit-coat-oxblood",
    ])!;
    const earlier = new Date(
      Date.parse(baseline.from) - 90 * 60_000,
    ).toISOString();
    const look = production.looks.find((look) => look.id === "look-nora")!;
    production.allocations = [
      {
        id: "current",
        occurrenceId: production.occurrences[0].id,
        lookId: look.id,
        performerId: look.performerId,
        unitId: "unit-coat-oxblood",
        start: earlier,
        end: baseline.to,
        state: "allocated",
        reason: null,
        sourceRevision: 1,
      },
      {
        id: "history",
        occurrenceId: production.occurrences[0].id,
        lookId: look.id,
        performerId: look.performerId,
        unitId: "unit-coat-oxblood",
        start: "2020-01-01T00:00:00.000Z",
        end: baseline.to,
        state: "historical",
        reason: "Earlier production plan",
        sourceRevision: 1,
      },
    ];
    expect(suggestedSourcingWindow(production, ["unit-coat-oxblood"])).toEqual({
      from: earlier,
      to: baseline.to,
    });
  });
  it("does not invent a hire window for an unscheduled or unused unit", () => {
    expect(
      suggestedSourcingWindow(createBlankProduction("blank", "Untitled")),
    ).toBeNull();
    expect(
      suggestedSourcingWindow(createExampleProduction("unused"), [
        "unit-never-scheduled",
      ]),
    ).toBeNull();
  });
});
