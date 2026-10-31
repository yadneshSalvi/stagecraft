import type {
  ChangeImpact,
  Production,
  RepairOption,
  RepairProposal,
} from "../types";
import { solveAllocation } from "./allocation";
import { findRecord } from "./errors";
import { repairInputHash } from "./lineage";

export interface ChangeRequest {
  kind: RepairProposal["kind"];
  subjectId: string;
  replacementId?: string;
}
const unique = <T>(values: T[]) => [...new Set(values)];

export function affectedLookIds(
  production: Production,
  request: ChangeRequest,
): string[] {
  if (request.kind === "garment_unavailable") {
    findRecord(production.units, request.subjectId, "Physical unit");
    return production.looks
      .filter((look) => look.unitIds.includes(request.subjectId))
      .map((look) => look.id);
  }
  const character = production.characters.find(
    (item) => item.id === request.subjectId,
  );
  if (character)
    return production.looks
      .filter((look) => look.characterId === character.id)
      .map((look) => look.id);
  findRecord(
    production.performers,
    request.subjectId,
    "Performer or character",
  );
  return production.looks
    .filter((look) => look.performerId === request.subjectId)
    .map((look) => look.id);
}

export function previewChange(
  production: Production,
  request: ChangeRequest,
): ChangeImpact;
export function previewChange(
  production: Production,
  kind: RepairProposal["kind"],
  subjectId: string,
  replacementId?: string,
): ChangeImpact;
export function previewChange(
  production: Production,
  requestOrKind: ChangeRequest | RepairProposal["kind"],
  subjectId?: string,
  replacementId?: string,
): ChangeImpact {
  const request =
    typeof requestOrKind === "string"
      ? { kind: requestOrKind, subjectId: subjectId ?? "", replacementId }
      : requestOrKind;
  const lookIds = affectedLookIds(production, request);
  const looks = production.looks.filter((look) => lookIds.includes(look.id));
  const sceneIds = unique(looks.flatMap((look) => look.sceneIds));
  const occurrenceIds = production.occurrences
    .filter((occurrence) => sceneIds.includes(occurrence.sceneId))
    .map((occurrence) => occurrence.id);
  const allocationIds = production.allocations
    .filter(
      (allocation) =>
        lookIds.includes(allocation.lookId) ||
        (request.kind === "garment_unavailable" &&
          allocation.unitId === request.subjectId),
    )
    .map((allocation) => allocation.id);
  const sourcingIds =
    request.kind === "garment_unavailable"
      ? production.sourcing
          .filter(
            (source) =>
              source.unitIds.includes(request.subjectId) &&
              source.status !== "cancelled" &&
              source.status !== "returned",
          )
          .map((source) => source.id)
      : [];
  const packIds = production.packs
    .filter(
      (pack) =>
        pack.snapshot.looks.some((look) => lookIds.includes(look.id)) ||
        (request.kind === "garment_unavailable" &&
          pack.snapshot.units.some((unit) => unit.id === request.subjectId)),
    )
    .map((pack) => pack.id);
  const invalidatedApprovalIds = looks.flatMap((look) =>
    look.approvals
      .filter((approval) => approval.state === "current")
      .map((approval) => approval.id),
  );
  const preservedApprovalIds = production.looks
    .filter((look) => !lookIds.includes(look.id))
    .flatMap((look) =>
      look.approvals
        .filter((approval) => approval.state === "current")
        .map((approval) => approval.id),
    );
  const invalidatedBeautyApprovalIds =
    request.kind === "recast"
      ? looks.flatMap(
          (look) =>
            look.beauty?.approvals
              .filter((approval) => approval.state === "current")
              .map((approval) => approval.id) ?? [],
        )
      : [];
  const preservedBeautyApprovalIds = production.looks
    .filter(
      (look) =>
        request.kind === "garment_unavailable" || !lookIds.includes(look.id),
    )
    .flatMap(
      (look) =>
        look.beauty?.approvals
          .filter((approval) => approval.state === "current")
          .map((approval) => approval.id) ?? [],
    );
  const subjectName =
    request.kind === "garment_unavailable"
      ? findRecord(production.units, request.subjectId, "Physical unit").code
      : (production.characters.find(
          (character) => character.id === request.subjectId,
        )?.name ??
        findRecord(production.performers, request.subjectId, "Performer").name);
  return {
    lookIds,
    sceneIds,
    occurrenceIds,
    allocationIds,
    sourcingIds,
    packIds,
    invalidatedApprovalIds,
    preservedApprovalIds,
    invalidatedBeautyApprovalIds,
    preservedBeautyApprovalIds,
    explanation: [
      `${subjectName} affects ${looks.length} look${looks.length === 1 ? "" : "s"}, ${sceneIds.length} scene${sceneIds.length === 1 ? "" : "s"} and ${occurrenceIds.length} scheduled occurrence${occurrenceIds.length === 1 ? "" : "s"}.`,
      request.kind === "garment_unavailable"
        ? "Replacing the pictured garment creates new recipe revisions. Exact appearance approvals must be refreshed; dependent allocations and sourcing drafts need review."
        : "The replacement performer retains the character direction and story requirements. Actor-specific previews, appearance approvals and fitting evidence require fresh review.",
      "Adoption creates a new production revision; frozen earlier snapshots and their evidence remain reproducible.",
    ],
    preserved: [
      `${preservedApprovalIds.length} unrelated appearance approval${preservedApprovalIds.length === 1 ? " remains" : "s remain"} intact.`,
      "Character direction, script source and story chronology remain intact.",
      `${preservedBeautyApprovalIds.length} independent beauty approval${preservedBeautyApprovalIds.length === 1 ? " remains" : "s remain"} intact. ${request.kind === "garment_unavailable" ? "A garment substitution does not alter the independent face-detail recipe." : "Makeup approvals for unrelated performers are preserved; the replacement performer needs their own face source, output and approval."}`,
      ...(request.kind === "recast"
        ? [
            "Item-and-date supplier reservations are preserved; a reservation does not establish fit for the replacement performer.",
          ]
        : [
            "Historical renders remain available as labelled comparisons; availability does not rewrite their pixels.",
          ]),
    ],
  };
}

function recipeCost(production: Production): number {
  const ids = unique(
    production.looks
      .filter((look) =>
        production.occurrences.some((occurrence) =>
          look.sceneIds.includes(occurrence.sceneId),
        ),
      )
      .flatMap((look) => look.unitIds),
  );
  return ids.reduce(
    (sum, id) =>
      sum + (production.units.find((unit) => unit.id === id)?.priceCents ?? 0),
    0,
  );
}

/** Apply just the proposed facts to a private scratch copy for feasibility evaluation. */
export function simulateRepair(
  production: Production,
  request: ChangeRequest,
  replacementId: string,
): Production {
  const draft = structuredClone(production);
  const lookIds = affectedLookIds(draft, request);
  if (request.kind === "garment_unavailable") {
    const removed = findRecord(draft.units, request.subjectId, "Physical unit");
    findRecord(draft.units, replacementId, "Replacement unit");
    removed.status = "unavailable";
    removed.version += 1;
    for (const look of draft.looks.filter((look) =>
      lookIds.includes(look.id),
    )) {
      look.unitIds = look.unitIds.map((id) =>
        id === request.subjectId ? replacementId : id,
      );
      look.revision += 1;
    }
  } else {
    const replacement = findRecord(
      draft.performers,
      replacementId,
      "Replacement performer",
    );
    const characters = draft.characters.filter(
      (character) =>
        character.id === request.subjectId ||
        character.performerId === request.subjectId,
    );
    const priorPerformerIds = unique(
      draft.looks
        .filter((look) => lookIds.includes(look.id))
        .map((look) => look.performerId),
    );
    for (const character of characters) character.performerId = replacement.id;
    for (const look of draft.looks.filter((look) =>
      lookIds.includes(look.id),
    )) {
      look.performerId = replacement.id;
      look.revision += 1;
      if (look.beauty) look.beauty.revision += 1;
    }
    for (const unit of draft.units.filter((unit) =>
      draft.looks.some(
        (look) => lookIds.includes(look.id) && look.unitIds.includes(unit.id),
      ),
    )) {
      if (
        unit.fitting.performerId === null ||
        priorPerformerIds.includes(unit.fitting.performerId)
      ) {
        unit.fitting = {
          performerId: replacement.id,
          status: "not_measured",
          evidence:
            "Replacement performer requires a new fitting; previous performer evidence remains in the prior production snapshot.",
          provenance: replacement.synthetic ? "synthetic" : "manual",
        };
        unit.version += 1;
      }
    }
  }
  return draft;
}

export function buildRepairProposal(
  production: Production,
  request: ChangeRequest,
  context: { id: string; now: string; seeded: boolean },
): RepairProposal {
  const impact = previewChange(production, request);
  const originalCost = recipeCost(production);
  let candidates: Array<{ id: string; label: string }>;
  if (request.kind === "garment_unavailable") {
    const unit = findRecord(
      production.units,
      request.subjectId,
      "Physical unit",
    );
    candidates = production.units
      .filter(
        (candidate) =>
          candidate.id !== unit.id &&
          candidate.category === unit.category &&
          (!request.replacementId || candidate.id === request.replacementId),
      )
      .map((candidate) => ({
        id: candidate.id,
        label: `${candidate.code} · ${candidate.name}`,
      }));
    if (request.replacementId)
      findRecord(production.units, request.replacementId, "Replacement unit");
  } else {
    const current =
      production.characters.find(
        (character) => character.id === request.subjectId,
      )?.performerId ?? request.subjectId;
    candidates = production.performers
      .filter(
        (candidate) =>
          candidate.id !== current &&
          (!request.replacementId || candidate.id === request.replacementId),
      )
      .map((candidate) => ({ id: candidate.id, label: candidate.name }));
    if (request.replacementId)
      findRecord(
        production.performers,
        request.replacementId,
        "Replacement performer",
      );
  }
  const options: RepairOption[] = candidates.map((candidate) => {
    const scratch = simulateRepair(production, request, candidate.id);
    const allocation = solveAllocation(scratch, { now: context.now });
    const castingOnly =
      request.kind === "recast" && impact.lookIds.length === 0;
    const feasible =
      castingOnly ||
      ((allocation.status === "OPTIMAL" || allocation.status === "FEASIBLE") &&
        allocation.independentlyChecked);
    return {
      id: `${context.id}-option-${candidate.id}`,
      label: candidate.label,
      replacementUnitId:
        request.kind === "garment_unavailable" ? candidate.id : null,
      replacementPerformerId: request.kind === "recast" ? candidate.id : null,
      costDeltaCents: recipeCost(scratch) - originalCost,
      requiresVisualApproval: true,
      findings: castingOnly ? [] : allocation.findings,
      feasible,
      explanation: castingOnly
        ? "Assigns this performer to an uncast character. No look or physical demand exists yet; create and approve the appearance before allocation."
        : feasible
          ? "Fits the recorded physical schedule and hard budget. Adopting creates an unapproved recipe revision; fresh exact appearance approval, fitting and supplier evidence remain separate requirements."
          : "The recorded constraints do not establish a feasible allocation. Review the specific findings; no artistic, timing or budget constraint was relaxed.",
    };
  });
  return {
    id: context.id,
    kind: request.kind,
    subjectId: request.subjectId,
    replacementId: request.replacementId ?? null,
    baseRevision: production.revision,
    inputHash: repairInputHash(production),
    status: "proposed",
    impact,
    options,
    createdAt: context.now,
    adoptedAt: null,
    seeded: context.seeded,
  };
}
