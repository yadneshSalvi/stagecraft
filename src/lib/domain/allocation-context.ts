import type {
  AllocationDecisionSummary,
  AllocationResult,
  Look,
  Production,
} from "../types";
import { getCurrentApproval, getApprovedAppearanceChoices } from "./lineage";
export function scheduledDressedLooks(production: Production): Look[] {
  return [
    ...new Map(
      production.looks
        .filter(
          (look) =>
            look.unitIds.length > 0 &&
            !production.characters.find(
              (character) => character.id === look.characterId,
            )?.ownClothes &&
            production.occurrences.some((occurrence) =>
              look.sceneIds.includes(occurrence.sceneId),
            ),
        )
        .map((look) => [look.id, look]),
    ).values(),
  ];
}
export function getAllocationDecisionSummary(
  production: Production,
  result?: AllocationResult | null,
): AllocationDecisionSummary {
  if (result?.decisions) return structuredClone(result.decisions);
  const looks = scheduledDressedLooks(production);
  const missingLookIds = looks
    .filter(
      (look) =>
        !getCurrentApproval(look, production) &&
        !getApprovedAppearanceChoices(production, look).length,
    )
    .map((look) => look.id);
  return {
    looksTotal: looks.length,
    approvedLooks: looks.length - missingLookIds.length,
    missingLookIds,
  };
}
/** Old JSON is read without rewriting its stored result or hiding a real conflict. */
export function getAllocationStatus(
  production: Production,
  result: AllocationResult,
): AllocationResult["status"];
export function getAllocationStatus(
  production: Production,
  result?: AllocationResult | null,
): AllocationResult["status"] | undefined;
export function getAllocationStatus(
  production: Production,
  result: AllocationResult | null | undefined = production.allocationResult,
): AllocationResult["status"] | undefined {
  if (!result) return undefined;
  const conflicts = result.findings.filter(
    (finding) => finding.severity === "conflict",
  );
  if (
    result.status === "INFEASIBLE" &&
    conflicts.length > 0 &&
    conflicts.every(
      (finding) => finding.code === "APPEARANCE_APPROVAL_REQUIRED",
    )
  )
    return "DECISIONS_NEEDED";
  return result.status;
}
