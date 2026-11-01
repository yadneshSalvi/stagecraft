"use client";
import type { AllocationFinding } from "@/lib/types";
import { useProduction } from "./production-context";

const labels: Record<string, string> = {
  AVAILABILITY_UNCONFIRMED: "Availability unconfirmed",
  FITTING_UNVERIFIED: "Fitting unverified",
  MEASUREMENTS_UNKNOWN: "Measurements missing",
  MEASUREMENT_SCREEN_PROVISIONAL: "Measurements provisional",
  MEASUREMENT_SCREEN_REVIEW: "Measurements to review",
  PREPARATION_ESTIMATED: "Prep time estimated",
  PREPARATION_UNKNOWN: "Prep time unknown",
  TRANSITION_ESTIMATED: "Change time estimated",
  TRANSITION_UNKNOWN: "Change time unknown",
  UNIT_LOCATION_UNVERIFIED: "Transport unconfirmed",
  LOCATION_TRANSFER_UNKNOWN: "Transfer time unknown",
  QUOTE_EXPIRED: "Quotes expired",
  SUBSTITUTE_REVIEW: "Substitute needs approval",
  CREW_CAPACITY_UNKNOWN: "Crew capacity unknown",
  APPEARANCE_APPROVAL_REQUIRED: "Look approval missing",
  UNIT_UNAVAILABLE: "Unit unavailable",
  UNIT_OVERLAP: "Unit overlap",
  HARD_BUDGET: "Over budget",
};

/** Presentation grouping only. Every original finding remains in the saved result. */
export function FindingSummary({
  findings,
  hiddenGroupCodes = [],
}: {
  findings: AllocationFinding[];
  hiddenGroupCodes?: string[];
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
        {ordered
          .filter(([, entries]) => !hiddenGroupCodes.includes(entries[0].code))
          .map(([key, entries]) => {
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
                  <strong>
                    {labels[entries[0].code] || entries[0].message}
                  </strong>
                  <span>
                    {[
                      units.size &&
                        `${units.size} unit${units.size === 1 ? "" : "s"}`,
                      calls.size &&
                        `${calls.size} call${calls.size === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
      <details className="finding-details">
        <summary>Details ({messages.size})</summary>
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
