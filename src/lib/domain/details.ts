import type {
  DetailApproval,
  DetailKind,
  DetailPreview,
  DetailRecipe,
  EvidenceState,
  Look,
  Production,
  ProductionCommand,
} from "../types";
import { findRecord, requireFact } from "./errors";
import { canonicalJson, fingerprint } from "./hash";
import { sameIds } from "./lineage";

type DetailCommand = Extract<
  ProductionCommand,
  { type: "update_detail" | "add_detail_preview" | "approve_detail" }
>;
const hairPresets = [
  "Jet Black",
  "Chocolate Brown",
  "Honey Blonde",
  "Platinum Blonde",
  "Ash Gray",
  "Rose Gold",
  "Burgundy",
  "Copper Red",
  "Lavender",
  "Teal Blue",
];

export function validatedDetailRecipe(
  production: Production,
  recipe: DetailRecipe,
): DetailRecipe {
  if (recipe.kind === "hair_color") {
    requireFact(
      hairPresets.includes(recipe.preset) &&
        Object.keys(recipe).every((key) => ["kind", "preset"].includes(key)),
      "INVALID_HAIR_RECIPE",
      "Choose an available full hair-colour preset. This operation does not establish hair length, cut or a physical wig.",
    );
    return { kind: "hair_color", preset: recipe.preset };
  }
  requireFact(
    recipe.kind === "necklace" &&
      typeof recipe.removeBackground === "boolean" &&
      Object.keys(recipe).every((key) =>
        ["kind", "referenceId", "removeBackground"].includes(key),
      ),
    "INVALID_ACCESSORY_RECIPE",
    "Choose a registered necklace reference and its background-removal setting.",
  );
  findRecord(
    production.detailReferences ?? [],
    recipe.referenceId,
    "Necklace reference",
  );
  return {
    kind: "necklace",
    referenceId: recipe.referenceId,
    removeBackground: recipe.removeBackground,
  };
}

export function detailInputHash(
  production: Production,
  lookOrId: Look | string,
  kind: DetailKind,
): string {
  const look =
    typeof lookOrId === "string"
      ? findRecord(production.looks, lookOrId, "Detail look")
      : lookOrId;
  const detail = look.details?.find((item) => item.kind === kind);
  requireFact(
    !!detail,
    "DETAIL_RECIPE_REQUIRED",
    "Configure this independent detail recipe first.",
  );
  const performer = findRecord(
    production.performers,
    look.performerId,
    "Detail performer",
  );
  const face = performer.faceCapture;
  requireFact(
    !!face?.imageUrl,
    "FACE_CAPTURE_REQUIRED",
    "A separately permitted face capture containing the relevant hair or neckline is required.",
  );
  const recipe = validatedDetailRecipe(production, detail.recipe);
  const reference =
    recipe.kind === "necklace"
      ? findRecord(
          production.detailReferences ?? [],
          recipe.referenceId,
          "Necklace reference",
        )
      : null;
  return fingerprint({
    contract: "stagecraft-independent-detail-v1",
    lookId: look.id,
    performerId: performer.id,
    face: {
      version: face.version,
      imageUrl: face.imageUrl,
      assetId: face.assetId,
    },
    kind,
    revision: detail.revision,
    recipe,
    reference: reference
      ? {
          id: reference.id,
          imageUrl: reference.imageUrl,
          assetId: reference.assetId,
        }
      : null,
  });
}

export function detailIntentHash(
  production: Production,
  look: Look,
  kind: DetailKind,
): string {
  const character = production.characters.find(
    (item) => item.id === look.characterId,
  );
  return fingerprint({
    kind,
    lookId: look.id,
    characterId: look.characterId,
    direction: character?.direction,
    scenes: production.scenes
      .filter((scene) => look.sceneIds.includes(scene.id))
      .map((scene) => ({
        id: scene.id,
        storyDay: scene.storyDay,
        requirements: scene.requirements
          .filter((requirement) => requirement.characterId === look.characterId)
          .map(({ id, text, explicit }) => ({ id, text, explicit })),
      })),
  });
}

export function getCurrentDetailPreview(
  look: Look,
  kind: DetailKind,
  production?: Production,
): DetailPreview | undefined {
  const detail = look.details?.find((item) => item.kind === kind);
  if (!detail) return undefined;
  const face = production?.performers.find(
    (item) => item.id === look.performerId,
  )?.faceCapture;
  if (production && (!face?.consent.granted || !face.imageUrl))
    return undefined;
  return [...detail.previews]
    .reverse()
    .find(
      (preview) =>
        preview.lookId === look.id &&
        preview.kind === kind &&
        preview.detailRevision === detail.revision &&
        preview.performerId === look.performerId &&
        (!production ||
          (preview.faceCaptureVersion === face!.version &&
            preview.sourceImageUrl === face!.imageUrl &&
            preview.inputHash === detailInputHash(production, look, kind))),
    );
}

export function getCurrentDetailApproval(
  look: Look,
  kind: DetailKind,
  production?: Production,
): DetailApproval | undefined {
  const detail = look.details?.find((item) => item.kind === kind);
  const preview = getCurrentDetailPreview(look, kind, production);
  if (!detail || !preview) return undefined;
  return [...detail.approvals]
    .reverse()
    .find(
      (approval) =>
        approval.state === "current" &&
        approval.lookId === look.id &&
        approval.kind === kind &&
        approval.detailRevision === detail.revision &&
        approval.previewId === preview.id &&
        approval.performerId === look.performerId &&
        approval.faceCaptureVersion === preview.faceCaptureVersion &&
        sameIds(approval.sceneIds, look.sceneIds) &&
        approval.previewHash === fingerprint(preview) &&
        (!production ||
          approval.intentHash === detailIntentHash(production, look, kind)),
    );
}

export function invalidateDetails(
  production: Production,
  lookIds: string[],
  reason: string,
  advanceRevision: boolean,
  state: EvidenceState = "stale",
): void {
  for (const look of production.looks.filter((item) =>
    lookIds.includes(item.id),
  ))
    for (const detail of look.details ?? []) {
      if (advanceRevision) detail.revision++;
      detail.reviewReason = reason;
      for (const approval of detail.approvals)
        if (approval.state === "current") {
          approval.state = state;
          approval.reason = reason;
        }
    }
  for (const pack of production.packs)
    if (
      pack.snapshot.looks.some(
        (look) => lookIds.includes(look.id) && look.details?.length,
      )
    )
      pack.state = "superseded";
}

export function applyDetailCommand(
  production: Production,
  command: DetailCommand,
  context: { now: string; makeId: (kind: string) => string },
): string {
  const look = findRecord(production.looks, command.lookId, "Look");
  if (command.type === "update_detail") {
    const recipe = validatedDetailRecipe(production, command.recipe);
    look.details ??= [];
    let detail = look.details.find((item) => item.kind === recipe.kind);
    if (!detail) {
      detail = {
        kind: recipe.kind,
        revision: 1,
        recipe,
        previews: [],
        approvals: [],
        reviewReason:
          "Independent detail configured; an actual matching provider output and explicit decision are required.",
      };
      look.details.push(detail);
    } else if (canonicalJson(detail.recipe) !== canonicalJson(recipe)) {
      detail.recipe = recipe;
      detail.revision++;
      for (const approval of detail.approvals)
        if (approval.state === "current") {
          approval.state = "stale";
          approval.reason = "This independent detail recipe changed.";
        }
      detail.reviewReason =
        "This detail recipe changed; review its own new output. Garment and other face-detail approvals remain separate.";
    }
    for (const pack of production.packs)
      if (pack.snapshot.looks.some((item) => item.id === look.id))
        pack.state = "superseded";
    return `Saved the independent ${recipe.kind === "hair_color" ? "hair colour" : "necklace"} recipe; garment and makeup decisions were preserved.`;
  }
  const detail = look.details?.find((item) => item.kind === command.kind);
  requireFact(
    !!detail,
    "DETAIL_RECIPE_REQUIRED",
    "Configure the independent hair-colour or necklace detail first.",
  );
  const face = findRecord(
    production.performers,
    look.performerId,
    "Detail performer",
  ).faceCapture;
  requireFact(
    !!face?.imageUrl && face.consent.granted,
    "FACE_CONSENT_REQUIRED",
    "This detail needs its own current permitted face source.",
    403,
  );
  if (command.type === "add_detail_preview") {
    const preview = command.preview;
    requireFact(
      !production.looks.some(
        (item) =>
          item.previews.some((output) => output.id === preview.id) ||
          item.beauty?.previews.some((output) => output.id === preview.id) ||
          item.details?.some((plan) =>
            plan.previews.some((output) => output.id === preview.id),
          ),
      ) &&
        !(production.appearanceCandidates ?? []).some((candidate) =>
          candidate.previews.some((output) => output.id === preview.id),
        ),
      "DUPLICATE_ID",
      "This provider output identity is already recorded.",
      409,
    );
    requireFact(
      !!preview.id.trim() &&
        preview.lookId === look.id &&
        preview.kind === detail.kind &&
        preview.detailRevision === detail.revision &&
        preview.performerId === look.performerId &&
        preview.faceCaptureVersion === face.version &&
        preview.sourceImageUrl === face.imageUrl &&
        preview.inputHash === detailInputHash(production, look, detail.kind),
      "STALE_DETAIL_PREVIEW",
      "The detail output belongs to a different kind, performer, face capture or exact recipe.",
      409,
    );
    requireFact(
      (preview.provenance === "recorded_provider" ||
        preview.provenance === "live_provider") &&
        !!preview.imageUrl.trim() &&
        preview.imageUrl !== preview.sourceImageUrl,
      "PROVIDER_EVIDENCE_REQUIRED",
      "A source image or illustration cannot be attached as actual provider detail output.",
    );
    detail.previews.push(structuredClone(preview));
    detail.reviewReason =
      "Inspect this exact independent detail and record its own approval.";
  } else {
    const selected = findRecord(
      detail.previews,
      command.previewId,
      "Independent detail preview",
    );
    detail.previews = [
      ...detail.previews.filter((preview) => preview.id !== selected.id),
      selected,
    ];
    requireFact(
      getCurrentDetailPreview(look, detail.kind, production)?.id ===
        selected.id,
      "STALE_DETAIL_PREVIEW",
      "Choose a detail output for the exact current source and recipe.",
      409,
    );
    requireFact(
      !!command.approvedBy.trim() && !!command.rationale.trim(),
      "APPROVAL_RATIONALE_REQUIRED",
      "Record the named reviewer and rationale for this independent detail.",
    );
    for (const approval of detail.approvals)
      if (approval.state === "current") {
        approval.state = "historical";
        approval.reason = "Superseded by a new explicit detail decision.";
      }
    detail.approvals.push({
      id: context.makeId(`${detail.kind}-approval`),
      lookId: look.id,
      kind: detail.kind,
      detailRevision: detail.revision,
      previewId: selected.id,
      performerId: look.performerId,
      faceCaptureVersion: face.version,
      sceneIds: [...look.sceneIds],
      approvedBy: command.approvedBy.trim(),
      rationale: command.rationale.trim(),
      approvedAt: context.now,
      state: "current",
      reason: null,
      intentHash: detailIntentHash(production, look, detail.kind),
      previewHash: fingerprint(selected),
      decisionSource: "manual",
    });
    detail.reviewReason = null;
  }
  for (const pack of production.packs)
    if (pack.snapshot.looks.some((item) => item.id === look.id))
      pack.state = "superseded";
  return command.type === "add_detail_preview"
    ? "Attached actual independent detail evidence; no approval was inferred."
    : "Recorded the exact independent detail decision; physical hair, wig and jewellery checks remain separate.";
}
