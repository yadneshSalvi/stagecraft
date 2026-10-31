import type {
  AppearanceApproval,
  AppearanceCandidate,
  AppearanceRecipe,
  Look,
  Preview,
  Production,
} from "../types";
import { findRecord } from "./errors";
import { fingerprint } from "./hash";

const sorted = (values: string[]) => [...values].sort();
export const sameIds = (left: string[], right: string[]) =>
  JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

export function appearanceRecipeHash(recipe: AppearanceRecipe): string {
  return fingerprint({
    category: recipe.category,
    unitIds: sorted(recipe.unitIds),
  });
}

/** A decision includes current creative intent; provider pixels deliberately do not. */
export function appearanceIntentHash(
  production: Production,
  lookIds: string[],
): string {
  const looks = production.looks.filter((look) => lookIds.includes(look.id));
  return fingerprint({
    contract: "stagecraft-appearance-intent-v2",
    looks: looks
      .map((look) => ({
        id: look.id,
        characterId: look.characterId,
        silhouette: look.silhouette,
        sceneIds: sorted(look.sceneIds),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    characters: production.characters
      .filter((character) =>
        looks.some((look) => look.characterId === character.id),
      )
      .map(({ id, direction }) => ({ id, direction }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    scenes: production.scenes
      .filter((scene) => looks.some((look) => look.sceneIds.includes(scene.id)))
      .map((scene) => ({
        id: scene.id,
        storyDay: scene.storyDay,
        characterIds: sorted(scene.characterIds),
        requirements: scene.requirements.map(
          ({ id, characterId, text, explicit }) => ({
            id,
            characterId,
            text,
            explicit,
          }),
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function previewEvidenceHash(preview: Preview): string {
  return fingerprint(preview);
}

export function resolveAppearanceCandidate(
  production: Production,
  candidateOrId: AppearanceCandidate | string,
) {
  const candidate =
    typeof candidateOrId === "string"
      ? findRecord(
          production.appearanceCandidates ?? [],
          candidateOrId,
          "Appearance candidate",
        )
      : candidateOrId;
  const look = findRecord(
    production.looks,
    candidate.lookIds[0],
    "Candidate look",
  );
  const performer = findRecord(
    production.performers,
    candidate.performerId,
    "Candidate performer",
  );
  const units = sorted(candidate.recipe.unitIds).map((id) =>
    findRecord(production.units, id, "Candidate unit"),
  );
  return { candidate, look, performer, units };
}

export function candidateInputHash(
  production: Production,
  candidateOrId: AppearanceCandidate | string,
): string {
  const { candidate, performer, units } = resolveAppearanceCandidate(
    production,
    candidateOrId,
  );
  return fingerprint({
    contract: "stagecraft-candidate-provider-v2",
    source: {
      performerId: performer.id,
      captureVersion: performer.captureVersion,
      imageUrl: performer.imageUrl,
      assetId: performer.assetId,
    },
    category: candidate.recipe.category,
    garments: units.map(({ id, imageUrl, assetId, category }) => ({
      id,
      imageUrl,
      assetId,
      category,
    })),
  });
}

export function candidateIntentHash(
  production: Production,
  candidateOrId: AppearanceCandidate | string,
): string {
  const { candidate } = resolveAppearanceCandidate(production, candidateOrId);
  return appearanceIntentHash(production, candidate.lookIds);
}

export function candidateScopeCurrent(
  production: Production,
  candidate: AppearanceCandidate,
): boolean {
  const looks = production.looks.filter((look) =>
    candidate.lookIds.includes(look.id),
  );
  if (
    !looks.length ||
    looks.length !== candidate.lookIds.length ||
    new Set(looks.map((look) => look.characterId)).size !== 1
  )
    return false;
  const first = looks[0];
  const group = production.looks.filter((look) =>
    first.continuityGroupId
      ? look.continuityGroupId === first.continuityGroupId
      : look.id === first.id,
  );
  return (
    sameIds(
      group.map((look) => look.id),
      candidate.lookIds,
    ) &&
    sameIds(
      [...new Set(looks.flatMap((look) => look.sceneIds))],
      candidate.sceneIds,
    ) &&
    candidate.recipeHash === appearanceRecipeHash(candidate.recipe)
  );
}

export function getCurrentCandidatePreview(
  production: Production,
  candidateOrId: AppearanceCandidate | string,
): Preview | undefined {
  const { candidate, performer } = resolveAppearanceCandidate(
    production,
    candidateOrId,
  );
  if (
    !candidateScopeCurrent(production, candidate) ||
    !performer.consent.granted ||
    !performer.imageUrl ||
    performer.captureVersion !== candidate.captureVersion
  )
    return undefined;
  const inputHash = candidateInputHash(production, candidate);
  return [...candidate.previews]
    .reverse()
    .find(
      (preview) =>
        preview.candidateId === candidate.id &&
        preview.recipeHash === candidate.recipeHash &&
        sameIds(preview.scopeLookIds ?? [], candidate.lookIds) &&
        preview.performerId === performer.id &&
        preview.captureVersion === performer.captureVersion &&
        sameIds(preview.unitIds, candidate.recipe.unitIds) &&
        preview.sourceImageUrl === performer.imageUrl &&
        preview.inputHash === inputHash,
    );
}

export function getCurrentCandidateApproval(
  production: Production,
  candidateOrId: AppearanceCandidate | string,
): AppearanceApproval | undefined {
  const { candidate } = resolveAppearanceCandidate(production, candidateOrId);
  const preview = getCurrentCandidatePreview(production, candidate);
  if (!preview) return undefined;
  return [...candidate.approvals]
    .reverse()
    .find(
      (approval) =>
        approval.state === "current" &&
        approval.candidateId === candidate.id &&
        approval.previewId === preview.id &&
        approval.previewHash === previewEvidenceHash(preview) &&
        approval.recipeHash === candidate.recipeHash &&
        approval.performerId === candidate.performerId &&
        approval.captureVersion === candidate.captureVersion &&
        sameIds(approval.scopeLookIds ?? [], candidate.lookIds) &&
        sameIds(approval.sceneIds, candidate.sceneIds) &&
        approval.intentHash === candidateIntentHash(production, candidate),
    );
}

export function getCurrentPreview(
  look: Look,
  production?: Production,
): Preview | undefined {
  if (look.activeCandidateId) {
    const candidate = production?.appearanceCandidates?.find(
      (item) => item.id === look.activeCandidateId,
    );
    if (production && !candidate) return undefined;
    if (candidate) {
      if (
        candidate.performerId !== look.performerId ||
        candidate.recipeHash !== appearanceRecipeHash(look)
      )
        return undefined;
      return getCurrentCandidatePreview(production!, candidate);
    }
    return [...look.previews]
      .reverse()
      .find(
        (preview) =>
          preview.candidateId === look.activeCandidateId &&
          preview.recipeHash === appearanceRecipeHash(look) &&
          (preview.scopeLookIds ?? []).includes(look.id) &&
          preview.performerId === look.performerId &&
          sameIds(preview.unitIds, look.unitIds),
      );
  }
  return [...look.previews]
    .reverse()
    .find(
      (preview) =>
        preview.lookId === look.id &&
        preview.recipeRevision === look.revision &&
        preview.performerId === look.performerId &&
        sameIds(preview.unitIds, look.unitIds) &&
        (!production ||
          (production.performers.some(
            (performer) =>
              performer.id === look.performerId &&
              performer.consent.granted &&
              performer.captureVersion === preview.captureVersion,
          ) &&
            preview.inputHash === previewInputHash(production, look))),
    );
}

/** Approval belongs to the exact displayed output, never to a candidate's label. */
export function getCurrentApproval(
  look: Look,
  production?: Production,
): AppearanceApproval | undefined {
  const preview = getCurrentPreview(look, production);
  if (!preview) return undefined;
  if (look.activeCandidateId && production) {
    const candidate = production.appearanceCandidates?.find(
      (item) => item.id === look.activeCandidateId,
    );
    return candidate
      ? getCurrentCandidateApproval(production, candidate)
      : undefined;
  }
  return [...look.approvals]
    .reverse()
    .find(
      (approval) =>
        approval.state === "current" &&
        (approval.candidateId
          ? approval.candidateId === look.activeCandidateId &&
            (approval.scopeLookIds ?? []).includes(look.id)
          : approval.lookId === look.id) &&
        approval.previewId === preview.id &&
        (approval.candidateId
          ? approval.recipeHash === appearanceRecipeHash(look)
          : approval.recipeRevision === look.revision) &&
        approval.performerId === look.performerId &&
        approval.captureVersion === preview.captureVersion &&
        (approval.candidateId
          ? look.sceneIds.every((id) => approval.sceneIds.includes(id))
          : sameIds(approval.sceneIds, look.sceneIds)) &&
        (!approval.previewHash ||
          approval.previewHash === previewEvidenceHash(preview)) &&
        (!production ||
          !approval.intentHash ||
          approval.intentHash ===
            appearanceIntentHash(
              production,
              approval.scopeLookIds ?? [look.id],
            )),
    );
}

export interface ApprovedAppearanceChoice {
  id: string;
  lookIds: string[];
  recipe: AppearanceRecipe;
  candidateId?: string;
  evidence: Record<string, { approvalId: string; previewId: string }>;
}

export function continuityLookIds(
  production: Production,
  look: Look,
): string[] {
  return production.looks
    .filter((item) =>
      look.continuityGroupId
        ? item.continuityGroupId === look.continuityGroupId
        : item.id === look.id,
    )
    .map((item) => item.id)
    .sort();
}

/** Labels and substitute lists grant no permission; only exact current decisions do. */
export function getApprovedAppearanceChoices(
  production: Production,
  look: Look,
): ApprovedAppearanceChoice[] {
  const lookIds = continuityLookIds(production, look);
  const group = production.looks.filter((item) => lookIds.includes(item.id));
  const choices: ApprovedAppearanceChoice[] = [];
  if (
    group.every(
      (item) =>
        item.performerId === look.performerId &&
        appearanceRecipeHash(item) === appearanceRecipeHash(look) &&
        !!getCurrentApproval(item, production),
    )
  ) {
    choices.push({
      id: `active:${look.continuityGroupId ?? look.id}`,
      lookIds,
      recipe: { category: look.category, unitIds: [...look.unitIds] },
      candidateId: group.every(
        (item) => item.activeCandidateId === look.activeCandidateId,
      )
        ? look.activeCandidateId
        : undefined,
      evidence: Object.fromEntries(
        group.map((item) => {
          const approval = getCurrentApproval(item, production)!;
          return [
            item.id,
            { approvalId: approval.id, previewId: approval.previewId },
          ];
        }),
      ),
    });
  }
  for (const candidate of production.appearanceCandidates ?? []) {
    if (
      !sameIds(candidate.lookIds, lookIds) ||
      candidate.performerId !== look.performerId ||
      candidate.recipe.category !== look.category ||
      candidate.recipe.unitIds.length !== look.unitIds.length
    )
      continue;
    const approval = getCurrentCandidateApproval(production, candidate);
    if (
      !approval ||
      choices.some((choice) => choice.candidateId === candidate.id)
    )
      continue;
    choices.push({
      id: candidate.id,
      lookIds,
      recipe: candidate.recipe,
      candidateId: candidate.id,
      evidence: Object.fromEntries(
        lookIds.map((id) => [
          id,
          { approvalId: approval.id, previewId: approval.previewId },
        ]),
      ),
    });
  }
  return choices;
}

/** Operational price, custody and availability changes do not alter the pictured recipe. */
export function previewInputHash(
  production: Production,
  lookOrId: Look | string,
): string {
  const look =
    typeof lookOrId === "string"
      ? findRecord(production.looks, lookOrId, "Look")
      : lookOrId;
  if (look.activeCandidateId) {
    const candidate = production.appearanceCandidates?.find(
      (item) => item.id === look.activeCandidateId,
    );
    if (
      candidate &&
      candidate.performerId === look.performerId &&
      candidate.recipeHash === appearanceRecipeHash(look)
    )
      return candidateInputHash(production, candidate);
  }
  const performer = findRecord(
    production.performers,
    look.performerId,
    "Performer",
  );
  return fingerprint({
    contract: "stagecraft-preview-v1",
    lookId: look.id,
    source: {
      performerId: performer.id,
      captureVersion: performer.captureVersion,
      imageUrl: performer.imageUrl,
      assetId: performer.assetId,
    },
    recipe: {
      revision: look.revision,
      category: look.category,
      silhouette: look.silhouette,
      makeup: look.makeup,
      hair: look.hair,
      accessories: look.accessories,
      unitIds: sorted(look.unitIds),
    },
    garments: sorted(look.unitIds).map((id) => {
      const unit = findRecord(production.units, id, "Physical unit");
      return {
        id: unit.id,
        imageUrl: unit.imageUrl,
        assetId: unit.assetId,
        color: unit.color,
        material: unit.material,
        category: unit.category,
      };
    }),
  });
}

/** Includes fact versions, independent of proposal/history/event bookkeeping. */
export function allocationInputHash(production: Production): string {
  return fingerprint({
    contract: "stagecraft-allocation-v2-approved-choices",
    mode: production.mode,
    timeZone: production.timeZone,
    currency: production.currency,
    budgetCents: production.budgetCents,
    scenes: production.scenes,
    occurrences: production.occurrences,
    characters: production.characters,
    performers: production.performers.map(
      ({ id, captureVersion, consent, measurements }) => ({
        id,
        captureVersion,
        consent,
        measurements,
      }),
    ),
    looks: production.looks.map(
      ({
        id,
        characterId,
        performerId,
        revision,
        sceneIds,
        unitIds,
        preparationMinutes,
        preparationEvidence,
      }) => ({
        id,
        characterId,
        performerId,
        revision,
        sceneIds,
        unitIds,
        preparationMinutes,
        preparationEvidence,
      }),
    ),
    units: production.units,
    appearanceEvidence: production.looks.map((look) => ({
      id: look.id,
      activeCandidateId: look.activeCandidateId ?? null,
      continuityGroupId: look.continuityGroupId ?? null,
      approval: getCurrentApproval(look, production) ?? null,
      preview: getCurrentPreview(look, production) ?? null,
    })),
    candidateEvidence: (production.appearanceCandidates ?? []).map(
      (candidate) => ({
        id: candidate.id,
        recipe: candidate.recipe,
        scope: candidate.lookIds,
        performerId: candidate.performerId,
        captureVersion: candidate.captureVersion,
        approval: getCurrentCandidateApproval(production, candidate) ?? null,
        preview: getCurrentCandidatePreview(production, candidate) ?? null,
      }),
    ),
    transitions: production.transitions,
    sourcing: production.sourcing.map(
      ({
        id,
        unitIds,
        from,
        to,
        quoteCents,
        quoteValidUntil,
        status,
        stale,
        provenance,
        externalReference,
      }) => ({
        id,
        unitIds,
        from,
        to,
        quoteCents,
        quoteValidUntil,
        status,
        stale,
        provenance,
        externalReference,
      }),
    ),
  });
}

export function repairInputHash(production: Production): string {
  return fingerprint({
    allocation: allocationInputHash(production),
    looks: production.looks.map((look) => ({
      id: look.id,
      input: look.performerId ? previewInputHash(production, look) : null,
      approvals: look.approvals,
      beauty: look.beauty
        ? {
            plan: look.beauty,
            face:
              production.performers.find(
                (performer) => performer.id === look.performerId,
              )?.faceCapture ?? null,
          }
        : null,
    })),
  });
}
