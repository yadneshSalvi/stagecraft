"use client";
import type {
  AllocationChoiceAlternative,
  AllocationResult,
  Production,
} from "@/lib/types";
import { getCurrentCandidateApproval } from "@/lib/domain/lineage";
import { money } from "@/lib/format";
import { Badge } from "./ui";

const choiceReasons: Record<AllocationChoiceAlternative["reason"], string> = {
  selected: "",
  approval_required: "Needs approval",
  overlap: "Overlap",
  availability: "Not available",
  hard_budget: "Over budget",
  higher_cost: "Costs more",
  more_changeovers: "More changeovers",
  equal_cost: "Same cost",
  not_selected: "Not selected",
  unknown: "Price unknown",
  constraint: "Breaks a constraint",
};

export function AllocationChoices({
  project,
  result,
}: {
  project: Production;
  result: AllocationResult;
}) {
  if (!result.choiceComparisons?.length)
    return <LegacyAllocationChoices project={project} result={result} />;
  return (
    <details className="allocation-choices">
      <summary>Why these units?</summary>
      <div className="allocation-choice-list">
        {result.choiceComparisons.map((comparison) => (
          <article key={comparison.groupId}>
            <strong>
              {
                project.characters.find(
                  (item) => item.id === comparison.characterId,
                )?.name
              }{" "}
              ·{" "}
              {comparison.lookIds
                .map(
                  (id) => project.looks.find((look) => look.id === id)?.title,
                )
                .filter(Boolean)
                .join(" / ")}
            </strong>
            <ul className="choice-comparisons">
              {comparison.choices.map((choice) => (
                <li
                  key={choice.id}
                  className={choice.selected ? "choice-selected" : ""}
                >
                  <div className="choice-comparison-heading">
                    <strong>
                      {choice.original ? "Original · " : "Alt · "}
                      {choice.unitIds
                        .map((id) => {
                          const unit = project.units.find(
                            (item) => item.id === id,
                          );
                          return unit ? `${unit.code} ${unit.name}` : id;
                        })
                        .join(" + ")}
                    </strong>
                    <Badge
                      tone={
                        choice.selected
                          ? "success"
                          : choice.admissible
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {choice.selected
                        ? "Selected"
                        : choice.admissible
                          ? "Approved"
                          : "Needs approval"}
                    </Badge>
                  </div>
                  {![
                    "selected",
                    "higher_cost",
                    "more_changeovers",
                    "equal_cost",
                    "approval_required",
                  ].includes(choice.reason) && (
                    <span className="choice-reason">
                      {choiceReasons[choice.reason]}
                    </span>
                  )}
                  <div className="choice-comparison-metrics">
                    {choice.quoteCents !== null && (
                      <span>
                        Unit quote {money(choice.quoteCents, project.currency)}
                      </span>
                    )}
                    {!choice.selected && choice.planCostDeltaCents !== null && (
                      <span>
                        {choice.planCostDeltaCents === 0
                          ? "Same total"
                          : `Production total ${choice.planCostDeltaCents > 0 ? "+" : ""}${money(choice.planCostDeltaCents, project.currency)}`}
                      </span>
                    )}
                    {!choice.selected &&
                      choice.changeoverDelta !== null &&
                      choice.changeoverDelta !== 0 && (
                        <span>
                          {choice.changeoverDelta === 0
                            ? "Same garment changeovers"
                            : `${choice.changeoverDelta > 0 ? "+" : "−"}${Math.abs(choice.changeoverDelta)} garment changeover${Math.abs(choice.changeoverDelta) === 1 ? "" : "s"}`}
                        </span>
                      )}
                  </div>
                  {choice.findings.length > 0 && (
                    <details className="choice-constraint-details">
                      <summary>
                        Evidence (
                        {
                          new Set(
                            choice.findings.map((finding) => finding.message),
                          ).size
                        }
                        )
                      </summary>
                      <ul>
                        {[
                          ...new Set(
                            choice.findings.map((finding) => finding.message),
                          ),
                        ].map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </details>
  );
}

/** Explains recorded selections without inventing counterfactual solver findings. */
function LegacyAllocationChoices({
  project,
  result,
}: {
  project: Production;
  result: AllocationResult;
}) {
  const groups = new Map<string, typeof result.assignments>();
  for (const assignment of result.assignments) {
    const look = project.looks.find((item) => item.id === assignment.lookId);
    if (!look) continue;
    const key = look.continuityGroupId || look.id;
    groups.set(key, [...(groups.get(key) || []), assignment]);
  }
  if (!groups.size) return null;
  return (
    <details className="allocation-choices">
      <summary>Why these units?</summary>
      <div className="allocation-choice-list">
        {[...groups.entries()].map(([id, assignments]) => {
          const look = project.looks.find(
            (item) => item.id === assignments[0].lookId,
          )!;
          const character = project.characters.find(
            (item) => item.id === look.characterId,
          );
          const performer = project.performers.find(
            (item) => item.id === assignments[0].performerId,
          );
          const selectedIds = [
            ...new Set(assignments.map((item) => item.unitId)),
          ];
          const selected = selectedIds
            .map((id) => project.units.find((item) => item.id === id))
            .filter((item) => !!item);
          const alternatives = (project.appearanceCandidates || []).filter(
            (candidate) =>
              candidate.performerId === assignments[0].performerId &&
              candidate.lookIds.includes(look.id) &&
              !candidate.recipe.unitIds.every((id) => selectedIds.includes(id)),
          );
          const calls = new Set(assignments.map((item) => item.occurrenceId))
            .size;
          return (
            <article key={id}>
              <strong>
                {character?.name || look.title} ·{" "}
                {selected.map((unit) => unit.code).join(" + ")}
              </strong>
              <p>
                {selected
                  .map(
                    (unit) =>
                      `${unit.name} (${money(unit.priceCents, project.currency)})`,
                  )
                  .join("; ")}{" "}
                · {performer?.name || "Performer"} · {calls} calls
              </p>
              {alternatives.length > 0 && (
                <ul>
                  {alternatives.map((candidate) => {
                    const approval = getCurrentCandidateApproval(
                      project,
                      candidate,
                    );
                    return (
                      <li key={candidate.id}>
                        {candidate.recipe.unitIds
                          .map(
                            (id) =>
                              project.units.find((unit) => unit.id === id)
                                ?.code || "Unit",
                          )
                          .join(" + ")}
                        : {approval ? "Approved" : "Needs approval"}.
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}
