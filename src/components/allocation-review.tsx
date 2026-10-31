"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { AllocationResult } from "@/lib/types";
import { money, revision, time } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button } from "./ui";
import { FindingSummary } from "./finding-summary";
import { AllocationChoices } from "./allocation-choices";

export function AllocationReview({
  result,
  focusRequest = 0,
}: {
  result: AllocationResult;
  focusRequest?: number;
}) {
  const { project, send, busy } = useProduction();
  const ref = useRef<HTMLElement>(null);
  const [localFocus, setLocalFocus] = useState(0);
  useEffect(() => {
    if (!focusRequest && !localFocus) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, localFocus]);
  const canAdopt =
    (result.constraintChecked || result.independentlyChecked) &&
    ["FEASIBLE", "OPTIMAL"].includes(result.status) &&
    result.sourceRevision === project.revision;
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className="allocation-result"
      aria-live="polite"
      aria-label="Allocation result"
    >
      <header>
        <div>
          <p className="eyebrow">
            ALLOCATION PROPOSAL / {revision(result.sourceRevision)}
          </p>
          <h2>
            {result.status === "INFEASIBLE"
              ? "These commitments conflict."
              : result.status === "INVALID_INPUT"
                ? "The schedule needs a correction."
                : result.status === "UNKNOWN" || result.status === "TIME_LIMIT"
                  ? "The search has not established feasibility."
                  : "The physical assignments can work."}
          </h2>
        </div>
        <Badge
          tone={
            result.status === "INFEASIBLE" || result.status === "INVALID_INPUT"
              ? "danger"
              : result.constraintChecked || result.independentlyChecked
                ? "success"
                : "warning"
          }
        >
          {result.status.replaceAll("_", " ")}
        </Badge>
      </header>
      <div className="allocation-result-meta">
        <span>{result.assignments.length} proposed assignments</span>
        <span>
          {money(result.totalCostCents, project.currency)} /{" "}
          {money(project.budgetCents, project.currency)} budget
        </span>
        <span>
          {result.constraintChecked || result.independentlyChecked
            ? "Constraint check passed"
            : "Constraint check incomplete"}
        </span>
      </div>
      <AllocationChoices project={project} result={result} />
      <FindingSummary findings={result.findings} />
      {result.assignments.length > 0 && (
        <details className="assignment-details">
          <summary>Inspect every proposed unit assignment</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Scene / call</th>
                  <th>Performer</th>
                  <th>Physical unit</th>
                  <th>Use window</th>
                </tr>
              </thead>
              <tbody>
                {result.assignments.map((assignment) => {
                  const occurrence = project.occurrences.find(
                    (o) => o.id === assignment.occurrenceId,
                  );
                  return (
                    <tr key={assignment.id}>
                      <td>
                        SC{" "}
                        {
                          project.scenes.find(
                            (s) => s.id === occurrence?.sceneId,
                          )?.number
                        }
                      </td>
                      <td>
                        {
                          project.performers.find(
                            (p) => p.id === assignment.performerId,
                          )?.name
                        }
                      </td>
                      <td>
                        {
                          project.units.find((u) => u.id === assignment.unitId)
                            ?.code
                        }
                      </td>
                      <td>
                        {time(assignment.start, project.timeZone)}–
                        {time(assignment.end, project.timeZone)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <div className="allocation-adopt">
        <p>
          {result.policy}
          <br />
          <span className="mono">{result.solver}</span>
        </p>
        {result.sourceRevision !== project.revision ? (
          <Button
            onClick={async () => {
              if (await send({ type: "solve_allocation" }))
                setLocalFocus((value) => value + 1);
            }}
            busy={busy}
          >
            Recompute against current revision
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!canAdopt}
            busy={busy}
            onClick={() =>
              void send({
                type: "adopt_allocation",
                inputHash: result.inputHash,
              })
            }
          >
            Adopt these assignments
            <Check size={16} />
          </Button>
        )}
      </div>
    </section>
  );
}
