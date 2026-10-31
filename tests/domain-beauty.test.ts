import { describe, expect, it } from "vitest";
import type {
  BeautyPreview,
  BeautyRecipe,
  Preview,
  Production,
  ProductionCommand,
} from "@/lib/types";
import {
  applyCommand,
  beautyInputHash,
  createExampleProduction,
  DomainError,
  getCurrentApproval,
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
  getCurrentPreview,
  getReadiness,
  previewChange,
  previewInputHash,
} from "@/lib/domain";

const NOW = "2026-10-31T12:00:00.000Z";
const example = () => createExampleProduction("beauty-test", NOW);
const run = (production: Production, command: ProductionCommand) =>
  applyCommand(production, command, {
    actor: "Synthetic software evaluator",
    now: NOW,
  });
const nora = (production: Production) =>
  production.looks.find((look) => look.id === "look-nora")!;
const ada = (production: Production) =>
  production.performers.find((performer) => performer.id === "performer-ada")!;

/** Schema-valid test doubles only: never shipped or seeded as real provider output. */
function garment(production: Production, lookId = "look-nora"): Preview {
  const look = production.looks.find((candidate) => candidate.id === lookId)!;
  const performer = production.performers.find(
    (candidate) => candidate.id === look.performerId,
  )!;
  return {
    id: `garment-double-${look.id}-${look.revision}`,
    lookId: look.id,
    recipeRevision: look.revision,
    performerId: performer.id,
    captureVersion: performer.captureVersion,
    imageUrl: `/test-only/garment-${look.id}-${look.revision}.webp`,
    assetId: null,
    sourceImageUrl: performer.imageUrl!,
    unitIds: [...look.unitIds],
    operation: "Test double only",
    provenance: "recorded_provider",
    createdAt: NOW,
    inputHash: previewInputHash(production, look),
    estimatedUnits: 0,
    inspectionNotes: "Not a provider-call claim.",
  };
}

function face(production: Production, suffix = "a"): BeautyPreview {
  const look = nora(production),
    performer = production.performers.find(
      (candidate) => candidate.id === look.performerId,
    )!;
  return {
    id: `beauty-double-${look.beauty!.revision}-${suffix}`,
    lookId: look.id,
    beautyRevision: look.beauty!.revision,
    performerId: performer.id,
    faceCaptureVersion: performer.faceCapture!.version,
    imageUrl: `/test-only/beauty-${look.beauty!.revision}-${suffix}.webp`,
    assetId: null,
    sourceImageUrl: performer.faceCapture!.imageUrl!,
    operation: "Test double only; smoothing and morphology disabled",
    provenance: "recorded_provider",
    createdAt: NOW,
    inputHash: beautyInputHash(production, look),
    estimatedUnits: 0,
    inspectionNotes: "Not evidence of an actual provider operation.",
  };
}

function approveGarment(
  production: Production,
  lookId = "look-nora",
): Production {
  const preview = garment(production, lookId);
  return run(run(production, { type: "add_preview", lookId, preview }), {
    type: "approve_look",
    lookId,
    previewId: preview.id,
    approvedBy: "Synthetic garment evaluator",
    rationale:
      "Approve this exact test output; no physical outcome is claimed.",
  });
}

function approveBeauty(production: Production): Production {
  const preview = face(production);
  return run(
    run(production, {
      type: "add_beauty_preview",
      lookId: "look-nora",
      preview,
    }),
    {
      type: "approve_beauty",
      lookId: "look-nora",
      previewId: preview.id,
      approvedBy: "Synthetic beauty evaluator",
      rationale:
        "Approve this exact test face detail; no participant feedback is claimed.",
    },
  );
}

const approved = () => approveBeauty(approveGarment(example()));
function code(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).code;
  }
  throw new Error("Expected an actionable rejection.");
}

describe("independent beauty inputs and exact approval", () => {
  it("configures only Nora's separately permitted face detail without inventing output", () => {
    const production = example();
    expect(nora(production).beauty).toMatchObject({
      revision: 1,
      recipe: {
        lipColor: "#853E5D",
        lipIntensity: 40,
        blushColor: "#9D526C",
        blushIntensity: 30,
      },
      previews: [],
      approvals: [],
    });
    expect(ada(production).faceCapture).toMatchObject({
      imageUrl: "/assets/cast/ada-face.webp",
      version: 1,
      synthetic: true,
      consent: { granted: true, publicDemo: true },
    });
    expect(
      production.performers.find(
        (performer) => performer.id === "performer-celeste",
      )!.faceCapture?.imageUrl,
    ).toBe("/assets/cast/celeste-face.webp");
    expect(production.looks.slice(1).every((look) => !look.beauty)).toBe(true);
    expect(getCurrentBeautyPreview(nora(production))).toBeUndefined();
    expect(getReadiness(production, NOW)).toMatchObject({
      appearanceApproved: 0,
      beautyApproved: 0,
      beautyTotal: 1,
      ready: false,
    });
    delete ada(production).faceCapture;
    expect(code(() => beautyInputHash(production, "look-nora"))).toBe(
      "FACE_CAPTURE_REQUIRED",
    );
  });

  it("rejects wrong performer, face, revision and source rather than substituting a body image", () => {
    const production = example();
    for (const patch of [
      { performerId: "performer-celeste" },
      { faceCaptureVersion: 10 },
      { beautyRevision: 10 },
      { inputHash: "forged" },
      { sourceImageUrl: ada(production).imageUrl! },
    ]) {
      expect(
        code(() =>
          run(production, {
            type: "add_beauty_preview",
            lookId: "look-nora",
            preview: { ...face(production), ...patch },
          }),
        ),
      ).toBe("STALE_BEAUTY_PREVIEW");
    }
    const missing = structuredClone(production);
    delete ada(missing).faceCapture;
    expect(
      code(() =>
        run(missing, {
          type: "add_beauty_preview",
          lookId: "look-nora",
          preview: face(production),
        }),
      ),
    ).toBe("FACE_CONSENT_REQUIRED");
    expect(
      code(() =>
        run(production, {
          type: "add_beauty_preview",
          lookId: "look-nora",
          preview: {
            ...face(production),
            imageUrl: ada(production).faceCapture!.imageUrl!,
          },
        }),
      ),
    ).toBe("PREVIEW_OUTPUT_REQUIRED");
  });

  it("never inherits beauty approval onto a second output of the same recipe", () => {
    const baseline = approved();
    const approval = structuredClone(getCurrentBeautyApproval(nora(baseline)));
    const changed = run(baseline, {
      type: "add_beauty_preview",
      lookId: "look-nora",
      preview: face(baseline, "b"),
    });
    expect(getCurrentBeautyPreview(nora(changed))!.id).toMatch(/-b$/);
    expect(getCurrentBeautyApproval(nora(changed))).toBeUndefined();
    expect(getCurrentBeautyApproval(nora(baseline))).toEqual(approval);
    expect(getCurrentApproval(nora(changed))).toEqual(
      getCurrentApproval(nora(baseline)),
    );
  });

  it("validates editable recipe values and cannot turn on smoothing or reshape lips", () => {
    const production = approved(),
      recipe = nora(production).beauty!.recipe;
    expect(
      code(() =>
        run(production, {
          type: "update_beauty",
          lookId: "look-nora",
          recipe: { ...recipe, lipIntensity: 101 },
        }),
      ),
    ).toBe("INVALID_BEAUTY_INTENSITY");
    expect(
      code(() =>
        run(production, {
          type: "update_beauty",
          lookId: "look-nora",
          recipe: { ...recipe, blushIntensity: 0.5 },
        }),
      ),
    ).toBe("INVALID_BEAUTY_INTENSITY");
    expect(
      code(() =>
        run(production, {
          type: "update_beauty",
          lookId: "look-nora",
          recipe: { ...recipe, lipColor: "red" },
        }),
      ),
    ).toBe("INVALID_BEAUTY_COLOR");
    expect(
      code(() =>
        run(production, {
          type: "update_beauty",
          lookId: "look-nora",
          recipe: { ...recipe, skinSmoothStrength: 100 } as BeautyRecipe,
        }),
      ),
    ).toBe("FIXED_BEAUTY_POLICY");
  });
});

describe("bounded beauty invalidation", () => {
  it("a beauty recipe change preserves exact garment approval and adopted units", () => {
    let baseline = approved();
    baseline = run(baseline, { type: "solve_allocation" });
    baseline = run(baseline, {
      type: "adopt_allocation",
      inputHash: baseline.allocationResult!.inputHash,
    });
    const changed = run(baseline, {
      type: "update_beauty",
      lookId: "look-nora",
      recipe: {
        ...nora(baseline).beauty!.recipe,
        lipColor: "#76334D",
        lipIntensity: 55,
      },
    });
    expect(nora(changed).revision).toBe(nora(baseline).revision);
    expect(nora(changed).beauty!.revision).toBe(2);
    expect(getCurrentBeautyApproval(nora(changed))).toBeUndefined();
    expect(nora(changed).beauty!.approvals[0].state).toBe("stale");
    expect(getCurrentApproval(nora(changed))).toEqual(
      getCurrentApproval(nora(baseline)),
    );
    expect(getCurrentPreview(nora(changed))).toEqual(
      getCurrentPreview(nora(baseline)),
    );
    expect(changed.allocations).toEqual(baseline.allocations);
    expect(changed.units).toEqual(baseline.units);
  });

  it("a private face replacement invalidates beauty only and gets its own permission/version", () => {
    const baseline = approved();
    const changed = run(baseline, {
      type: "update_face_capture",
      performerId: "performer-ada",
      faceCapture: {
        ...ada(baseline).faceCapture!,
        imageUrl: "/api/assets/private-face",
        assetId: "private-face",
        version: 99,
        synthetic: true,
        consent: {
          granted: true,
          purpose: "Private face-detail processing only",
          publicDemo: true,
          recordedAt: NOW,
        },
      },
    });
    expect(ada(changed).faceCapture).toMatchObject({
      version: 2,
      synthetic: false,
      consent: { granted: true, publicDemo: false },
    });
    expect(ada(changed).captureVersion).toBe(ada(baseline).captureVersion);
    expect(ada(changed).synthetic).toBe(true);
    expect(nora(changed).revision).toBe(nora(baseline).revision);
    expect(getCurrentApproval(nora(changed))).toEqual(
      getCurrentApproval(nora(baseline)),
    );
    expect(getCurrentBeautyPreview(nora(changed))).toBeUndefined();
    expect(ada(baseline).faceCapture!.imageUrl).toBe(
      "/assets/cast/ada-face.webp",
    );
  });

  it("a body capture replacement preserves the exact independent face detail", () => {
    const baseline = approved();
    const hash = beautyInputHash(baseline, "look-nora");
    const changed = run(baseline, {
      type: "update_performer",
      performerId: "performer-ada",
      imageUrl: "/api/assets/new-body",
      assetId: "new-body",
      consent: {
        granted: true,
        purpose: "Private body capture for garment previews",
        publicDemo: false,
        recordedAt: NOW,
      },
    });
    expect(getCurrentApproval(nora(changed))).toBeUndefined();
    expect(getCurrentBeautyApproval(nora(changed))).toEqual(
      getCurrentBeautyApproval(nora(baseline)),
    );
    expect(getCurrentBeautyPreview(nora(changed))).toEqual(
      getCurrentBeautyPreview(nora(baseline)),
    );
    expect(beautyInputHash(changed, "look-nora")).toBe(hash);
    expect(ada(changed).faceCapture).toEqual(ada(baseline).faceCapture);
  });

  it("a garment substitution retains valid beauty evidence and declares that preservation", () => {
    const baseline = approved();
    const beautyApproval = getCurrentBeautyApproval(nora(baseline))!;
    const impact = previewChange(
      baseline,
      "garment_unavailable",
      "unit-coat-oxblood",
      "unit-coat-charcoal",
    );
    expect(impact.invalidatedBeautyApprovalIds).toEqual([]);
    expect(impact.preservedBeautyApprovalIds).toEqual([beautyApproval.id]);
    const proposed = run(baseline, {
      type: "propose_change",
      kind: "garment_unavailable",
      subjectId: "unit-coat-oxblood",
      replacementId: "unit-coat-charcoal",
      seeded: true,
    });
    const proposal = proposed.proposals.at(-1)!;
    const changed = run(proposed, {
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId: proposal.options[0].id,
    });
    expect(getCurrentApproval(nora(changed))).toBeUndefined();
    expect(getCurrentBeautyApproval(nora(changed))).toEqual(beautyApproval);
    expect(beautyInputHash(changed, "look-nora")).toBe(
      beautyInputHash(baseline, "look-nora"),
    );
    expect(nora(changed).beauty).toEqual(nora(baseline).beauty);
  });

  it("a recast invalidates both and requires the replacement's own face source", () => {
    const baseline = approved();
    const proposed = run(baseline, {
      type: "propose_change",
      kind: "recast",
      subjectId: "char-nora",
      replacementId: "performer-celeste",
      seeded: true,
    });
    const proposal = proposed.proposals.at(-1)!;
    expect(proposal.impact.invalidatedBeautyApprovalIds).toEqual([
      getCurrentBeautyApproval(nora(baseline))!.id,
    ]);
    const changed = run(proposed, {
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId: proposal.options[0].id,
    });
    expect(getCurrentApproval(nora(changed))).toBeUndefined();
    expect(getCurrentBeautyApproval(nora(changed))).toBeUndefined();
    expect(nora(changed).beauty!.approvals[0]).toMatchObject({
      state: "stale",
      performerId: "performer-ada",
      faceCaptureVersion: 1,
    });
    expect(changed.characters[0].direction).toEqual(
      baseline.characters[0].direction,
    );
    const fresh = approveBeauty(changed);
    expect(getCurrentBeautyApproval(nora(fresh))).toMatchObject({
      performerId: "performer-celeste",
      faceCaptureVersion: 1,
      beautyRevision: 2,
    });
    expect(nora(fresh).beauty!.previews.at(-1)!.sourceImageUrl).toBe(
      "/assets/cast/celeste-face.webp",
    );
  });
});

describe("source-scoped consent and frozen beauty handoffs", () => {
  it("face-only withdrawal retains garment approval and omits face pixels from a new working pack", () => {
    let baseline = approved();
    baseline = run(baseline, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Before face withdrawal",
    });
    const frozen = structuredClone(baseline.packs[0].snapshot);
    const withdrawn = run(baseline, {
      type: "withdraw_face_consent",
      performerId: "performer-ada",
    });
    expect(ada(withdrawn).consent.granted).toBe(true);
    expect(ada(withdrawn).faceCapture!.consent.granted).toBe(false);
    expect(getCurrentApproval(nora(withdrawn))).toEqual(
      getCurrentApproval(nora(baseline)),
    );
    expect(nora(withdrawn).beauty!.approvals[0].state).toBe("blocked");
    expect(getCurrentBeautyPreview(nora(withdrawn))).toBeUndefined();
    expect(
      code(() =>
        run(withdrawn, {
          type: "add_beauty_preview",
          lookId: "look-nora",
          preview: face(withdrawn),
        }),
      ),
    ).toBe("FACE_CONSENT_REQUIRED");
    expect(withdrawn.packs[0].state).toBe("superseded");
    expect(withdrawn.packs[0].snapshot).toEqual(frozen);
    const packed = run(withdrawn, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Garment only while face permission is missing",
    });
    const snapshot = packed.packs.at(-1)!.snapshot;
    expect(snapshot.performers[0].imageUrl).toBe(ada(withdrawn).imageUrl);
    expect(snapshot.performers[0].faceCapture!.imageUrl).toBeNull();
    expect(snapshot.looks[0].previews).toEqual(nora(withdrawn).previews);
    expect(snapshot.looks[0].beauty!.previews).toEqual([]);
    expect(packed.packs.at(-1)!.warnings.join(" ")).toMatch(
      /face source is missing or withdrawn/,
    );
    expect(packed.packs.at(-1)!.title).toMatch(/^Working pack/);
  });

  it("whole-performer withdrawal cascades both scopes and blocks new derivations", () => {
    const baseline = approved();
    const withdrawn = run(baseline, {
      type: "withdraw_consent",
      performerId: "performer-ada",
    });
    expect(ada(withdrawn).consent.granted).toBe(false);
    expect(ada(withdrawn).faceCapture!.consent.granted).toBe(false);
    expect(ada(withdrawn).captureVersion).toBe(2);
    expect(ada(withdrawn).faceCapture!.version).toBe(2);
    expect(getCurrentApproval(nora(withdrawn))).toBeUndefined();
    expect(getCurrentBeautyApproval(nora(withdrawn))).toBeUndefined();
    expect(nora(withdrawn).approvals[0].state).toBe("blocked");
    expect(nora(withdrawn).beauty!.approvals[0].state).toBe("blocked");
    expect(
      code(() =>
        run(withdrawn, {
          type: "add_preview",
          lookId: "look-nora",
          preview: garment(withdrawn),
        }),
      ),
    ).toBe("CONSENT_REQUIRED");
    expect(
      code(() =>
        run(withdrawn, {
          type: "add_beauty_preview",
          lookId: "look-nora",
          preview: face(withdrawn),
        }),
      ),
    ).toBe("FACE_CONSENT_REQUIRED");
  });

  it("direction and story-scope changes require both reviews, while schedule changes preserve both", () => {
    const baseline = approved();
    const directed = run(baseline, {
      type: "update_direction",
      characterId: "char-nora",
      text: "A revised synthetic story direction",
      essential: ["velvet coat"],
      approvedBy: "Synthetic direction reviewer",
    });
    expect(nora(directed).approvals[0].state).toBe("needs_review");
    expect(nora(directed).beauty!.approvals[0].state).toBe("needs_review");
    const scene = baseline.scenes.find(
      (candidate) => candidate.id === "scene-01",
    )!;
    const reviewed = run(baseline, {
      type: "review_scene",
      sceneId: scene.id,
      title: scene.title,
      storyDay: 2,
      requirements: scene.requirements,
    });
    expect(nora(reviewed).approvals[0].state).toBe("needs_review");
    expect(nora(reviewed).beauty!.approvals[0].state).toBe("needs_review");
    expect(reviewed.scenes[0].storyDaySource).toBe("reviewed");
    const occurrence = baseline.occurrences.find(
      (candidate) => candidate.id === "occ-01",
    )!;
    const rescheduled = run(baseline, {
      type: "update_occurrence",
      occurrence: {
        ...occurrence,
        start: "2026-11-09T12:00:00.000Z",
        end: "2026-11-09T13:00:00.000Z",
      },
    });
    expect(getCurrentApproval(nora(rescheduled))).toEqual(
      getCurrentApproval(nora(baseline)),
    );
    expect(getCurrentBeautyApproval(nora(rescheduled))).toEqual(
      getCurrentBeautyApproval(nora(baseline)),
    );
  });

  it("configured but unapproved beauty prevents ready and gets its own frozen evidence", () => {
    let production = example();
    production.fixture = false;
    for (const scene of production.scenes) {
      scene.reviewed = true;
      scene.storyDaySource = "reviewed";
      for (const requirement of scene.requirements) requirement.reviewed = true;
    }
    for (const look of production.looks) {
      look.preparationEvidence = "observed";
      const unit = production.units.find(
        (candidate) => candidate.id === look.unitIds[0],
      )!;
      unit.fitting = {
        performerId: look.performerId,
        status: "confirmed",
        evidence: "Controlled test-only physical-fact input",
        provenance: "observed",
      };
      unit.availability = {
        ...unit.availability,
        provenance: "manual",
        confirmed: true,
        source: "Controlled test-only availability input",
      };
    }
    const source = production.sourcing[0];
    production.sourcing = production.looks.map((look, index) => ({
      ...source,
      id: `source-${index}`,
      unitIds: [...look.unitIds],
      status: "confirmed",
      provenance: "manual",
      operator: "Test operator",
      evidence: "Controlled supplier input, not an actual event",
      externalReference: `TEST-${index}`,
    }));
    for (const lookId of production.looks.map((look) => look.id))
      production = approveGarment(production, lookId);
    production = run(production, { type: "solve_allocation" });
    production = run(production, {
      type: "adopt_allocation",
      inputHash: production.allocationResult!.inputHash,
    });
    production = run(production, {
      type: "create_pack",
      title: "Still needs separate beauty review",
      occurrenceIds: production.occurrences.map((occurrence) => occurrence.id),
    });
    expect(getReadiness(production, NOW)).toMatchObject({
      appearanceApproved: 5,
      beautyApproved: 0,
      beautyTotal: 1,
      ready: false,
    });
    expect(getReadiness(production, NOW).nextAction).toMatch(
      /separate beauty-detail preview/,
    );
    expect(production.packs.at(-1)!.warnings.join(" ")).toMatch(
      /separate beauty detail is configured/,
    );
    production = approveBeauty(production);
    expect(production.packs.at(-1)!.state).toBe("superseded");
    production = run(production, {
      type: "create_pack",
      title: "Controlled complete input",
      occurrenceIds: production.occurrences.map((occurrence) => occurrence.id),
    });
    expect(getReadiness(production, NOW)).toMatchObject({
      appearanceApproved: 5,
      beautyApproved: 1,
      beautyTotal: 1,
      ready: true,
    });
    expect(
      production.packs
        .at(-1)!
        .snapshot.looks.find((look) => look.id === "look-nora")!.beauty!
        .approvals[0].previewId,
    ).toBe(getCurrentBeautyPreview(nora(production))!.id);
    expect(
      production.packs
        .at(-1)!
        .snapshot.performers.find(
          (performer) => performer.id === "performer-ada",
        )!.faceCapture!.imageUrl,
    ).toBe("/assets/cast/ada-face.webp");
  });

  it("a changed face fact version prevents stale repair adoption even without a revision bump", () => {
    const baseline = approved();
    const proposed = run(baseline, {
      type: "propose_change",
      kind: "garment_unavailable",
      subjectId: "unit-coat-oxblood",
      replacementId: "unit-coat-charcoal",
      seeded: true,
    });
    const changed = structuredClone(proposed);
    ada(changed).faceCapture!.version += 1;
    const proposal = changed.proposals.at(-1)!;
    expect(
      code(() =>
        run(changed, {
          type: "adopt_repair",
          proposalId: proposal.id,
          optionId: proposal.options[0].id,
        }),
      ),
    ).toBe("STALE_PROPOSAL");
  });
});

describe("story chronology provenance", () => {
  it("marks authored days as script facts and an unspecified day remains unreviewed until confirmed", () => {
    const production = example();
    expect(
      production.scenes.every((scene) => scene.storyDaySource === "script"),
    ).toBe(true);
    production.scenes[0].storyDaySource = "unspecified";
    expect(production.scenes[0].reviewed).toBe(false);
    const reviewed = run(production, {
      type: "review_scene",
      sceneId: "scene-01",
      title: production.scenes[0].title,
      storyDay: 3,
      requirements: production.scenes[0].requirements,
    });
    expect(reviewed.scenes[0]).toMatchObject({
      storyDay: 3,
      storyDaySource: "reviewed",
      reviewed: true,
    });
  });
});
