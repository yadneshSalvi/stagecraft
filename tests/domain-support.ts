import legacy from "./fixtures/pre-review-production.json";
import type {
  AppearanceCandidate,
  Preview,
  Production,
  ProductionCommand,
} from "@/lib/types";
import {
  applyCommand,
  candidateInputHash,
  getCurrentApproval,
  previewInputHash,
} from "@/lib/domain";
export const TEST_NOW = "2026-10-31T12:00:00.000Z";
export const legacyExample = (): Production =>
  structuredClone(legacy.example) as Production;
export const command = (
  production: Production,
  value: ProductionCommand,
): Production =>
  applyCommand(production, value, {
    actor: "Synthetic software evaluator",
    now: TEST_NOW,
  });
/** Test doubles only. No provider task was run and these records never ship in app fixtures. */
export function doubleOutput(
  production: Production,
  lookId: string,
  suffix = "double",
): Preview {
  const look = production.looks.find((item) => item.id === lookId)!;
  const performer = production.performers.find(
    (item) => item.id === look.performerId,
  )!;
  return {
    id: `test-${look.id}-${look.revision}-${production.revision}-${suffix}`,
    lookId: look.id,
    recipeRevision: look.revision,
    performerId: performer.id,
    captureVersion: performer.captureVersion,
    imageUrl: `/test-only/${look.id}-${suffix}.webp`,
    assetId: null,
    sourceImageUrl: performer.imageUrl!,
    unitIds: [...look.unitIds],
    operation: "Schema-valid test double; no provider call",
    provenance: "recorded_provider",
    createdAt: TEST_NOW,
    inputHash: previewInputHash(production, look),
    estimatedUnits: 0,
    inspectionNotes: "Test double, not provider evidence.",
  };
}
export function approveManaged(production: Production): Production {
  let p = production;
  for (const look of p.looks) {
    if (getCurrentApproval(look, p)) continue;
    if (look.activeCandidateId) continue;
    const preview = doubleOutput(p, look.id);
    p = command(p, { type: "add_preview", lookId: look.id, preview });
    p = command(p, {
      type: "approve_look",
      lookId: look.id,
      previewId: preview.id,
      approvedBy: "Synthetic software evaluator",
      rationale: "Test-only exact appearance decision.",
    });
  }
  return p;
}
export function candidateDouble(
  production: Production,
  candidate: AppearanceCandidate,
): Preview {
  const performer = production.performers.find(
    (item) => item.id === candidate.performerId,
  )!;
  return {
    id: `test-${candidate.id}-${production.revision}`,
    lookId: candidate.lookIds[0],
    recipeRevision: 1,
    performerId: candidate.performerId,
    captureVersion: candidate.captureVersion,
    imageUrl: `/test-only/${candidate.id}.webp`,
    assetId: null,
    sourceImageUrl: performer.imageUrl!,
    unitIds: [...candidate.recipe.unitIds],
    operation: "Candidate test double; no provider call",
    provenance: "recorded_provider",
    createdAt: TEST_NOW,
    inputHash: candidateInputHash(production, candidate),
    estimatedUnits: 0,
    inspectionNotes: "Test only.",
    candidateId: candidate.id,
    recipeHash: candidate.recipeHash,
    scopeLookIds: [...candidate.lookIds],
  };
}
export function reviewCandidate(
  production: Production,
  candidateId: string,
): Production {
  const candidate = production.appearanceCandidates!.find(
    (item) => item.id === candidateId,
  )!;
  const preview = candidateDouble(production, candidate);
  const p = command(production, {
    type: "add_candidate_preview",
    candidateId,
    preview,
  });
  return command(p, {
    type: "approve_candidate",
    candidateId,
    previewId: preview.id,
    approvedBy: "Synthetic software evaluator",
    rationale: "Test-only exact candidate and creative-intent decision.",
  });
}
export function reviewedRepair(
  production: Production,
  value: Extract<ProductionCommand, { type: "propose_change" }>,
): Production {
  let p = command(approveManaged(production), value);
  for (const candidateId of p.proposals
    .at(-1)!
    .options.flatMap((option) => option.candidateIds ?? []))
    p = reviewCandidate(p, candidateId);
  return command(p, value);
}
