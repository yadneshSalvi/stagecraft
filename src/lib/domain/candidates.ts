import type {
  AppearanceApproval,
  AppearanceCandidate,
  Production,
  ProductionCommand,
} from "../types";
import { findRecord, requireFact } from "./errors";
import {
  appearanceRecipeHash,
  candidateInputHash,
  candidateIntentHash,
  candidateScopeCurrent,
  continuityLookIds,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
  previewEvidenceHash,
  sameIds,
} from "./lineage";
import { invalidateBeauty } from "./beauty";
import { invalidateDetails } from "./details";

type CandidateCommand = Extract<
  ProductionCommand,
  {
    type:
      | "create_candidate"
      | "add_candidate_preview"
      | "approve_candidate"
      | "revoke_candidate_approval"
      | "adopt_candidate";
  }
>;
export interface CandidateContext {
  now: string;
  makeId: (kind: string) => string;
  invalidate: (lookIds: string[], unitIds?: string[]) => void;
}

/** The working recipe changes; immutable provider and decision identities do not. */
export function adoptAppearanceCandidate(
  production: Production,
  candidateOrId: AppearanceCandidate | string,
  context: CandidateContext,
): AppearanceApproval {
  const candidate =
    typeof candidateOrId === "string"
      ? findRecord(
          production.appearanceCandidates ?? [],
          candidateOrId,
          "Appearance candidate",
        )
      : candidateOrId;
  const approval = getCurrentCandidateApproval(production, candidate);
  const preview = getCurrentCandidatePreview(production, candidate);
  requireFact(
    !!approval && !!preview,
    "CANDIDATE_APPROVAL_REQUIRED",
    "Review and approve the exact current candidate output before adoption. A label or earlier approval cannot authorize this recipe.",
    409,
  );
  const scoped = production.looks.filter((look) =>
    candidate.lookIds.includes(look.id),
  );
  const character = findRecord(
    production.characters,
    scoped[0].characterId,
    "Character",
  );
  const previousActor = character.performerId;
  const recast = previousActor !== candidate.performerId;
  const affected = recast
    ? production.looks.filter((look) => look.characterId === character.id)
    : scoped;
  if (recast)
    for (const previous of production.appearanceCandidates ?? [])
      if (
        previous.performerId === previousActor &&
        previous.lookIds.some((id) => affected.some((look) => look.id === id))
      )
        for (const decision of previous.approvals)
          if (decision.state === "current") {
            decision.state = "stale";
            decision.reason =
              "This performer was recast. The output remains historical evidence and needs a new decision before restoring this actor.";
          }
  const removed = [
    ...new Set(
      scoped.flatMap((look) =>
        look.unitIds.filter((id) => !candidate.recipe.unitIds.includes(id)),
      ),
    ),
  ];
  if (recast) character.performerId = candidate.performerId;
  for (const look of affected) {
    const included = candidate.lookIds.includes(look.id);
    for (const old of look.approvals)
      if (old.state === "current" && old.id !== approval.id) {
        old.state = "historical";
        old.reason = "A reviewed candidate was explicitly adopted.";
      }
    look.performerId = candidate.performerId;
    look.revision += 1;
    if (included) {
      look.unitIds = [...candidate.recipe.unitIds];
      look.category = candidate.recipe.category;
      look.activeCandidateId = candidate.id;
      look.previews = [
        ...look.previews.filter((item) => item.id !== preview.id),
        structuredClone(preview),
      ];
      look.approvals = [
        ...look.approvals.filter((item) => item.id !== approval.id),
        structuredClone(approval),
      ];
      look.reviewReason = null;
    } else {
      delete look.activeCandidateId;
      look.reviewReason =
        "Casting changed; this scene variant needs its own exact performer output and approval.";
    }
  }
  if (recast) {
    invalidateBeauty(
      production,
      affected.map((look) => look.id),
      "Casting changed; the replacement performer needs independent face-detail evidence.",
      true,
    );
    invalidateDetails(
      production,
      affected.map((look) => look.id),
      "Casting changed; independent details require the replacement performer's own source and output.",
      true,
    );
    for (const unit of production.units.filter((unit) =>
      affected.some((look) => look.unitIds.includes(unit.id)),
    )) {
      if (
        unit.fitting.performerId === previousActor ||
        unit.fitting.performerId === null
      ) {
        unit.fitting = {
          performerId: candidate.performerId,
          status: "not_measured",
          evidence:
            "Replacement performer requires a physical fitting; appearance approval does not establish fit.",
          provenance: "manual",
        };
        unit.version += 1;
      }
    }
  }
  context.invalidate(
    affected.map((look) => look.id),
    removed,
  );
  return approval;
}

export function applyCandidateCommand(
  production: Production,
  command: CandidateCommand,
  context: CandidateContext,
): string {
  production.appearanceCandidates ??= [];
  switch (command.type) {
    case "create_candidate": {
      const look = findRecord(production.looks, command.lookId, "Look");
      const lookIds = continuityLookIds(production, look);
      const performer = findRecord(
        production.performers,
        command.performerId ?? look.performerId,
        "Candidate performer",
      );
      requireFact(
        performer.consent.granted && !!performer.imageUrl,
        "CONSENT_REQUIRED",
        "A candidate needs a currently permitted source capture.",
        403,
      );
      requireFact(
        command.unitIds.length === look.unitIds.length &&
          new Set(command.unitIds).size === command.unitIds.length &&
          command.unitIds.length > 0,
        "CANDIDATE_RECIPE_REQUIRED",
        "Specify one distinct physical unit for each required garment in the continuity recipe.",
      );
      for (const id of command.unitIds)
        requireFact(
          findRecord(production.units, id, "Candidate unit").category ===
            look.category,
          "CATEGORY_MISMATCH",
          "Candidate garment category must match the scene look.",
        );
      const recipe = { category: look.category, unitIds: [...command.unitIds] };
      const candidate: AppearanceCandidate = {
        id: context.makeId("candidate"),
        lookIds,
        sceneIds: [
          ...new Set(
            production.looks
              .filter((item) => lookIds.includes(item.id))
              .flatMap((item) => item.sceneIds),
          ),
        ],
        performerId: performer.id,
        captureVersion: performer.captureVersion,
        recipe,
        recipeHash: appearanceRecipeHash(recipe),
        previews: [],
        approvals: [],
        createdAt: context.now,
      };
      requireFact(
        !production.appearanceCandidates.some(
          (item) => item.id === candidate.id,
        ),
        "DUPLICATE_ID",
        "This candidate identity already exists.",
        409,
      );
      production.appearanceCandidates.push(candidate);
      return `Created an unapproved appearance candidate for ${look.title}; the working recipe is unchanged.`;
    }
    case "add_candidate_preview": {
      const candidate = findRecord(
        production.appearanceCandidates,
        command.candidateId,
        "Appearance candidate",
      );
      const performer = findRecord(
        production.performers,
        candidate.performerId,
        "Candidate performer",
      );
      const preview = command.preview;
      requireFact(
        candidateScopeCurrent(production, candidate) &&
          performer.consent.granted &&
          !!performer.imageUrl,
        "STALE_CANDIDATE",
        "The candidate scene scope or source permission changed; create a current candidate.",
        409,
      );
      requireFact(
        !production.appearanceCandidates.some((item) =>
          item.previews.some((output) => output.id === preview.id),
        ) &&
          !production.looks.some((look) =>
            look.previews.some((output) => output.id === preview.id),
          ),
        "DUPLICATE_ID",
        "This provider output identity is already recorded.",
        409,
      );
      requireFact(
        preview.candidateId === candidate.id &&
          preview.lookId === candidate.lookIds[0] &&
          preview.recipeRevision === 1 &&
          preview.recipeHash === candidate.recipeHash &&
          sameIds(preview.scopeLookIds ?? [], candidate.lookIds) &&
          preview.performerId === candidate.performerId &&
          preview.captureVersion === candidate.captureVersion &&
          performer.captureVersion === candidate.captureVersion &&
          sameIds(preview.unitIds, candidate.recipe.unitIds) &&
          preview.inputHash === candidateInputHash(production, candidate) &&
          preview.sourceImageUrl === performer.imageUrl,
        "STALE_PREVIEW",
        "The provider result does not match this exact candidate, source capture, garment reference and scene scope.",
        409,
      );
      requireFact(
        (preview.provenance === "recorded_provider" ||
          preview.provenance === "live_provider") &&
          !!preview.id.trim() &&
          !!preview.imageUrl.trim() &&
          preview.imageUrl !== preview.sourceImageUrl,
        "PROVIDER_EVIDENCE_REQUIRED",
        "Attach a distinct actual stored provider output, never a source portrait or invented result.",
      );
      candidate.previews.push(structuredClone(preview));
      for (const look of production.looks.filter(
        (item) => item.activeCandidateId === candidate.id,
      )) {
        look.previews.push(structuredClone(preview));
        look.reviewReason =
          "Inspect the new exact candidate output and record its appearance decision.";
      }
      return "Attached exact provider evidence to the proposed candidate; approval and adoption remain separate decisions.";
    }
    case "approve_candidate": {
      const candidate = findRecord(
        production.appearanceCandidates,
        command.candidateId,
        "Appearance candidate",
      );
      const selected = findRecord(
        candidate.previews,
        command.previewId,
        "Candidate preview",
      );
      // A named selection may choose an earlier exact current output; it becomes the displayed one.
      candidate.previews = [
        ...candidate.previews.filter((preview) => preview.id !== selected.id),
        selected,
      ];
      const preview = getCurrentCandidatePreview(production, candidate);
      requireFact(
        preview?.id === selected.id,
        "STALE_PREVIEW",
        "Approve a current candidate output for this exact source, physical garment and scene scope.",
        409,
      );
      requireFact(
        !!command.approvedBy.trim() && !!command.rationale.trim(),
        "APPROVAL_RATIONALE_REQUIRED",
        "Record the named reviewer and why this exact candidate satisfies the current direction.",
      );
      for (const approval of candidate.approvals)
        if (approval.state === "current") {
          approval.state = "historical";
          approval.reason = "Superseded by an explicit candidate decision.";
        }
      const approval: AppearanceApproval = {
        id: context.makeId("candidate-approval"),
        lookId: candidate.lookIds[0],
        recipeRevision: 1,
        previewId: preview.id,
        performerId: candidate.performerId,
        captureVersion: candidate.captureVersion,
        sceneIds: [...candidate.sceneIds],
        approvedBy: command.approvedBy.trim(),
        rationale: command.rationale.trim(),
        approvedAt: context.now,
        state: "current",
        reason: null,
        candidateId: candidate.id,
        recipeHash: candidate.recipeHash,
        scopeLookIds: [...candidate.lookIds],
        intentHash: candidateIntentHash(production, candidate),
        previewHash: previewEvidenceHash(preview),
        decisionSource: "manual",
      };
      candidate.approvals.push(approval);
      for (const look of production.looks.filter(
        (item) => item.activeCandidateId === candidate.id,
      )) {
        for (const old of look.approvals)
          if (old.state === "current") {
            old.state = "historical";
            old.reason = "Superseded by the current candidate decision.";
          }
        look.approvals.push(structuredClone(approval));
        look.previews = [
          ...look.previews.filter((item) => item.id !== preview.id),
          structuredClone(preview),
        ];
        look.reviewReason = null;
      }
      return `${command.approvedBy.trim()} approved the exact candidate output and current creative intent; adoption is still explicit.`;
    }
    case "revoke_candidate_approval": {
      const candidate = findRecord(
        production.appearanceCandidates,
        command.candidateId,
        "Appearance candidate",
      );
      const approval = findRecord(
        candidate.approvals,
        command.approvalId,
        "Candidate approval",
      );
      approval.state = "blocked";
      approval.reason =
        "The reviewer explicitly revoked this candidate decision.";
      for (const look of production.looks)
        for (const copy of look.approvals.filter(
          (item) => item.id === approval.id,
        )) {
          copy.state = "blocked";
          copy.reason = approval.reason;
          look.reviewReason =
            "The adopted candidate approval was revoked. Record a new exact decision before allocation.";
        }
      context.invalidate(candidate.lookIds);
      return "Revoked the exact candidate decision, including its adopted copies and dependent handoffs.";
    }
    case "adopt_candidate": {
      adoptAppearanceCandidate(production, command.candidateId, context);
      return "Adopted the reviewed candidate while preserving its exact provider-output and approval identities.";
    }
  }
}
