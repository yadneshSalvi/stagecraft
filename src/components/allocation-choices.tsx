"use client";
import type { AllocationResult, Production } from "@/lib/types";
import { getCurrentCandidateApproval } from "@/lib/domain/lineage";
import { money } from "@/lib/format";

/** Explains recorded selections without inventing counterfactual solver findings. */
export function AllocationChoices({
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
      <summary>Why these physical units?</summary>
      <p>
        Exact appearance decisions authorize the choices. The search minimizes
        the total quote, then changeovers; each physical unit is costed once.
      </p>
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
                · recorded approval for{" "}
                {performer?.name || "the assigned performer"} · {calls} call
                {calls === 1 ? "" : "s"} using this coherent choice.
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
                        :{" "}
                        {approval
                          ? "currently approved; not selected in this saved solution"
                          : "not currently admissible: exact appearance approval is missing or stale"}
                        .
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      {result.sourceRevision !== project.revision && (
        <p>
          The solution belongs to an earlier revision. Recompute to apply
          current approval and schedule facts.
        </p>
      )}
    </details>
  );
}
