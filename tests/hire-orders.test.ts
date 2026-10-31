import { describe, expect, it } from "vitest";
import { createBlankProduction } from "@/lib/domain/fixture";
import {
  hireOrderCsv,
  hireOrderDate,
  hireOrderFilename,
  supplierHireOrders,
} from "@/lib/hire-orders";
import type { SourcingRequest } from "@/lib/types";

function fixture() {
  const project = createBlankProduction("test-orders", "The last light");
  const record: SourcingRequest = {
    id: "order-1",
    unitIds: ["unit-a", "unit-b"],
    supplier: "Wardrobe North",
    from: "2026-11-01T08:00:00Z",
    to: "2026-11-03T18:00:00Z",
    status: "draft",
    sourceRevision: 2,
    quoteCents: 12345,
    quoteValidUntil: "2026-11-01T00:00:00Z",
    provenance: "synthetic",
    operator: null,
    evidence: null,
    externalReference: null,
    updatedAt: "2026-10-31T12:00:00Z",
    stale: false,
    note: "Two garments, one quote.",
  };
  project.sourcing = [record];
  return { project, record };
}

describe("supplier hire-order exports", () => {
  it("groups exact suppliers without changing status or duplicating a multi-unit quote", () => {
    const { project, record } = fixture();
    project.sourcing.push({
      ...record,
      id: "order-2",
      supplier: "Wardrobe South",
      status: "confirmed",
      provenance: "manual",
    });
    const before = JSON.stringify(project);
    expect(supplierHireOrders(project).map((entry) => entry.supplier)).toEqual([
      "Wardrobe North",
      "Wardrobe South",
    ]);
    const csv = hireOrderCsv(project, "Wardrobe North");
    expect(csv.match(/123\.45/g)).toHaveLength(1);
    expect(csv).toContain('"unit-a | unit-b"');
    expect(csv).not.toContain("order-2");
    expect(csv).toContain('"draft","Current record"');
    expect(JSON.stringify(project)).toBe(before);
  });
  it("preserves stale, cancelled, provenance, reference and original date evidence", () => {
    const { project, record } = fixture();
    Object.assign(record, {
      stale: true,
      status: "cancelled",
      externalReference: 'Quote "A", 12',
      note: "First line\nSecond line",
    });
    const csv = hireOrderCsv(project, record.supplier);
    expect(csv).toContain('"cancelled","Needs renewed review"');
    expect(csv).toContain('"Synthetic sample"');
    expect(csv).toContain('"Quote ""A"", 12"');
    expect(csv).toContain('"First line\nSecond line"');
    expect(csv).toContain(record.from);
    expect(csv).toContain(project.timeZone);
  });
  it("neutralizes spreadsheet formula prefixes, including whitespace and tab prefixes", () => {
    for (const value of [
      '=HYPERLINK("https://example.test")',
      "+1+1",
      "-1+1",
      "@SUM(1)",
      "  =1+1",
      "\t=1+1",
      "\n=1+1",
    ]) {
      const { project, record } = fixture();
      record.note = value;
      expect(hireOrderCsv(project, record.supplier)).toContain(
        `"'${value.replaceAll('"', '""')}"`,
      );
    }
  });
  it("creates bounded filesystem-safe names and returns a header for unknown suppliers", () => {
    const { project } = fixture();
    expect(hireOrderFilename("../../Wardrobe / A", 4)).toBe(
      "stagecraft-wardrobe-a-r4.csv",
    );
    expect(hireOrderFilename("???", 1)).toBe("stagecraft-supplier-r1.csv");
    expect(hireOrderCsv(project, "Unknown").trim().split("\r\n")).toHaveLength(
      1,
    );
    expect(hireOrderDate("2026-11-01T23:30:00Z", "Asia/Kolkata")).toBe(
      "2 Nov 2026, 05:00",
    );
  });
});
