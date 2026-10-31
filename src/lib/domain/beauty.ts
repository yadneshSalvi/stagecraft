import type {
  BeautyApproval,
  BeautyPreview,
  BeautyRecipe,
  EvidenceState,
  Look,
  Production,
  ProductionCommand,
} from "../types";
import { findRecord, requireFact } from "./errors";
import { canonicalJson, fingerprint } from "./hash";
import { invalidateDetails } from "./details";

type BeautyCommand = Extract<
  ProductionCommand,
  {
    type:
      | "update_face_capture"
      | "withdraw_face_consent"
      | "update_beauty"
      | "add_beauty_preview"
      | "approve_beauty";
  }
>;
const sameScope = (left: string[], right: string[]) =>
  canonicalJson([...left].sort()) === canonicalJson([...right].sort());

export function getCurrentBeautyPreview(look: Look): BeautyPreview | undefined {
  const beauty = look.beauty;
  return (
    beauty &&
    [...beauty.previews]
      .reverse()
      .find(
        (preview) =>
          preview.lookId === look.id &&
          preview.beautyRevision === beauty.revision &&
          preview.performerId === look.performerId,
      )
  );
}

export function getCurrentBeautyApproval(
  look: Look,
): BeautyApproval | undefined {
  const preview = getCurrentBeautyPreview(look);
  return (
    preview &&
    [...look.beauty!.approvals]
      .reverse()
      .find(
        (approval) =>
          approval.state === "current" &&
          approval.lookId === look.id &&
          approval.previewId === preview.id &&
          approval.beautyRevision === look.beauty!.revision &&
          approval.performerId === look.performerId &&
          approval.faceCaptureVersion === preview.faceCaptureVersion &&
          sameScope(approval.sceneIds, look.sceneIds),
      )
  );
}

/** Deliberately excludes body capture, garment units, notes and garment recipe revision. */
export function beautyInputHash(
  production: Production,
  lookOrId: Look | string,
): string {
  const look =
    typeof lookOrId === "string"
      ? findRecord(production.looks, lookOrId, "Beauty look")
      : lookOrId;
  requireFact(
    !!look.beauty,
    "BEAUTY_RECIPE_REQUIRED",
    "Configure a separate beauty recipe before generating a beauty detail.",
  );
  const performer = findRecord(
    production.performers,
    look.performerId,
    "Beauty performer",
  );
  requireFact(
    !!performer.faceCapture?.imageUrl,
    "FACE_CAPTURE_REQUIRED",
    "A separately permitted face capture is required; a body portrait or crop is not silently substituted.",
  );
  const face = performer.faceCapture;
  return fingerprint({
    contract: "stagecraft-beauty-v1",
    lookId: look.id,
    performerId: performer.id,
    face: {
      imageUrl: face.imageUrl,
      assetId: face.assetId,
      version: face.version,
    },
    beauty: { revision: look.beauty.revision, recipe: look.beauty.recipe },
    fixedPolicy: {
      skinSmoothStrength: 0,
      skinSmoothColorIntensity: 0,
      lipMorphology: "unchanged",
    },
  });
}

export function validatedBeautyRecipe(recipe: BeautyRecipe): BeautyRecipe {
  requireFact(
    Object.keys(recipe).every((key) =>
      ["lipColor", "lipIntensity", "blushColor", "blushIntensity"].includes(
        key,
      ),
    ),
    "FIXED_BEAUTY_POLICY",
    "Only lip and blush colour/intensity are editable. Skin smoothing and lip morphology cannot be enabled through a beauty recipe.",
  );
  requireFact(
    /^#[0-9a-f]{6}$/i.test(recipe.lipColor) &&
      /^#[0-9a-f]{6}$/i.test(recipe.blushColor),
    "INVALID_BEAUTY_COLOR",
    "Choose six-digit hexadecimal lip and blush colours.",
  );
  requireFact(
    [recipe.lipIntensity, recipe.blushIntensity].every(
      (intensity) =>
        Number.isInteger(intensity) && intensity >= 0 && intensity <= 100,
    ),
    "INVALID_BEAUTY_INTENSITY",
    "Beauty intensity must be an integer from zero to one hundred. Skin smoothing and lip reshaping are fixed off.",
  );
  return {
    lipColor: recipe.lipColor.toUpperCase(),
    lipIntensity: recipe.lipIntensity,
    blushColor: recipe.blushColor.toUpperCase(),
    blushIntensity: recipe.blushIntensity,
  };
}

/** Changes the cloned working graph only; garment approvals and unit allocations stay intact. */
export function invalidateBeauty(
  production: Production,
  lookIds: string[],
  reason: string,
  advanceRevision: boolean,
  state: EvidenceState = "stale",
): void {
  for (const look of production.looks.filter((candidate) =>
    lookIds.includes(candidate.id),
  )) {
    if (!look.beauty) continue;
    if (advanceRevision) look.beauty.revision += 1;
    look.beauty.reviewReason = reason;
    for (const approval of look.beauty.approvals)
      if (approval.state === "current") {
        approval.state = state;
        approval.reason = reason;
      }
  }
  for (const pack of production.packs)
    if (
      pack.snapshot.looks.some(
        (look) => lookIds.includes(look.id) && !!look.beauty,
      )
    )
      pack.state = "superseded";
}

export function revokeFaceConsent(
  production: Production,
  performerId: string,
  now: string,
): void {
  const performer = findRecord(production.performers, performerId, "Performer");
  if (performer.faceCapture) {
    performer.faceCapture.consent = {
      ...performer.faceCapture.consent,
      granted: false,
      publicDemo: false,
      recordedAt: now,
    };
    performer.faceCapture.version += 1;
  }
  invalidateBeauty(
    production,
    production.looks
      .filter((look) => look.performerId === performerId)
      .map((look) => look.id),
    "Face-source permission was withdrawn. Beauty derivations and approvals are blocked; the garment source remains separately scoped.",
    true,
    "blocked",
  );
  invalidateDetails(
    production,
    production.looks
      .filter((look) => look.performerId === performerId)
      .map((look) => look.id),
    "Face-source permission was withdrawn; all face-derived independent details are blocked.",
    true,
    "blocked",
  );
}

function supersedeBeautyPacks(production: Production, lookId: string): void {
  for (const pack of production.packs)
    if (pack.snapshot.looks.some((look) => look.id === lookId))
      pack.state = "superseded";
}

export function applyBeautyCommand(
  production: Production,
  command: BeautyCommand,
  context: { now: string; makeId: (kind: string) => string },
): string {
  switch (command.type) {
    case "update_face_capture": {
      const performer = findRecord(
        production.performers,
        command.performerId,
        "Performer",
      );
      const face = structuredClone(command.faceCapture);
      requireFact(
        !face.consent.granted || !!face.imageUrl?.trim(),
        "FACE_CAPTURE_REQUIRED",
        "A face capture with processing permission needs its own source image.",
      );
      face.version = (performer.faceCapture?.version ?? 0) + 1;
      if (face.assetId) {
        delete face.librarySourceId;
        face.synthetic = false;
        face.consent.publicDemo = false;
      }
      performer.faceCapture = face;
      invalidateDetails(
        production,
        production.looks
          .filter((look) => look.performerId === performer.id)
          .map((look) => look.id),
        "Face capture changed; independent hair and necklace evidence must match the new source.",
        true,
        face.consent.granted ? "stale" : "blocked",
      );
      invalidateBeauty(
        production,
        production.looks
          .filter((look) => look.performerId === performer.id)
          .map((look) => look.id),
        face.consent.granted
          ? "Face capture changed. Generate and approve the separate beauty detail for these exact pixels."
          : "The face capture has no current processing permission. Beauty output is blocked.",
        true,
        face.consent.granted ? "stale" : "blocked",
      );
      return `Attached ${performer.name}'s separately scoped face capture version ${face.version}; body capture, garment recipe and fitting evidence were preserved.`;
    }
    case "withdraw_face_consent": {
      const performer = findRecord(
        production.performers,
        command.performerId,
        "Performer",
      );
      requireFact(
        !!performer.faceCapture,
        "FACE_CAPTURE_REQUIRED",
        "This performer has no separate face capture to withdraw.",
      );
      revokeFaceConsent(production, performer.id, context.now);
      return `Withdrew ${performer.name}'s face-source permission and beauty evidence; garment permission and approval remain separate.`;
    }
    case "update_beauty": {
      const look = findRecord(production.looks, command.lookId, "Look");
      const recipe = validatedBeautyRecipe(command.recipe);
      const previous = look.beauty;
      if (!previous)
        look.beauty = {
          revision: 1,
          recipe,
          previews: [],
          approvals: [],
          reviewReason:
            "A separate beauty detail has been configured and needs actual provider output and approval.",
        };
      else if (canonicalJson(previous.recipe) !== canonicalJson(recipe)) {
        previous.recipe = recipe;
        invalidateBeauty(
          production,
          [look.id],
          "The beauty recipe changed. Its exact face detail needs a fresh output and approval; the garment decision is preserved.",
          true,
        );
      }
      supersedeBeautyPacks(production, look.id);
      return `Saved ${look.title}'s separate beauty recipe revision ${look.beauty!.revision}; no garment appearance approval was inferred or invalidated.`;
    }
    case "add_beauty_preview": {
      const look = findRecord(production.looks, command.lookId, "Look");
      requireFact(
        !!look.beauty,
        "BEAUTY_RECIPE_REQUIRED",
        "Configure the separate beauty recipe first.",
      );
      const performer = findRecord(
        production.performers,
        look.performerId,
        "Beauty performer",
      );
      const face = performer.faceCapture;
      requireFact(
        !!face?.imageUrl && face.consent.granted,
        "FACE_CONSENT_REQUIRED",
        "A current separately permitted face capture is required for a beauty preview.",
        403,
      );
      const preview = command.preview;
      requireFact(
        !!preview.id.trim(),
        "ID_REQUIRED",
        "A beauty provider output needs a stable identity.",
      );
      requireFact(
        preview.provenance === "recorded_provider" ||
          preview.provenance === "live_provider",
        "PROVIDER_EVIDENCE_REQUIRED",
        "A face source or synthetic illustration is not an actual provider beauty result.",
      );
      requireFact(
        !production.looks.some(
          (candidate) =>
            candidate.previews.some((item) => item.id === preview.id) ||
            candidate.beauty?.previews.some((item) => item.id === preview.id),
        ),
        "DUPLICATE_ID",
        "This provider output identity is already recorded.",
        409,
      );
      requireFact(
        preview.lookId === look.id &&
          preview.beautyRevision === look.beauty.revision &&
          preview.performerId === performer.id &&
          preview.faceCaptureVersion === face.version &&
          preview.sourceImageUrl === face.imageUrl &&
          preview.inputHash === beautyInputHash(production, look),
        "STALE_BEAUTY_PREVIEW",
        "The beauty result belongs to a different performer, face capture or beauty recipe revision.",
        409,
      );
      requireFact(
        !!preview.imageUrl.trim() && preview.imageUrl !== face.imageUrl,
        "PREVIEW_OUTPUT_REQUIRED",
        "A beauty preview needs a distinct stored provider output.",
      );
      look.beauty.previews.push(structuredClone(preview));
      look.beauty.reviewReason =
        "Inspect the current face detail and record a separate makeup approval.";
      supersedeBeautyPacks(production, look.id);
      return `Attached ${preview.provenance === "recorded_provider" ? "recorded" : "live"} beauty detail for ${performer.name}; approval remains an explicit separate decision.`;
    }
    case "approve_beauty": {
      const look = findRecord(production.looks, command.lookId, "Look");
      requireFact(
        !!look.beauty,
        "BEAUTY_RECIPE_REQUIRED",
        "Configure the separate beauty recipe first.",
      );
      const performer = findRecord(
        production.performers,
        look.performerId,
        "Beauty performer",
      );
      const face = performer.faceCapture;
      requireFact(
        !!face?.imageUrl && face.consent.granted,
        "FACE_CONSENT_REQUIRED",
        "Current face-source permission is required for this beauty approval.",
        403,
      );
      const preview = findRecord(
        look.beauty.previews,
        command.previewId,
        "Beauty preview",
      );
      requireFact(
        preview.beautyRevision === look.beauty.revision &&
          preview.performerId === performer.id &&
          preview.faceCaptureVersion === face.version &&
          preview.sourceImageUrl === face.imageUrl &&
          preview.inputHash === beautyInputHash(production, look),
        "STALE_BEAUTY_PREVIEW",
        "Approve the exact current face capture and beauty recipe output.",
        409,
      );
      requireFact(
        !!command.approvedBy.trim() && !!command.rationale.trim(),
        "APPROVAL_RATIONALE_REQUIRED",
        "Record the named reviewer and rationale for this separate beauty detail.",
      );
      look.beauty.previews = [
        ...look.beauty.previews.filter((item) => item.id !== preview.id),
        preview,
      ];
      for (const approval of look.beauty.approvals)
        if (approval.state === "current") {
          approval.state = "historical";
          approval.reason =
            "Superseded by another exact beauty-output approval.";
        }
      look.beauty.approvals.push({
        id: context.makeId("beauty-approval"),
        lookId: look.id,
        beautyRevision: look.beauty.revision,
        previewId: preview.id,
        performerId: performer.id,
        faceCaptureVersion: face.version,
        sceneIds: [...look.sceneIds],
        approvedBy: command.approvedBy.trim(),
        rationale: command.rationale.trim(),
        approvedAt: context.now,
        state: "current",
        reason: null,
      });
      look.beauty.reviewReason = null;
      supersedeBeautyPacks(production, look.id);
      return `${command.approvedBy.trim()} approved the exact separate beauty detail for ${performer.name}; garment, fit and supplier decisions remain independent.`;
    }
  }
}
