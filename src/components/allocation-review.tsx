"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import type { AllocationResult, Production } from "@/lib/types";
import {
  getAllocationDecisionSummary,
  getAllocationStatus,
} from "@/lib/domain/allocation-context";
import { getAllocationAdoptionReview } from "@/lib/domain/allocation-review";
import { money, time } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Notice } from "./ui";
import { FindingSummary } from "./finding-summary";
import { AllocationChoices } from "./allocation-choices";
import { ExampleDecisions } from "./example-decisions";
import { DirectionRepair, DirectionAcknowledgement } from "./direction-repair";

export function AllocationReview({
  result,
  focusRequest = 0,
  onDecisionsRecorded,
}: {
  result: AllocationResult;
  focusRequest?: number;
  onDecisionsRecorded?: (project: Production) => void;
}) {
  const { project, send, busy } = useProduction();
  const ref = useRef<HTMLElement>(null);
  const [localFocus, setLocalFocus] = useState(0);
  const [confirmedReview, setConfirmedReview] = useState<string | null>(null);
  const status = getAllocationStatus(project, result);
  const isCurrent = result.sourceRevision === project.revision;
  const currentDecisions = getAllocationDecisionSummary(project);
  const decisions = isCurrent
    ? getAllocationDecisionSummary(project, result)
    : currentDecisions;
  const review = getAllocationAdoptionReview(project, result);
  const confirmed = confirmedReview === review.reviewHash;
  const decisionsNeeded = status === "DECISIONS_NEEDED";
  const adopted = !!result.adoptedAt;
  const canAdopt =
    !adopted &&
    (result.constraintChecked || result.independentlyChecked) &&
    ["FEASIBLE", "OPTIMAL"].includes(status) &&
    isCurrent &&
    (!review.confirmationRequired || confirmed);
  const firstMissing = currentDecisions.missingLookIds[0];
  const reviewHref = `/production/${project.id}/looks${firstMissing ? `?look=${encodeURIComponent(firstMissing)}` : ""}`;
  const unitNames = (ids: string[]) =>
    ids
      .map((id) => {
        const unit = project.units.find((item) => item.id === id);
        return unit ? `${unit.code} ${unit.name}` : id;
      })
      .join(" + ");
  useEffect(() => {
    if (!focusRequest && !localFocus) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
      const top = ref.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 80 || top > window.innerHeight - 80)) {
        ref.current?.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, localFocus]);
  async function saveDirection(
    characterId: string,
    text: string,
    essential: string[],
    palette: string[],
  ) {
    return !!(await send({
      type: "edit_direction",
      characterId,
      text,
      essential,
      palette,
    }));
  }
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={`allocation-result${decisionsNeeded ? " allocation-decisions-needed" : ""}`}
      aria-live="polite"
      aria-label="Allocation result"
    >
      <header className="allocation-status-row">
        <span
          role="status"
          aria-label={`Allocation status: ${adopted ? "ADOPTED" : status}`}
        >
          <Badge
            tone={
              status === "INFEASIBLE" || status === "INVALID_INPUT"
                ? "danger"
                : decisionsNeeded
                  ? "warning"
                  : result.constraintChecked || result.independentlyChecked
                    ? "success"
                    : "warning"
            }
          >
            {adopted
              ? "Adopted"
              : decisionsNeeded
                ? decisions.missingLookIds.length
                  ? "Decisions needed"
                  : "Recheck needed"
                : status === "INFEASIBLE"
                  ? "Conflicts found"
                  : status === "INVALID_INPUT"
                    ? "Schedule needs fixing"
                    : status === "UNKNOWN" || status === "TIME_LIMIT"
                      ? "Not proven feasible"
                      : status === "OPTIMAL"
                        ? "Optimal"
                        : "Feasible"}
          </Badge>
        </span>
        {!decisionsNeeded && (
          <div className="allocation-result-meta">
            <span>{result.assignments.length} assignments</span>
            <span>
              {money(result.totalCostCents, project.currency)} of{" "}
              {money(project.budgetCents, project.currency)}
            </span>
            <span
              className={
                result.constraintChecked || result.independentlyChecked
                  ? "text-success"
                  : ""
              }
            >
              {result.constraintChecked || result.independentlyChecked ? (
                <>
                  <Check size={14} aria-hidden="true" /> Checked
                </>
              ) : (
                "Check incomplete"
              )}
            </span>
          </div>
        )}
      </header>
      {decisionsNeeded && decisions.missingLookIds.length > 0 && (
        <p className="allocation-decision-prompt">
          <strong>
            {decisions.missingLookIds.length} of {decisions.looksTotal} looks
          </strong>{" "}
          need approval.
        </p>
      )}
      {currentDecisions.missingLookIds.length > 0 && (
        <div className="allocation-decision-actions">
          <Link className="button button-primary" href={reviewHref}>
            Review looks <ArrowRight size={15} />
          </Link>
          <ExampleDecisions compact onRecorded={onDecisionsRecorded} />
        </div>
      )}
      <AllocationChoices project={project} result={result} />
      <FindingSummary
        hiddenGroupCodes={
          decisionsNeeded ? ["APPEARANCE_APPROVAL_REQUIRED"] : []
        }
        findings={result.findings.map((finding) =>
          finding.code === "APPEARANCE_APPROVAL_REQUIRED"
            ? { ...finding, severity: "unverified" as const }
            : finding,
        )}
      />
      {result.assignments.length > 0 && (
        <details className="assignment-details">
          <summary>Assignments ({result.assignments.length})</summary>
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
                    (item) => item.id === assignment.occurrenceId,
                  );
                  return (
                    <tr key={assignment.id}>
                      <td>
                        SC{" "}
                        {
                          project.scenes.find(
                            (item) => item.id === occurrence?.sceneId,
                          )?.number
                        }
                      </td>
                      <td>
                        {
                          project.performers.find(
                            (item) => item.id === assignment.performerId,
                          )?.name
                        }
                      </td>
                      <td>
                        {
                          project.units.find(
                            (item) => item.id === assignment.unitId,
                          )?.code
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
      {(review.swaps.length > 0 || review.creativeFlags.length > 0) && (
        <section
          className="allocation-swaps"
          aria-label="Garment changes in this allocation"
        >
          <div className="section-title">
            <h3>
              {!review.swaps.length
                ? "Direction to update"
                : adopted
                  ? "Adopted swaps"
                  : "Garment swaps"}
            </h3>
          </div>
          <ul className="allocation-swap-list">
            {review.swaps.map((swap) => (
              <li key={`${swap.characterId}:${swap.lookIds.join(":")}`}>
                <strong>
                  {
                    project.characters.find(
                      (item) => item.id === swap.characterId,
                    )?.name
                  }{" "}
                  ·{" "}
                  {swap.lookIds
                    .map(
                      (id) =>
                        project.looks.find((look) => look.id === id)?.title,
                    )
                    .filter(Boolean)
                    .join(" / ")}
                </strong>
                <p>
                  {unitNames(swap.fromUnitIds)}{" "}
                  <ArrowRight size={15} aria-label="changes to" />{" "}
                  {unitNames(swap.toUnitIds)}
                </p>
                <span className="mono">
                  SC{" "}
                  {swap.sceneIds
                    .map(
                      (id) =>
                        project.scenes.find((scene) => scene.id === id)?.number,
                    )
                    .filter(Boolean)
                    .join(" / ")}{" "}
                  · {swap.occurrenceIds.length} call
                  {swap.occurrenceIds.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
          {review.creativeFlags.length > 0 && (
            <div className="allocation-direction-flags">
              <h4>
                <TriangleAlert size={16} /> Direction still names the old
                garment
              </h4>
              <ul>
                {review.creativeFlags.map((flag) => (
                  <li key={`${flag.characterId}:${flag.unitId}`}>
                    <strong>
                      {
                        project.characters.find(
                          (item) => item.id === flag.characterId,
                        )?.name
                      }
                    </strong>{" "}
                    · {flag.references.join(" · ")}
                  </li>
                ))}
              </ul>
              {(adopted || !review.swaps.length) &&
                [
                  ...new Set(
                    review.creativeFlags.map((flag) => flag.characterId),
                  ),
                ].map((id) => {
                  const character = project.characters.find(
                    (item) => item.id === id,
                  );
                  return character ? (
                    <DirectionRepair
                      key={`${id}:${character.direction.revision}`}
                      character={character}
                      busy={busy}
                      onSave={saveDirection}
                    />
                  ) : null;
                })}
              {review.creativeFlags.map((flag) => (
                <DirectionAcknowledgement
                  key={`${flag.characterId}:${flag.unitId}`}
                  characterId={flag.characterId}
                  unitId={flag.unitId}
                />
              ))}
            </div>
          )}
          {review.confirmationRequired && isCurrent && (
            <label className="checkbox-field allocation-swap-confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) =>
                  setConfirmedReview(
                    event.target.checked ? review.reviewHash : null,
                  )
                }
              />
              <span>I’ve reviewed these garment swaps.</span>
            </label>
          )}
        </section>
      )}
      {adopted && currentDecisions.missingLookIds.length > 0 && (
        <Notice tone="warning">
          {currentDecisions.missingLookIds.length} current look
          {currentDecisions.missingLookIds.length === 1
            ? " needs"
            : "s need"}{" "}
          reapproval.
        </Notice>
      )}
      <div className="allocation-adopt">
        <details className="allocation-policy">
          <summary>Method</summary>
          <p>
            Hard constraints first, then lowest cost, then fewest changeovers.
          </p>
        </details>
        {!isCurrent ? (
          <Button
            busy={busy}
            onClick={async () => {
              if (await send({ type: "solve_allocation" }))
                setLocalFocus((value) => value + 1);
            }}
          >
            {adopted ? "Recheck" : "Recompute"}
          </Button>
        ) : !decisionsNeeded && !adopted ? (
          <Button
            variant="primary"
            disabled={!canAdopt}
            busy={busy}
            onClick={() =>
              void send({
                type: "adopt_allocation",
                inputHash: result.inputHash,
                ...(review.confirmationRequired
                  ? {
                      confirmation: {
                        proposalId: review.proposalId,
                        inputHash: review.inputHash,
                        sourceRevision: review.sourceRevision,
                        reviewHash: review.reviewHash,
                      },
                    }
                  : {}),
              })
            }
          >
            Adopt these assignments <Check size={16} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
