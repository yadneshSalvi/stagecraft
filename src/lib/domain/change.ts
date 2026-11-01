import type {
  ChangeImpact,
  Production,
  RepairOption,
  RepairProposal,
} from "../types";
import { getAllocationDecisionSummary, solveAllocation } from "./allocation";
import { findRecord } from "./errors";
import {
  repairInputHash,
  candidateScopeCurrent,
  continuityLookIds,
  getCurrentCandidateApproval,
  sameIds,
} from "./lineage";
import { adoptAppearanceCandidate } from "./candidates";
import { invalidateDetails } from "./details";
import { getCreativeReferenceFlags } from "./direction";

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
  const creativeFlags =
    request.kind === "garment_unavailable"
      ? getCreativeReferenceFlags(production, lookIds, [request.subjectId])
      : [];
  const invalidatedDetailApprovalIds = unique(
    looks.flatMap((look) =>
      request.kind === "recast"
        ? (look.details ?? []).flatMap((detail) =>
            detail.approvals
              .filter((approval) => approval.state === "current")
              .map((approval) => approval.id),
          )
        : [],
    ),
  );
  const preservedDetailApprovalIds = unique(
    production.looks
      .filter(
        (look) =>
          request.kind === "garment_unavailable" || !lookIds.includes(look.id),
      )
      .flatMap((look) =>
        (look.details ?? []).flatMap((detail) =>
          detail.approvals
            .filter((approval) => approval.state === "current")
            .map((approval) => approval.id),
        ),
      ),
  );
  return {
    lookIds,
    sceneIds,
    occurrenceIds,
    allocationIds,
    sourcingIds,
    packIds,
    invalidatedApprovalIds: unique(invalidatedApprovalIds),
    preservedApprovalIds: unique(preservedApprovalIds),
    invalidatedBeautyApprovalIds: unique(invalidatedBeautyApprovalIds),
    preservedBeautyApprovalIds: unique(preservedBeautyApprovalIds),
    invalidatedDetailApprovalIds,
    preservedDetailApprovalIds,
    creativeFlags,
    explanation: [],
    preserved: [
      "Direction, script, chronology",
      ...(request.kind === "recast" ? ["Supplier reservations"] : []),
    ],
  };
}

export function matchingRepairCandidates(
  production: Production,
  request: ChangeRequest,
  replacementId: string,
) {
  const lookIds = affectedLookIds(production, request);
  const visited = new Set<string>();
  return production.looks
    .filter((look) => lookIds.includes(look.id))
    .flatMap((look) => {
      const key = look.continuityGroupId ?? look.id;
      if (visited.has(key)) return [];
      visited.add(key);
      const scope = continuityLookIds(production, look);
      const unitIds =
        request.kind === "garment_unavailable"
          ? look.unitIds.map((id) =>
              id === request.subjectId ? replacementId : id,
            )
          : look.unitIds;
      const performerId =
        request.kind === "recast" ? replacementId : look.performerId;
      const performer = production.performers.find(
        (item) => item.id === performerId,
      );
      const matches = [...(production.appearanceCandidates ?? [])]
        .reverse()
        .filter(
          (item) =>
            item.performerId === performerId &&
            item.captureVersion === performer?.captureVersion &&
            candidateScopeCurrent(production, item) &&
            sameIds(item.lookIds, scope) &&
            sameIds(item.recipe.unitIds, unitIds) &&
            item.recipe.category === look.category,
        );
      const candidate =
        matches.find(
          (item) => !!getCurrentCandidateApproval(production, item),
        ) ?? matches[0];
      return candidate ? [candidate] : [];
    });
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
  const approved = matchingRepairCandidates(
    draft,
    request,
    replacementId,
  ).filter((candidate) => !!getCurrentCandidateApproval(draft, candidate));
  const approvedLookIds = new Set(
    approved.flatMap((candidate) => candidate.lookIds),
  );
  if (request.kind === "garment_unavailable") {
    const removed = findRecord(draft.units, request.subjectId, "Physical unit");
    findRecord(draft.units, replacementId, "Replacement unit");
    removed.status = "unavailable";
    removed.version += 1;
    for (const look of draft.looks.filter((look) =>
      lookIds.includes(look.id),
    )) {
      look.removedUnitIds = unique([
        ...(look.removedUnitIds ?? []),
        request.subjectId,
      ]).filter((id) => id !== replacementId);
      look.unitIds = look.unitIds.map((id) =>
        id === request.subjectId ? replacementId : id,
      );
      if (!approvedLookIds.has(look.id)) {
        look.revision += 1;
        delete look.activeCandidateId;
      }
    }
  } else {
    const replacement = findRecord(
      draft.performers,
      replacementId,
      "Replacement performer",
    );
    invalidateDetails(
      draft,
      lookIds,
      "Casting changed; independent details belong to the previous performer.",
      true,
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
    for (const candidate of draft.appearanceCandidates ?? [])
      if (
        priorPerformerIds.includes(candidate.performerId) &&
        candidate.performerId !== replacement.id &&
        candidate.lookIds.some((id) => lookIds.includes(id))
      )
        for (const decision of candidate.approvals)
          if (decision.state === "current") {
            decision.state = "stale";
            decision.reason =
              "The performer was recast; restoring this actor requires a fresh exact decision.";
          }
    for (const character of characters) character.performerId = replacement.id;
    for (const look of draft.looks.filter((look) =>
      lookIds.includes(look.id),
    )) {
      look.performerId = replacement.id;
      if (!approvedLookIds.has(look.id)) {
        look.revision += 1;
        delete look.activeCandidateId;
      }
      if (look.beauty) {
        look.beauty.revision += 1;
        for (const approval of look.beauty.approvals)
          if (approval.state === "current") {
            approval.state = "stale";
            approval.reason =
              "Casting changed; the face detail belongs to the previous performer.";
          }
      }
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
          evidence: "New performer needs a fitting.",
          provenance: replacement.synthetic ? "synthetic" : "manual",
        };
        unit.version += 1;
      }
    }
  }
  for (const candidate of approved)
    adoptAppearanceCandidate(draft, candidate, {
      now: production.updatedAt,
      makeId: (kind) => `${kind}-repair-simulation`,
      invalidate: () => {},
    });
  return draft;
}

/** Evaluates an explicit repair, not a cheaper replacement for the reviewed candidate. */
export function evaluateRepairAlternative(
  production: Production,
  request: ChangeRequest,
  replacementId: string,
  now: string,
) {
  const lookIds = affectedLookIds(production, request);
  // Resolve before recasting: a request may identify the old performer rather than the character.
  const appearanceCandidates = matchingRepairCandidates(
    production,
    request,
    replacementId,
  );
  const castingOnly = request.kind === "recast" && lookIds.length === 0;
  const requiresVisualApproval =
    !castingOnly &&
    (!appearanceCandidates.length ||
      lookIds.some(
        (id) =>
          !appearanceCandidates.some(
            (candidate) =>
              candidate.lookIds.includes(id) &&
              !!getCurrentCandidateApproval(production, candidate),
          ),
      ));
  const scratch = simulateRepair(production, request, replacementId);
  const allocation = solveAllocation(scratch, {
    now,
    fixedCandidateIds: appearanceCandidates.map((candidate) => candidate.id),
  });
  const ownScope = new Set(
    appearanceCandidates.flatMap((candidate) => candidate.lookIds),
  );
  const otherLookIds = getAllocationDecisionSummary(
    scratch,
    allocation,
  ).missingLookIds.filter((id) => !ownScope.has(id));
  const decisionsNeeded =
    !requiresVisualApproval &&
    allocation.status === "DECISIONS_NEEDED" &&
    otherLookIds.length
      ? { count: otherLookIds.length, lookIds: otherLookIds }
      : undefined;
  const feasible =
    castingOnly ||
    (!requiresVisualApproval &&
      (allocation.status === "OPTIMAL" || allocation.status === "FEASIBLE") &&
      !!allocation.constraintChecked &&
      allocation.assignments
        .filter((assignment) => lookIds.includes(assignment.lookId))
        .every(
          (assignment) =>
            appearanceCandidates.some(
              (candidate) =>
                candidate.id === assignment.candidateId &&
                candidate.lookIds.includes(assignment.lookId),
            ) &&
            !!scratch.looks
              .find((look) => look.id === assignment.lookId)
              ?.unitIds.includes(assignment.unitId),
        ));
  return {
    scratch,
    allocation,
    appearanceCandidates,
    castingOnly,
    requiresVisualApproval,
    feasible,
    decisionsNeeded,
  };
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
    const {
      scratch,
      allocation,
      appearanceCandidates,
      castingOnly,
      requiresVisualApproval,
      feasible,
      decisionsNeeded,
    } = evaluateRepairAlternative(
      production,
      request,
      candidate.id,
      context.now,
    );
    return {
      id: `${context.id}-option-${candidate.id}`,
      label: candidate.label,
      replacementUnitId:
        request.kind === "garment_unavailable" ? candidate.id : null,
      replacementPerformerId: request.kind === "recast" ? candidate.id : null,
      costDeltaCents: recipeCost(scratch) - originalCost,
      requiresVisualApproval,
      candidateId: appearanceCandidates[0]?.id,
      candidateIds: appearanceCandidates.map((item) => item.id),
      findings: castingOnly ? [] : allocation.findings,
      feasible,
      allocationStatus: castingOnly ? "FEASIBLE" : allocation.status,
      ...(decisionsNeeded ? { decisionsNeeded } : {}),
      explanation: castingOnly
        ? "Casting only; no look yet."
        : requiresVisualApproval
          ? "Approve its preview, then refresh."
          : decisionsNeeded
            ? `${decisionsNeeded.count} other looks need decisions first.`
            : "",
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
