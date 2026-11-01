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
import { money, revision, time } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Notice } from "./ui";
import { FindingSummary } from "./finding-summary";
import { AllocationChoices } from "./allocation-choices";
import { ExampleDecisions } from "./example-decisions";
import { DirectionRepair } from "./direction-repair";

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
      ref.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
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
      <header>
        <div>
          <p className="eyebrow">
            ALLOCATION {adopted ? "ADOPTED" : "PROPOSAL"} /{" "}
            {revision(result.adoptionRevision || result.sourceRevision)}
          </p>
          <h2>
            {decisionsNeeded
              ? decisions.missingLookIds.length
                ? "A few appearance decisions come first."
                : "The appearances are reviewed. Recheck the plan."
              : status === "INFEASIBLE"
                ? "These commitments conflict."
                : status === "INVALID_INPUT"
                  ? "The schedule needs a correction."
                  : status === "UNKNOWN" || status === "TIME_LIMIT"
                    ? "The search has not established feasibility."
                    : adopted
                      ? "The assignments are in the working book."
                      : "The physical assignments can work."}
          </h2>
        </div>
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
          {decisionsNeeded && !decisions.missingLookIds.length
            ? "RECHECK NEEDED"
            : status.replaceAll("_", " ")}
        </Badge>
      </header>
      {decisionsNeeded ? (
        <div className="allocation-decision-prompt">
          <p>
            {decisions.missingLookIds.length ? (
              <>
                <strong>
                  {decisions.missingLookIds.length} of {decisions.looksTotal}{" "}
                  looks
                </strong>{" "}
                need an approved appearance before allocation.
              </>
            ) : (
              <>
                All {decisions.looksTotal} scheduled looks have an approved
                appearance. Recompute against the current revision to check the
                physical commitments.
              </>
            )}
          </p>
          {decisions.missingLookIds.length > 0 && (
            <p>
              Review the exact outputs for the scheduled looks. The wardrobe
              choices will be checked again after your decisions.
            </p>
          )}
        </div>
      ) : (
        <div className="allocation-result-meta">
          <span>
            {result.assignments.length} {adopted ? "saved" : "proposed"}{" "}
            assignments
          </span>
          <span>
            {money(result.totalCostCents, project.currency)} /{" "}
            {money(project.budgetCents, project.currency)} budget
          </span>
          <span
            className={
              result.constraintChecked || result.independentlyChecked
                ? "text-success"
                : ""
            }
          >
            {result.constraintChecked || result.independentlyChecked
              ? "Constraint check passed"
              : "Constraint check incomplete"}
          </span>
        </div>
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
        findings={result.findings.map((finding) =>
          finding.code === "APPEARANCE_APPROVAL_REQUIRED"
            ? { ...finding, severity: "unverified" as const }
            : finding,
        )}
      />
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
                ? "Creative direction to reconcile"
                : adopted
                  ? "The garment changes you adopted"
                  : "These assignments also change the looks"}
            </h3>
            <Badge tone={adopted ? "neutral" : "warning"}>
              {!review.swaps.length
                ? "Direction review"
                : adopted
                  ? "Recorded changes"
                  : "Explicit confirmation required"}
            </Badge>
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
                <TriangleAlert size={16} /> The old garment is still in the
                direction.
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
              <p>
                {adopted || !review.swaps.length
                  ? "Edit these references here, or keep them as a deliberate creative choice."
                  : "Review these references before confirming the swap. You can reconcile the direction after adoption."}
              </p>
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
                      key={id}
                      character={character}
                      busy={busy}
                      onSave={saveDirection}
                    />
                  ) : null;
                })}
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
              <span>
                I have reviewed these exact garment changes and direction
                references. Adopt this proposal.
              </span>
            </label>
          )}
        </section>
      )}
      {adopted && currentDecisions.missingLookIds.length > 0 && (
        <Notice tone="warning">
          {currentDecisions.missingLookIds.length} current look
          {currentDecisions.missingLookIds.length === 1 ? " needs" : "s need"} a
          new appearance decision. Review the existing outputs, then check the
          allocation again.
        </Notice>
      )}
      <div className="allocation-adopt">
        <details className="allocation-policy">
          <summary>How the allocator decides</summary>
          <p>
            {result.policy}
            <span className="mono">{result.solver}</span>
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
            {adopted
              ? "Check the allocation again"
              : "Recompute against current revision"}
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
