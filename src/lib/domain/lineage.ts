import type { AppearanceApproval, Look, Preview, Production } from "../types";
import { findRecord } from "./errors";
import { fingerprint } from "./hash";

const sorted = (values: string[]) => [...values].sort();
export const sameIds = (left: string[], right: string[]) =>
  JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

export function getCurrentPreview(look: Look): Preview | undefined {
  return [...look.previews]
    .reverse()
    .find(
      (preview) =>
        preview.lookId === look.id &&
        preview.recipeRevision === look.revision &&
        preview.performerId === look.performerId &&
        sameIds(preview.unitIds, look.unitIds),
    );
}

/** Approval belongs to the exact displayed output, never to a candidate's label. */
export function getCurrentApproval(look: Look): AppearanceApproval | undefined {
  const preview = getCurrentPreview(look);
  if (!preview) return undefined;
  return [...look.approvals]
    .reverse()
    .find(
      (approval) =>
        approval.state === "current" &&
        approval.lookId === look.id &&
        approval.previewId === preview.id &&
        approval.recipeRevision === look.revision &&
        approval.performerId === look.performerId &&
        approval.captureVersion === preview.captureVersion &&
        sameIds(approval.sceneIds, look.sceneIds),
    );
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
    contract: "stagecraft-allocation-v1",
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
