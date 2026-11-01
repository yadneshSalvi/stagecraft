import type {
  Allocation,
  AllocationChoiceAlternative,
  AllocationChoiceComparison,
  AllocationFinding,
  AllocationResult,
  AllocationSwap,
  Production,
} from "../types";
import {
  allocationInputHash,
  continuityLookIds,
  getApprovedAppearanceChoices,
  sameIds,
} from "./lineage";
import { fingerprint } from "./hash";
import {
  getCreativeReferenceFlags,
  getCurrentCreativeReferenceFlags,
} from "./direction";
const unique = <T>(values: T[]) => [...new Set(values)];

/** Reconstructs the exact artistic changes, retaining source recipes after adoption. */
export function getAllocationSwaps(
  production: Production,
  result: AllocationResult,
): AllocationSwap[] {
  const originals = new Map(
    (
      result.originalRecipes ??
      production.looks.map((look) => ({
        lookId: look.id,
        unitIds: look.unitIds,
      }))
    ).map((item) => [item.lookId, item.unitIds]),
  );
  const groups = new Map<string, Allocation[]>();
  for (const assignment of result.assignments) {
    const look = production.looks.find((item) => item.id === assignment.lookId);
    if (look)
      groups.set(look.continuityGroupId ?? look.id, [
        ...(groups.get(look.continuityGroupId ?? look.id) ?? []),
        assignment,
      ]);
  }
  return [...groups.values()].flatMap((assignments) => {
    const first = assignments[0],
      candidate = production.appearanceCandidates?.find(
        (item) => item.id === first.candidateId,
      );
    const lookIds = unique([
      ...assignments.map((item) => item.lookId),
      ...(candidate?.lookIds ?? []),
    ]).sort();
    const fromUnitIds = unique(
      lookIds.flatMap(
        (id) =>
          originals.get(id) ??
          production.looks.find((item) => item.id === id)?.unitIds ??
          [],
      ),
    ).sort();
    const toUnitIds = unique(assignments.map((item) => item.unitId)).sort();
    if (sameIds(fromUnitIds, toUnitIds)) return [];
    const looks = production.looks.filter((look) => lookIds.includes(look.id));
    return [
      {
        characterId: looks[0].characterId,
        lookIds,
        sceneIds: unique(looks.flatMap((look) => look.sceneIds)).sort(),
        occurrenceIds: unique(
          assignments.map((item) => item.occurrenceId),
        ).sort(),
        fromUnitIds,
        toUnitIds,
        ...(first.candidateId ? { candidateId: first.candidateId } : {}),
        ...(first.approvalId ? { approvalId: first.approvalId } : {}),
        ...(first.previewId ? { previewId: first.previewId } : {}),
      },
    ];
  });
}
export function getAllocationAdoptionReview(
  production: Production,
  result: AllocationResult,
) {
  const proposalId =
    result.proposalId ??
    `allocation-legacy-${fingerprint({ id: production.id, revision: result.sourceRevision, inputHash: result.inputHash }).slice(0, 32)}`;
  const swaps = getAllocationSwaps(production, result);
  const proposedFlags = swaps.flatMap((swap) =>
    getCreativeReferenceFlags(
      production,
      swap.lookIds,
      swap.fromUnitIds.filter((id) => !swap.toUnitIds.includes(id)),
    ),
  );
  const creativeFlags = [
    ...new Map(
      [...getCurrentCreativeReferenceFlags(production), ...proposedFlags].map(
        (flag) => [`${flag.characterId}:${flag.unitId}`, flag],
      ),
    ).values(),
  ];
  const reviewHash = fingerprint({
    contract: "stagecraft-allocation-confirmation-v1",
    proposalId,
    inputHash: result.inputHash,
    sourceRevision: result.sourceRevision,
    currentRevision: production.revision,
    currentInputHash: allocationInputHash(production),
    swaps,
    creativeFlags,
    directions: production.characters
      .filter((character) =>
        swaps.some((swap) => swap.characterId === character.id),
      )
      .map(({ id, direction }) => ({ id, direction })),
  });
  return {
    proposalId,
    inputHash: result.inputHash,
    sourceRevision: result.sourceRevision,
    reviewHash,
    swaps,
    creativeFlags,
    confirmationRequired: swaps.length > 0 && !result.adoptedAt,
  };
}
export function countGarmentChangeovers(
  production: Production,
  assignments: Allocation[],
): number {
  let count = 0;
  for (const performerId of unique(
    assignments.map((item) => item.performerId),
  )) {
    const calls = unique(
      assignments
        .filter((item) => item.performerId === performerId)
        .map((item) => item.occurrenceId),
    )
      .map((id) => ({
        start: Date.parse(
          production.occurrences.find((item) => item.id === id)?.start ?? "",
        ),
        units: assignments
          .filter(
            (item) =>
              item.performerId === performerId && item.occurrenceId === id,
          )
          .map((item) => item.unitId)
          .sort()
          .join("|"),
      }))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < calls.length; i++)
      if (calls[i].units !== calls[i - 1].units) count++;
  }
  return count;
}
type Checker = (
  production: Production,
  assignments: Allocation[],
  options: { now: string },
) => { findings: AllocationFinding[]; valid: boolean; totalCostCents: number };
/** Counterfactuals hold every other saved assignment fixed; they do not claim global infeasibility. */
export function buildAllocationChoiceComparisons(
  production: Production,
  result: AllocationResult,
  check: Checker,
): AllocationChoiceComparison[] {
  const groups = new Map<string, Allocation[]>();
  for (const assignment of result.assignments) {
    const look = production.looks.find((item) => item.id === assignment.lookId);
    if (look)
      groups.set(look.continuityGroupId ?? look.id, [
        ...(groups.get(look.continuityGroupId ?? look.id) ?? []),
        assignment,
      ]);
  }
  const quote = (ids: string[]) => {
    const units = unique(ids).map((id) =>
      production.units.find((unit) => unit.id === id),
    );
    return units.every(
      (unit) =>
        unit &&
        Number.isSafeInteger(unit.priceCents) &&
        unit.priceCents >= 0 &&
        !!unit.priceSource.trim(),
    )
      ? units.reduce((sum, unit) => sum + unit!.priceCents, 0)
      : null;
  };
  return [...groups.entries()].map(([groupId, assignments]) => {
    const look = production.looks.find(
      (item) => item.id === assignments[0].lookId,
    )!;
    const scope = continuityLookIds(production, look),
      lookIds = unique(assignments.map((item) => item.lookId));
    const selectedUnitIds = unique(
      assignments.map((item) => item.unitId),
    ).sort();
    const originalUnitIds = unique(
      scope.flatMap(
        (id) =>
          result.originalRecipes?.find((item) => item.lookId === id)?.unitIds ??
          production.looks.find((item) => item.id === id)?.unitIds ??
          [],
      ),
    ).sort();
    const approved = getApprovedAppearanceChoices(production, look);
    const recipes = [
      {
        id: `original:${groupId}`,
        candidateId: undefined as string | undefined,
        unitIds: originalUnitIds,
      },
      ...(production.appearanceCandidates ?? [])
        .filter(
          (candidate) =>
            candidate.performerId === look.performerId &&
            sameIds(candidate.lookIds, scope),
        )
        .map((candidate) => ({
          id: candidate.id,
          candidateId: candidate.id,
          unitIds: candidate.recipe.unitIds,
        })),
    ];
    const seen = new Set<string>();
    const choices = recipes.flatMap<AllocationChoiceAlternative>((recipe) => {
      const key = [...recipe.unitIds].sort().join("|");
      if (seen.has(key)) return [];
      seen.add(key);
      const selected = sameIds(recipe.unitIds, selectedUnitIds),
        original = sameIds(recipe.unitIds, originalUnitIds),
        choice = approved.find((item) =>
          sameIds(item.recipe.unitIds, recipe.unitIds),
        );
      const base = {
        id: recipe.id,
        ...(choice?.candidateId || recipe.candidateId
          ? { candidateId: choice?.candidateId ?? recipe.candidateId }
          : {}),
        unitIds: [...recipe.unitIds],
        original,
        selected,
        admissible: !!choice,
        quoteCents: quote(recipe.unitIds),
      };
      const counterfactual = result.assignments.map((assignment) => {
        if (!lookIds.includes(assignment.lookId)) return assignment;
        const assignedLook = production.looks.find(
          (item) => item.id === assignment.lookId,
        )!;
        const groupAssignments = assignments.filter(
          (item) =>
            item.lookId === assignment.lookId &&
            item.occurrenceId === assignment.occurrenceId,
        );
        const ordinal = assignment.id.match(/:(\d+)$/);
        const slot = ordinal
          ? Number(ordinal[1])
          : groupAssignments.findIndex((item) => item.id === assignment.id);
        const evidence = choice?.evidence[assignedLook.id];
        return {
          ...assignment,
          unitId: (choice?.recipe.unitIds ?? recipe.unitIds)[slot],
          candidateId: choice?.candidateId,
          approvalId: evidence?.approvalId,
          previewId: evidence?.previewId,
        };
      });
      const total = quote(counterfactual.map((item) => item.unitId));
      const planCostDeltaCents =
        total === null ? null : total - result.totalCostCents;
      if (!choice)
        return [
          {
            ...base,
            planCostDeltaCents,
            changeoverDelta: null,
            reason: "approval_required" as const,
            findings: [],
          },
        ];
      const verified = check(production, counterfactual, {
        now: result.createdAt,
      });
      const findings = verified.findings.filter(
        (item) => item.severity === "conflict",
      );
      const changeoverDelta =
        countGarmentChangeovers(production, counterfactual) -
        countGarmentChangeovers(production, result.assignments);
      const reason: AllocationChoiceAlternative["reason"] = selected
        ? "selected"
        : findings.some((item) => item.code === "UNIT_OVERLAP")
          ? "overlap"
          : findings.some((item) =>
                ["UNIT_UNAVAILABLE", "AVAILABILITY_WINDOW"].includes(item.code),
              )
            ? "availability"
            : findings.some((item) => item.code === "HARD_BUDGET")
              ? "hard_budget"
              : findings.length
                ? "constraint"
                : planCostDeltaCents === null
                  ? "unknown"
                  : planCostDeltaCents > 0
                    ? "higher_cost"
                    : planCostDeltaCents === 0 && changeoverDelta > 0
                      ? "more_changeovers"
                      : planCostDeltaCents === 0
                        ? "equal_cost"
                        : "not_selected";
      return [
        { ...base, planCostDeltaCents, changeoverDelta, reason, findings },
      ];
    });
    return {
      groupId,
      lookIds,
      characterId: look.characterId,
      originalUnitIds,
      selectedUnitIds,
      choices,
    };
  });
}
