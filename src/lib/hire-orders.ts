import type { Production, SourcingRequest } from "./types";

export interface SupplierHireOrder {
  supplier: string;
  requests: SourcingRequest[];
}

export function hireOrderDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

/** Keep each quotation on one row: a multi-unit quote is not a per-unit price. */
export function supplierHireOrders(project: Production): SupplierHireOrder[] {
  const groups = new Map<string, SourcingRequest[]>();
  for (const request of project.sourcing) {
    const rows = groups.get(request.supplier) || [];
    rows.push(request);
    groups.set(request.supplier, rows);
  }
  return [...groups]
    .map(([supplier, requests]) => ({ supplier, requests }))
    .sort((a, b) => a.supplier.localeCompare(b.supplier));
}

function csvCell(value: string) {
  // Quoting alone does not prevent spreadsheet applications executing formulas.
  const protectedValue = /^[\u0000-\u0020]*[=+@-]|^[\t\r\n]/u.test(value)
    ? `'${value}`
    : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function hireOrderCsv(project: Production, supplier: string): string {
  const order = supplierHireOrders(project).find(
    (entry) => entry.supplier === supplier,
  );
  const rows: string[][] = [
    [
      "Production",
      "Production revision",
      "Supplier",
      "Record ID",
      "Unit codes",
      "Garments",
      "From (ISO)",
      "Return by (ISO)",
      "Production time zone",
      "Status",
      "Review state",
      "Quote amount (whole record)",
      "Currency",
      "Quote valid until (ISO)",
      "Evidence class",
      "Recorded by",
      "External reference",
      "Evidence",
      "Note",
      "Record source revision",
      "Last updated (ISO)",
    ],
  ];
  for (const request of order?.requests || []) {
    const units = request.unitIds.map((id) =>
      project.units.find((unit) => unit.id === id),
    );
    rows.push([
      project.title,
      String(project.revision),
      supplier,
      request.id,
      units
        .map((unit, index) => unit?.code || request.unitIds[index])
        .join(" | "),
      units
        .map((unit) => unit?.name || "Unit no longer in working book")
        .join(" | "),
      request.from,
      request.to,
      project.timeZone,
      request.status,
      request.stale ? "Needs renewed review" : "Current record",
      (request.quoteCents / 100).toFixed(2),
      project.currency,
      request.quoteValidUntil,
      request.provenance === "synthetic" ? "Example" : "Manually recorded",
      request.operator || "",
      request.externalReference || "",
      request.evidence || "",
      request.note,
      String(request.sourceRevision),
      request.updatedAt,
    ]);
  }
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export function hireOrderFilename(supplier: string, revision: number) {
  const label =
    supplier
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 70) || "supplier";
  return `stagecraft-${label}-r${revision}.csv`;
}
