"use client";
import type { AllocationFinding } from "@/lib/types";
import { useProduction } from "./production-context";

const labels: Record<string, string> = {
  AVAILABILITY_UNCONFIRMED: "Availability needs confirmation",
  FITTING_UNVERIFIED: "Physical fitting remains unverified",
  MEASUREMENTS_UNKNOWN: "Comparable measurements are missing",
  MEASUREMENT_SCREEN_PROVISIONAL: "Measurements are a provisional screen",
  MEASUREMENT_SCREEN_REVIEW: "Measurements need a fitting review",
  PREPARATION_ESTIMATED: "Preparation time is estimated",
  PREPARATION_UNKNOWN: "Preparation time is unknown",
  TRANSITION_ESTIMATED: "Change time is estimated",
  TRANSITION_UNKNOWN: "Change time is unknown",
  UNIT_LOCATION_UNVERIFIED: "Transport needs confirmation",
  LOCATION_TRANSFER_UNKNOWN: "Location transfer time is unknown",
  QUOTE_EXPIRED: "Quotes need checking",
  SUBSTITUTE_REVIEW: "The substitute needs appearance review",
  CREW_CAPACITY_UNKNOWN: "Crew capacity needs confirmation",
};

/** Presentation grouping only. Every original finding remains in the saved result. */
export function FindingSummary({
  findings,
}: {
  findings: AllocationFinding[];
}) {
  const { project } = useProduction();
  if (!findings.length) return null;
  const groups = new Map<string, AllocationFinding[]>();
  const messages = new Map<string, AllocationFinding[]>();
  for (const finding of findings) {
    const key = `${finding.severity}:${finding.code}`;
    groups.set(key, [...(groups.get(key) || []), finding]);
    const messageKey = `${key}:${finding.message}`;
    messages.set(messageKey, [...(messages.get(messageKey) || []), finding]);
  }
  const ordered = [...groups.entries()].sort(([, a], [, b]) => {
    const severity = { conflict: 0, unverified: 1, info: 2 };
    return severity[a[0].severity] - severity[b[0].severity];
  });
  return (
    <section
      className="findings-summary"
      aria-label="Constraint and evidence summary"
    >
      <div className="finding-groups">
        {ordered.map(([key, entries]) => {
          const units = new Set(entries.flatMap((entry) => entry.unitIds));
          const calls = new Set(
            entries.flatMap((entry) => entry.occurrenceIds),
          );
          return (
            <div
              key={key}
              className={`finding-group finding-${entries[0].severity}`}
            >
              <span className="status-dot" aria-hidden="true" />
              <div>
                <strong>{labels[entries[0].code] || entries[0].message}</strong>
                <span>
                  {units.size
                    ? `${units.size} unit${units.size === 1 ? "" : "s"}`
                    : "Production evidence"}
                  {calls.size
                    ? ` · ${calls.size} call${calls.size === 1 ? "" : "s"}`
                    : ""}
                  {entries[0].severity === "conflict"
                    ? " · blocks adoption"
                    : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <details className="finding-details">
        <summary>
          Read {messages.size} distinct evidence notes across {findings.length}{" "}
          checks
        </summary>
        <ul tabIndex={0} aria-label="Detailed constraint and evidence notes">
          {[...messages.entries()].map(([key, entries]) => {
            const occurrenceIds = [
              ...new Set(entries.flatMap((entry) => entry.occurrenceIds)),
            ];
            const calls = occurrenceIds
              .map(
                (id) =>
                  project.occurrences.find((call) => call.id === id)?.label,
              )
              .filter(Boolean);
            return (
              <li
                key={key}
                className={
                  entries[0].severity === "conflict" ? "text-danger" : ""
                }
              >
                <p>{entries[0].message}</p>
                {calls.length > 0 && <small>{calls.join(" · ")}</small>}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
