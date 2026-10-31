import type { Production, Readiness } from "../types";
import { getCurrentDetailApproval } from "./details";
import { validateAllocation } from "./allocation";
import {
  beautyInputHash,
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "./beauty";
import {
  getCurrentApproval,
  getCurrentPreview,
  previewInputHash,
} from "./lineage";

export { getCurrentApproval, getCurrentPreview } from "./lineage";
export {
  getCurrentCandidatePreview,
  getCurrentCandidateApproval,
  getApprovedAppearanceChoices,
} from "./lineage";
export { getCurrentBeautyApproval, getCurrentBeautyPreview } from "./beauty";
export { getCurrentDetailApproval, getCurrentDetailPreview } from "./details";

/** Pure, browser-safe readiness. A current document or visual approval is not physical readiness. */
export function getReadiness(
  production: Production,
  now = new Date().toISOString(),
): Readiness {
  const managedLooks = production.looks.filter(
    (look) =>
      !production.characters.find(
        (character) => character.id === look.characterId,
      )?.ownClothes,
  );
  const scheduledLooks = managedLooks.filter((look) =>
    production.occurrences.some((occurrence) =>
      look.sceneIds.includes(occurrence.sceneId),
    ),
  );
  const appearanceApproved = managedLooks.filter((look) => {
    const performer = production.performers.find(
      (item) => item.id === look.performerId,
    );
    const preview = getCurrentPreview(look, production);
    return (
      !!performer?.consent.granted &&
      !!preview &&
      !!getCurrentApproval(look, production) &&
      preview.captureVersion === performer.captureVersion &&
      preview.inputHash === previewInputHash(production, look)
    );
  }).length;
  const beautyLooks = managedLooks.filter((look) => !!look.beauty);
  const beautyTotal = beautyLooks.length;
  const beautyApproved = beautyLooks.filter((look) => {
    const face = production.performers.find(
      (performer) => performer.id === look.performerId,
    )?.faceCapture;
    const preview = getCurrentBeautyPreview(look);
    return (
      !!face?.imageUrl &&
      face.consent.granted &&
      !!preview &&
      !!getCurrentBeautyApproval(look) &&
      preview.faceCaptureVersion === face.version &&
      preview.inputHash === beautyInputHash(production, look)
    );
  }).length;
  const detailLooks = managedLooks.flatMap((look) =>
    (look.details ?? []).map((detail) => ({ look, detail })),
  );
  const detailsTotal = detailLooks.length;
  const detailsApproved = detailLooks.filter(
    ({ look, detail }) =>
      !!getCurrentDetailApproval(look, detail.kind, production),
  ).length;
  const activeAllocations = production.allocations.filter(
    (allocation) => allocation.state === "allocated",
  );
  const hasManagedDemand = scheduledLooks.some(
    (look) => look.unitIds.length > 0,
  );
  const check = validateAllocation(production, activeAllocations, { now });
  const blockedAllocations = Math.max(
    production.allocations.filter(
      (allocation) => allocation.state === "blocked",
    ).length,
    check.findings.filter((item) => item.severity === "conflict").length,
  );
  const required = new Map<string, { unitId: string; performerId: string }>();
  for (const look of scheduledLooks)
    for (const unitId of look.unitIds)
      required.set(`${look.performerId}:${unitId}`, {
        unitId,
        performerId: look.performerId,
      });
  const pendingFittings = [...required.values()].filter(
    ({ unitId, performerId }) => {
      const fit = production.units.find((unit) => unit.id === unitId)?.fitting;
      return (
        !fit ||
        fit.status !== "confirmed" ||
        fit.performerId !== performerId ||
        !fit.evidence.trim() ||
        (fit.provenance !== "observed" && fit.provenance !== "manual")
      );
    },
  ).length;
  const unitIds = [
    ...new Set([...required.values()].map(({ unitId }) => unitId)),
  ];
  const pendingSourcing = unitIds.filter((unitId) => {
    const unit = production.units.find((item) => item.id === unitId);
    if (!unit || unit.ownership === "owned") return false;
    const intervals = activeAllocations.filter(
      (allocation) => allocation.unitId === unitId,
    );
    return !production.sourcing.some(
      (request) =>
        request.unitIds.includes(unitId) &&
        !request.stale &&
        (request.status === "confirmed" || request.status === "received") &&
        request.provenance === "manual" &&
        !!request.operator?.trim() &&
        !!request.evidence?.trim() &&
        !!request.externalReference?.trim() &&
        intervals.length > 0 &&
        intervals.every(
          (allocation) =>
            Date.parse(request.from) <= Date.parse(allocation.start) &&
            Date.parse(request.to) >= Date.parse(allocation.end),
        ),
    );
  }).length;
  const currentPacks = production.packs.filter(
    (pack) => pack.state === "current",
  ).length;
  const hasAllPacks =
    production.occurrences.length > 0 &&
    production.occurrences.every((occurrence) =>
      production.packs.some(
        (pack) =>
          pack.state === "current" &&
          pack.occurrenceIds.includes(occurrence.id),
      ),
    );
  const unreviewedScript =
    !production.script?.rightsConfirmed ||
    !production.scenes.length ||
    production.scenes.some(
      (scene) =>
        !scene.reviewed ||
        scene.requirements.some((requirement) => !requirement.reviewed),
    );
  const missingCast = production.characters.some(
    (character) =>
      !character.ownClothes &&
      !production.performers.some(
        (performer) => performer.id === character.performerId,
      ),
  );
  const missingLooks = production.scenes.some((scene) =>
    scene.characterIds.some(
      (characterId) =>
        !production.characters.find((character) => character.id === characterId)
          ?.ownClothes &&
        !production.looks.some(
          (look) =>
            look.characterId === characterId &&
            look.sceneIds.includes(scene.id),
        ),
    ),
  );
  const noConsent = managedLooks.some(
    (look) =>
      !production.performers.find(
        (performer) => performer.id === look.performerId,
      )?.consent.granted,
  );
  const unresolved = check.findings.find(
    (item) => item.severity === "unverified",
  );
  let nextAction = "Current plan is ready for its scheduled occurrences.";
  if (!production.script)
    nextAction = "Import a permitted script to establish the first scenes.";
  else if (unreviewedScript)
    nextAction =
      "Review the source-linked script breakdown and confirm its story days.";
  else if (missingCast)
    nextAction = "Add the cast and assign a performer to each character.";
  else if (missingLooks)
    nextAction =
      "Create the missing character looks and link their scene appearances.";
  else if (noConsent)
    nextAction =
      "Record the required performer image permission before creating or approving previews.";
  else if (appearanceApproved < managedLooks.length)
    nextAction = managedLooks.some(
      (look) => !getCurrentPreview(look, production),
    )
      ? "Create an actual provider preview for the looks still showing source portraits."
      : "Review and approve the exact current preview for each look.";
  else if (beautyApproved < beautyTotal)
    nextAction = beautyLooks.some(
      (look) =>
        !production.performers.find(
          (performer) => performer.id === look.performerId,
        )?.faceCapture?.consent.granted,
    )
      ? "Add a separately permitted face capture for the configured beauty detail."
      : beautyLooks.some((look) => !getCurrentBeautyPreview(look))
        ? "Create an actual separate beauty-detail preview; garment output does not render the beauty recipe."
        : "Review and approve the exact current beauty detail independently of the garment appearance.";
  else if (!production.occurrences.length)
    nextAction = "Schedule the scenes independently of their story order.";
  else if (detailsApproved < detailsTotal)
    nextAction =
      "Review and approve each configured hair-colour or necklace detail separately. Garment and makeup decisions do not approve these details.";
  else if (hasManagedDemand && !activeAllocations.length)
    nextAction = "Solve and adopt a checked physical-unit allocation.";
  else if (blockedAllocations)
    nextAction =
      "Resolve the current allocation conflicts before handing off the plan.";
  else if (pendingFittings)
    nextAction =
      "Record the outstanding physical fitting evidence; previews cannot establish fit.";
  else if (pendingSourcing)
    nextAction =
      "Request and record supplier confirmation for the outstanding rental units.";
  else if (unresolved) nextAction = unresolved.message;
  else if (!hasAllPacks)
    nextAction = "Generate current crew packs for every scheduled occurrence.";
  const ready =
    !unreviewedScript &&
    !missingCast &&
    !missingLooks &&
    !noConsent &&
    production.characters.length > 0 &&
    appearanceApproved === managedLooks.length &&
    beautyApproved === beautyTotal &&
    detailsApproved === detailsTotal &&
    (!hasManagedDemand || activeAllocations.length > 0) &&
    check.valid &&
    !blockedAllocations &&
    !pendingFittings &&
    !pendingSourcing &&
    !unresolved &&
    hasAllPacks;
  return {
    appearanceApproved,
    beautyApproved,
    beautyTotal,
    detailsApproved,
    detailsTotal,
    looksTotal: managedLooks.length,
    blockedAllocations,
    pendingSourcing,
    pendingFittings,
    currentPacks,
    nextAction,
    ready,
  };
}
