import { describe, expect, it } from "vitest";
import type { DetailKind, DetailPreview, Production } from "@/lib/types";
import {
  allocationInputHash,
  beautyInputHash,
  candidateInputHash,
  candidateIntentHash,
  createBlankProduction,
  createExampleProduction,
  detailInputHash,
  getApprovedAppearanceChoices,
  getCurrentApproval,
  getCurrentBeautyApproval,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
  getCurrentDetailApproval,
  getCurrentDetailPreview,
  getCurrentPreview,
  getReadiness,
  previewChange,
  sha256,
  solveAllocation,
  validateAllocation,
} from "@/lib/domain";
import {
  approveManaged,
  candidateDouble,
  command,
  doubleOutput,
  legacyExample,
  reviewCandidate,
  reviewedRepair,
  TEST_NOW,
} from "./domain-support";
const nora = (p: Production) =>
  p.looks.find((look) => look.id === "look-nora")!;
const mae = (p: Production) => p.looks.find((look) => look.id === "look-mae")!;
const example = () => createExampleProduction("review-test", TEST_NOW);
const allocate = (p: Production) => {
  const solved = command(p, { type: "solve_allocation" });
  return command(solved, {
    type: "adopt_allocation",
    inputHash: solved.allocationResult!.inputHash,
  });
};
function candidate(
  p: Production,
  unitId = "unit-coat-charcoal",
  performerId?: string,
): Production {
  p = command(p, {
    type: "create_candidate",
    lookId: "look-nora",
    unitIds: [unitId],
    ...(performerId ? { performerId } : {}),
  });
  return reviewCandidate(p, p.appearanceCandidates!.at(-1)!.id);
}
// Test outputs below are schema-valid doubles, never application fixtures or claims of provider execution.
describe("reviewed appearance candidates and admissibility", () => {
  it("partitions day variants without duplicate scene appearances and charges each physical unit once", () => {
    const p = example();
    for (const characterId of ["char-nora", "char-mae", "char-ruth"])
      expect(
        [
          ...new Set(
            p.looks
              .filter((look) => look.characterId === characterId)
              .flatMap((look) => look.storyDays),
          ),
        ].sort(),
      ).toEqual([1, 2, 3]);
    for (const scene of p.scenes)
      for (const characterId of scene.characterIds)
        expect(
          p.looks.filter(
            (look) =>
              look.characterId === characterId &&
              look.sceneIds.includes(scene.id),
          ),
        ).toHaveLength(1);
    expect(
      p.looks
        .filter((look) => look.characterId === "char-nora")
        .every(
          (look) =>
            look.unitIds[0] === "unit-coat-oxblood" &&
            look.continuityGroupId === "continuity-nora-coat",
        ),
    ).toBe(true);
    expect(
      p.looks.find((look) => look.id === "look-mae-rehearsal")?.unitIds,
    ).toEqual(["unit-blouse-mae"]);
    expect(mae(p).unitIds).toEqual(["unit-dress-midnight"]);
    expect(
      p.looks.find((look) => look.id === "look-julian-finale")?.unitIds,
    ).toEqual(["unit-jacket-rust"]);
    expect(
      p.units.find((unit) => unit.id === "unit-coat-burgundy"),
    ).toMatchObject({
      code: "C-033",
      name: "Burgundy wool coat",
      material: "Wool",
      imageUrl: "/assets/garments/burgundy-coat.webp",
    });
    expect(
      p.looks.find((look) => look.id === "look-nora-finale")?.beauty?.recipe,
    ).toMatchObject({ lipIntensity: 65, blushIntensity: 45 });
    for (const scene of p.scenes)
      for (const req of scene.requirements)
        expect(p.script!.text.slice(req.sourceStart, req.sourceEnd)).toBe(
          req.text,
        );
    expect(p.script!.sha256).toBe(sha256(p.script!.text));
    expect(p.looks.flatMap((look) => look.approvals)).toEqual([]);
    const solved = solveAllocation(approveManaged(p), { now: TEST_NOW });
    expect(solved).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
      independentlyChecked: false,
      totalCostCents: 50000,
    });
    expect(solved.assignments).toHaveLength(17);
    expect(p.transitions.map((item) => item.evidence)).toEqual([
      "estimate",
      "estimate",
    ]);
  });
  it("never assigns an unapproved original or a merely listed substitute, even with a current preview", () => {
    expect(solveAllocation(example(), { now: TEST_NOW })).toMatchObject({
      status: "INFEASIBLE",
      assignments: [],
    });
    let p = approveManaged(example());
    p.units[0].approvedSubstituteIds = ["unit-coat-charcoal"];
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-oxblood",
      status: "unavailable",
    });
    p = command(p, {
      type: "create_candidate",
      lookId: "look-nora",
      unitIds: ["unit-coat-charcoal"],
    });
    const c = p.appearanceCandidates!.at(-1)!,
      preview = candidateDouble(p, c);
    p = command(p, {
      type: "add_candidate_preview",
      candidateId: c.id,
      preview,
    });
    expect(solveAllocation(p, { now: TEST_NOW })).toMatchObject({
      status: "INFEASIBLE",
      assignments: [],
    });
    p = command(p, {
      type: "approve_candidate",
      candidateId: c.id,
      previewId: preview.id,
      approvedBy: "Synthetic evaluator",
      rationale: "Test exact candidate decision.",
    });
    const solved = solveAllocation(p, { now: TEST_NOW });
    expect(solved.status).toBe("FEASIBLE");
    expect(
      solved.assignments
        .filter((item) => item.lookId.startsWith("look-nora"))
        .every(
          (item) =>
            item.unitId === "unit-coat-charcoal" && item.candidateId === c.id,
        ),
    ).toBe(true);
  });
  it("cannot treat an unknown quote as free stock under the hard budget", () => {
    const p = approveManaged(example());
    p.units[0].priceCents = 0;
    p.units[0].priceSource = "";
    const result = solveAllocation(p, { now: TEST_NOW });
    expect(result.status).toBe("UNKNOWN");
    expect(result.assignments).toEqual([]);
    expect(result.findings.some((item) => item.code === "PRICE_UNKNOWN")).toBe(
      true,
    );
    expect(() =>
      command(p, {
        type: "update_unit",
        unitId: p.units[0].id,
        priceSource: "",
      }),
    ).toThrow(/Unknown price is not free/);
  });
  it("rejects candidate outputs with another capture, actor, scope, recipe or source", () => {
    const p = command(example(), {
      type: "create_candidate",
      lookId: "look-nora",
      unitIds: ["unit-coat-charcoal"],
    });
    const c = p.appearanceCandidates!.at(-1)!,
      preview = candidateDouble(p, c);
    for (const patch of [
      { captureVersion: 9 },
      { performerId: "performer-celeste" },
      { scopeLookIds: ["look-nora"] },
      { unitIds: ["unit-coat-burgundy"] },
      { recipeHash: "forged" },
      { sourceImageUrl: "/wrong-source.webp" },
      { inputHash: "forged" },
    ])
      expect(() =>
        command(p, {
          type: "add_candidate_preview",
          candidateId: c.id,
          preview: { ...preview, ...patch },
        }),
      ).toThrow(/exact candidate/);
    expect(nora(p).unitIds).toEqual(["unit-coat-oxblood"]);
  });
  it("adopts reviewed evidence immutably and preserves unrelated approvals", () => {
    const original = approveManaged(example()),
      before = JSON.stringify(original),
      p = candidate(original),
      c = p.appearanceCandidates!.at(-1)!;
    const preview = getCurrentCandidatePreview(p, c)!,
      approval = getCurrentCandidateApproval(p, c)!;
    expect([...c.lookIds].sort()).toEqual(["look-nora", "look-nora-finale"]);
    expect([...c.sceneIds].sort()).toEqual([
      "scene-01",
      "scene-04",
      "scene-07",
    ]);
    const adopted = command(p, { type: "adopt_candidate", candidateId: c.id });
    for (const look of adopted.looks.filter((look) =>
      c.lookIds.includes(look.id),
    )) {
      expect(look.activeCandidateId).toBe(c.id);
      expect(getCurrentApproval(look, adopted)).toEqual(approval);
      expect(getCurrentPreview(look, adopted)).toEqual(preview);
    }
    expect(getCurrentApproval(mae(adopted), adopted)).toEqual(
      getCurrentApproval(mae(original), original),
    );
    expect(adopted.characters[0].direction).toEqual(
      original.characters[0].direction,
    );
    expect(JSON.stringify(original)).toBe(before);
    expect(adopted.revision).toBe(p.revision + 1);
  });
  it("keeps adopted lineage on revocation, blocks every dependent call, and preserves frozen scoped evidence", () => {
    let p = candidate(approveManaged(example()));
    const c = p.appearanceCandidates!.at(-1)!;
    p = command(p, { type: "adopt_candidate", candidateId: c.id });
    p = allocate(p);
    p = command(p, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Scoped continuity",
    });
    const hash = allocationInputHash(p),
      frozen = structuredClone(p.packs[0].snapshot),
      approval = getCurrentCandidateApproval(p, c.id)!;
    const revoked = command(p, {
      type: "revoke_candidate_approval",
      candidateId: c.id,
      approvalId: approval.id,
    });
    expect(allocationInputHash(revoked)).not.toBe(hash);
    expect(nora(revoked).activeCandidateId).toBe(c.id);
    expect(getCurrentApproval(nora(revoked), revoked)).toBeUndefined();
    expect(getCurrentApproval(nora(revoked))).toBeUndefined();
    expect(getApprovedAppearanceChoices(revoked, nora(revoked))).toEqual([]);
    expect(solveAllocation(revoked, { now: TEST_NOW })).toMatchObject({
      status: "INFEASIBLE",
      assignments: [],
    });
    expect(
      revoked.allocations.filter((item) => item.state === "blocked"),
    ).toHaveLength(3);
    expect(revoked.packs[0].state).toBe("superseded");
    expect(revoked.packs[0].snapshot).toEqual(frozen);
    const aggregate = {
      ...p,
      ...frozen,
      ...frozen.appearanceContext,
      appearanceCandidates: frozen.appearanceCandidates,
    };
    expect(getCurrentApproval(frozen.looks[0], aggregate)?.id).toBe(
      approval.id,
    );
    expect(getReadiness(revoked, TEST_NOW).appearanceApproved).toBe(6);
    expect(
      previewChange(p, "recast", "char-nora", "performer-celeste")
        .invalidatedApprovalIds,
    ).toHaveLength(1);
    const sampled = command(revoked, {
      type: "set_example_decisions",
      enabled: true,
    });
    expect(getCurrentApproval(nora(sampled), sampled)?.decisionSource).toBe(
      "example",
    );
    const off = command(sampled, {
      type: "set_example_decisions",
      enabled: false,
    });
    expect(getCurrentApproval(nora(off), off)).toBeUndefined();
    expect(off.events.at(-1)?.summary).toMatch(
      /Removed 1 explicit sample decisions/,
    );
  });
  it("reapproves existing pixels after direction edits without rendering or transferring the old decision", () => {
    let p = candidate(approveManaged(example()));
    const c = p.appearanceCandidates!.at(-1)!;
    p = command(p, { type: "adopt_candidate", candidateId: c.id });
    const pixels = getCurrentPreview(nora(p), p)!,
      input = candidateInputHash(p, c.id),
      intent = candidateIntentHash(p, c.id),
      old = getCurrentApproval(nora(p), p)!;
    p = command(p, {
      type: "edit_direction",
      characterId: "char-nora",
      text: "A charcoal wool outer layer.",
      essential: ["Long wool coat"],
      palette: ["#242633"],
    });
    expect(p.characters[0].direction.approvedBy).toBeNull();
    expect(candidateInputHash(p, c.id)).toBe(input);
    expect(candidateIntentHash(p, c.id)).not.toBe(intent);
    expect(getCurrentPreview(nora(p), p)).toEqual(pixels);
    expect(getCurrentApproval(nora(p), p)).toBeUndefined();
    p = command(p, {
      type: "approve_candidate",
      candidateId: c.id,
      previewId: pixels.id,
      approvedBy: "Synthetic evaluator",
      rationale: "Reviewed unchanged pixels against edited intent.",
    });
    expect(getCurrentApproval(nora(p), p)?.previewId).toBe(pixels.id);
    expect(getCurrentApproval(nora(p), p)?.id).not.toBe(old.id);
    expect(p.appearanceCandidates!.at(-1)!.previews).toHaveLength(1);
    expect(p.appearanceCandidates!.at(-1)!.approvals[0].state).toBe(
      "needs_review",
    );
  });
  it("preserves a prospective actor's exact decision on another source edit, then retires the previous actor on recast", () => {
    let p = candidate(approveManaged(example()));
    const adaCandidate = p.appearanceCandidates!.at(-1)!;
    p = command(p, { type: "adopt_candidate", candidateId: adaCandidate.id });
    p = candidate(p, "unit-coat-charcoal", "performer-celeste");
    const celesteCandidate = p.appearanceCandidates!.at(-1)!,
      celesteApproval = getCurrentCandidateApproval(p, celesteCandidate)!;
    const sourceEdited = command(p, {
      type: "update_performer",
      performerId: "performer-ada",
      imageUrl: "/api/assets/changed-ada",
      assetId: "changed-ada",
      consent: {
        granted: true,
        purpose: "Test source permission",
        publicDemo: false,
        recordedAt: TEST_NOW,
      },
    });
    expect(
      getCurrentCandidateApproval(sourceEdited, celesteCandidate.id),
    ).toEqual(celesteApproval);
    expect(
      getCurrentCandidateApproval(sourceEdited, adaCandidate.id),
    ).toBeUndefined();
    const recast = command(p, {
      type: "adopt_candidate",
      candidateId: celesteCandidate.id,
    });
    expect(getCurrentCandidateApproval(recast, celesteCandidate.id)).toEqual(
      celesteApproval,
    );
    expect(getCurrentCandidatePreview(recast, adaCandidate.id)).toBeDefined();
    expect(
      getCurrentCandidateApproval(recast, adaCandidate.id),
    ).toBeUndefined();
  });
  it("flags removed-item creative references and makes edited direction unapproved", () => {
    let p = example();
    p = command(p, {
      type: "update_direction",
      characterId: "char-nora",
      text: nora(p).silhouette,
      essential: ["Oxblood velvet coat"],
      approvedBy: "Synthetic reviewer",
    });
    expect(
      previewChange(p, "garment_unavailable", "unit-coat-oxblood")
        .creativeFlags![0].references,
    ).toEqual(expect.arrayContaining(["Oxblood", "Velvet"]));
    p = command(p, {
      type: "edit_direction",
      characterId: "char-nora",
      text: "Long charcoal wool coat.",
      essential: ["Charcoal outer layer"],
    });
    expect(p.characters[0].direction.approvedBy).toBeNull();
    expect(
      previewChange(p, "garment_unavailable", "unit-coat-oxblood")
        .creativeFlags,
    ).toEqual([]);
  });
  it("forbids mixing approved coats across calls and counts only usable recipes as choices", () => {
    let p = candidate(
      candidate(approveManaged(example())),
      "unit-coat-burgundy",
    );
    const full = structuredClone(p.units[0].availability);
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-oxblood",
      status: "unavailable",
    });
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-charcoal",
      availability: { ...full, to: "2026-11-09T23:59:00.000Z" },
    });
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-burgundy",
      availability: { ...full, from: "2026-11-10T00:00:00.000Z" },
    });
    expect(solveAllocation(p, { now: TEST_NOW })).toMatchObject({
      status: "INFEASIBLE",
      assignments: [],
    });
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-charcoal",
      availability: full,
    });
    const one = solveAllocation(p, { now: TEST_NOW });
    expect(one).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
      totalCostCents: 46500,
    });
    expect(
      new Set(
        one.assignments
          .filter((item) => item.lookId.startsWith("look-nora"))
          .map((item) => item.unitId),
      ),
    ).toEqual(new Set(["unit-coat-charcoal"]));
    const mixed = structuredClone(one.assignments);
    mixed.find((item) => item.lookId === "look-nora-finale")!.unitId =
      "unit-coat-burgundy";
    expect(
      validateAllocation(p, mixed, { now: TEST_NOW }).findings.some(
        (item) => item.code === "CONTINUITY_APPROVAL_LINEAGE",
      ),
    ).toBe(true);
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-burgundy",
      availability: full,
    });
    expect(solveAllocation(p, { now: TEST_NOW })).toMatchObject({
      status: "OPTIMAL",
      totalCostCents: 46500,
    });
  });
  it("minimizes unique-unit cost before changes and explicitly adopts a selected reviewed candidate once", () => {
    let p = candidate(approveManaged(example()));
    const solved = solveAllocation(p, { now: TEST_NOW });
    expect(solved).toMatchObject({ status: "OPTIMAL", totalCostCents: 46500 });
    expect(nora(p).unitIds).toEqual(["unit-coat-oxblood"]);
    p = allocate(p);
    expect(nora(p).activeCandidateId).toBe(p.appearanceCandidates!.at(-1)!.id);
    expect(nora(p).revision).toBe(2);
    expect(
      p.looks.find((look) => look.id === "look-nora-finale")?.revision,
    ).toBe(2);
  });
  it("hashes exact decision identity and rejects a proposal after candidate review until refreshed", () => {
    let p = approveManaged(example());
    const request = {
      type: "propose_change" as const,
      kind: "garment_unavailable" as const,
      subjectId: "unit-coat-oxblood",
      replacementId: "unit-coat-charcoal",
      seeded: true,
    };
    p = command(p, request);
    const proposal = p.proposals.at(-1)!,
      hash = allocationInputHash(p);
    p = reviewCandidate(p, proposal.options[0].candidateId!);
    expect(allocationInputHash(p)).not.toBe(hash);
    expect(() =>
      command(p, {
        type: "adopt_repair",
        proposalId: proposal.id,
        optionId: proposal.options[0].id,
      }),
    ).toThrow(/older production revision/);
    p = command(p, request);
    const current = p.proposals.at(-1)!;
    expect(current.options[0]).toMatchObject({
      feasible: true,
      requiresVisualApproval: false,
    });
    p = command(p, {
      type: "adopt_repair",
      proposalId: current.id,
      optionId: current.options[0].id,
    });
    expect(getCurrentApproval(nora(p), p)?.candidateId).toBe(
      current.options[0].candidateId,
    );
  });
});

describe("sample decisions, custom planning and serialized compatibility", () => {
  it("records reversible exact example decisions and preserves subsequent manual decisions", () => {
    let p = example();
    expect(
      command(p, {
        type: "set_example_decisions",
        enabled: true,
      }).looks.flatMap((look) => look.approvals),
    ).toEqual([]);
    for (const look of p.looks)
      p = command(p, {
        type: "add_preview",
        lookId: look.id,
        preview: doubleOutput(p, look.id),
      });
    p = command(p, { type: "set_example_decisions", enabled: true });
    expect(
      p.looks.every(
        (look) =>
          getCurrentApproval(look, p)?.approvedBy ===
          "Example reviewer (sample decision)",
      ),
    ).toBe(true);
    expect(
      p.looks.every(
        (look) => getCurrentApproval(look, p)?.decisionSource === "example",
      ),
    ).toBe(true);
    const count = p.looks.flatMap((look) => look.approvals).length;
    p = command(p, { type: "set_example_decisions", enabled: true });
    expect(p.looks.flatMap((look) => look.approvals)).toHaveLength(count);
    p = command(p, {
      type: "approve_look",
      lookId: "look-mae",
      previewId: getCurrentPreview(mae(p), p)!.id,
      approvedBy: "Synthetic individual evaluator",
      rationale: "Separate manual decision.",
    });
    const manual = getCurrentApproval(mae(p), p)!;
    p = command(p, { type: "set_example_decisions", enabled: false });
    expect(getCurrentApproval(mae(p), p)).toEqual(manual);
    expect(p.looks.filter((look) => getCurrentApproval(look, p))).toHaveLength(
      1,
    );
    expect(() =>
      command(createBlankProduction("blank", "Custom", TEST_NOW), {
        type: "set_example_decisions",
        enabled: true,
      }),
    ).toThrow(/synthetic example/);
  });
  it("exempts an own-clothes role from missing cast/looks and can undo the explicit exemption", () => {
    let p = approveManaged(example());
    p.characters.push({
      id: "extra",
      name: "Passing runner",
      description: "Synthetic walk-on",
      performerId: "",
      direction: {
        revision: 1,
        text: "Own clothes",
        essential: [],
        palette: [],
        approvedBy: null,
      },
    });
    p.scenes[0].characterIds.push("extra");
    p = command(p, {
      type: "set_own_clothes",
      characterId: "extra",
      ownClothes: true,
    });
    expect(
      solveAllocation(p, { now: TEST_NOW }).findings.some(
        (item) => item.code === "LOOK_MISSING",
      ),
    ).toBe(false);
    expect(getReadiness(p, TEST_NOW).nextAction).not.toMatch(
      /Add the cast|missing character looks/,
    );
    p = command(p, {
      type: "set_own_clothes",
      characterId: "extra",
      ownClothes: false,
    });
    expect(
      solveAllocation(p, { now: TEST_NOW }).findings.some(
        (item) => item.code === "LOOK_MISSING",
      ),
    ).toBe(true);
  });
  it("allows initial casting after calls are drafted while unrelated roles remain incomplete", () => {
    let p = legacyExample();
    p.looks = [];
    for (const character of p.characters) character.performerId = "";
    p = command(p, {
      type: "propose_change",
      kind: "recast",
      subjectId: "char-nora",
      replacementId: "performer-ada",
      seeded: false,
    });
    const proposal = p.proposals.at(-1)!;
    expect(proposal.options[0]).toMatchObject({
      feasible: true,
      requiresVisualApproval: false,
    });
    p = command(p, {
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId: proposal.options[0].id,
    });
    expect(p.characters[0].performerId).toBe("performer-ada");
    expect(
      p.characters.slice(1).every((character) => character.performerId === ""),
    ).toBe(true);
    expect(p.looks).toEqual([]);
  });
  it("drafts calls in script order, retains edited calls, and preserves story chronology", () => {
    let p = legacyExample();
    p.occurrences = [];
    const days = p.scenes.map((scene) => scene.storyDay);
    p = command(p, {
      type: "draft_schedule",
      start: "2026-11-09T10:00:00.000Z",
      sceneMinutes: 40,
      gapMinutes: 5,
      location: "Seaside Theatre",
    });
    expect(p.occurrences.map((item) => item.sceneId)).toEqual(
      p.scenes.map((scene) => scene.id),
    );
    expect(p.occurrences[1].start).toBe("2026-11-09T10:45:00.000Z");
    expect(p.scenes.map((scene) => scene.storyDay)).toEqual(days);
    const kept = structuredClone(p.occurrences[2]);
    p.occurrences = p.occurrences.slice(0, 3);
    p = command(p, {
      type: "draft_schedule",
      start: "2026-11-09T10:00:00.000Z",
      sceneMinutes: 20,
      gapMinutes: 5,
      location: "Seaside Theatre",
    });
    expect(p.occurrences.find((item) => item.id === kept.id)).toEqual(kept);
    expect(p.occurrences).toHaveLength(7);
    expect(p.looks.flatMap((look) => look.approvals)).toEqual([]);
  });
  it("imports explicit synthetic library associations and clears associations for replaced sources", () => {
    let p = createBlankProduction("custom", "Library test", TEST_NOW);
    p = command(p, {
      type: "import_example_performer",
      sourcePerformerId: "performer-ada",
    });
    const actor = p.performers[0];
    expect(actor.id).not.toBe("performer-ada");
    expect(actor.librarySourceId).toBe("performer-ada");
    expect(actor.faceCapture?.librarySourceId).toBe("performer-ada");
    const importedFace = structuredClone(actor.faceCapture);
    p = command(p, {
      type: "update_performer",
      performerId: actor.id,
      imageUrl: "/api/assets/body",
      assetId: "body",
      consent: {
        granted: true,
        purpose: "Test permission",
        publicDemo: true,
        recordedAt: TEST_NOW,
      },
    });
    expect(p.performers[0].librarySourceId).toBeUndefined();
    expect(p.performers[0].faceCapture?.librarySourceId).toBe("performer-ada");
    expect(p.performers[0].faceCapture).toEqual(importedFace);
    expect(p.performers[0]).toMatchObject({
      synthetic: false,
      consent: { publicDemo: false },
    });
    p = command(p, {
      type: "update_face_capture",
      performerId: actor.id,
      faceCapture: {
        imageUrl: "/api/assets/face",
        assetId: "face",
        version: 1,
        synthetic: true,
        librarySourceId: "forged",
        consent: {
          granted: true,
          purpose: "Test face permission",
          publicDemo: true,
          recordedAt: TEST_NOW,
        },
      },
    });
    expect(p.performers[0].faceCapture?.librarySourceId).toBeUndefined();
    expect(p.performers[0].faceCapture).toMatchObject({
      synthetic: false,
      consent: { publicDemo: false },
    });
    p = command(p, {
      type: "import_example_unit",
      sourceUnitId: "unit-coat-burgundy",
    });
    expect(p.units[0].librarySourceId).toBe("unit-coat-burgundy");
    p = command(p, {
      type: "update_unit",
      unitId: p.units[0].id,
      imageUrl: "/api/assets/coat",
      assetId: "coat",
    });
    expect(p.units[0].librarySourceId).toBeUndefined();
    expect(() =>
      command(p, {
        type: "import_example_unit",
        sourceUnitId: "arbitrary-path",
      }),
    ).toThrow(/not found/);
  });
  it("offers a trusted source-only pendant catalog in a blank production without creating rendered evidence", () => {
    let p = createBlankProduction("blank-necklace", "Custom detail", TEST_NOW);
    expect(p.detailReferences).toEqual([
      {
        id: "detail-brass-pendant",
        librarySourceId: "detail-brass-pendant",
        name: "Small brass pendant · synthetic reference",
        imageUrl: "/assets/accessories/brass-pendant.webp",
        assetId: null,
        synthetic: true,
      },
    ]);
    expect(p.looks).toEqual([]);
    expect(getReadiness(p, TEST_NOW).detailsTotal).toBe(0);
    p = command(p, {
      type: "import_example_performer",
      sourcePerformerId: "performer-ada",
    });
    p = command(p, {
      type: "import_example_unit",
      sourceUnitId: "unit-coat-oxblood",
    });
    p = command(p, {
      type: "add_character",
      character: {
        id: "char-custom",
        name: "Custom fictional character",
        description: "Synthetic software test",
        performerId: p.performers[0].id,
        direction: {
          revision: 1,
          text: "A small brass pendant",
          palette: [],
          essential: [],
          approvedBy: null,
        },
      },
    });
    const look = structuredClone(example().looks[0]);
    Object.assign(look, {
      id: "look-custom",
      characterId: p.characters[0].id,
      performerId: p.performers[0].id,
      unitIds: [p.units[0].id],
      sceneIds: [],
      storyDays: [],
      details: [],
    });
    delete look.beauty;
    delete look.continuityGroupId;
    p = command(p, { type: "create_look", look });
    p = command(p, {
      type: "update_detail",
      lookId: look.id,
      recipe: {
        kind: "necklace",
        referenceId: "detail-brass-pendant",
        removeBackground: true,
      },
    });
    expect(detailInputHash(p, look.id, "necklace")).toMatch(/^[a-f0-9]{64}$/);
    expect(getCurrentDetailPreview(p.looks[0], "necklace", p)).toBeUndefined();
    expect(getCurrentDetailApproval(p.looks[0], "necklace", p)).toBeUndefined();
    expect(p.looks[0].details![0]).toMatchObject({
      previews: [],
      approvals: [],
    });
    expect(getReadiness(p, TEST_NOW)).toMatchObject({
      detailsTotal: 1,
      detailsApproved: 0,
      ready: false,
    });
  });
  it("preserves the exact old source and structure while supporting older serialized approval fields", () => {
    const old = legacyExample(),
      before = JSON.stringify(old);
    expect(old.appearanceCandidates).toBeUndefined();
    expect(old.looks).toHaveLength(5);
    const changed = command(old, {
      type: "update_production",
      title: "Saved legacy title",
    });
    expect(changed.script).toEqual(old.script);
    expect(changed.looks).toEqual(old.looks);
    expect(changed.occurrences).toEqual(old.occurrences);
    expect(changed.revision).toBe(old.revision + 1);
    expect(JSON.stringify(old)).toBe(before);
    const approved = approveManaged(changed);
    for (const look of approved.looks)
      for (const approval of look.approvals) {
        delete approval.intentHash;
        delete approval.previewHash;
        delete approval.decisionSource;
      }
    expect(solveAllocation(approved, { now: TEST_NOW })).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
      totalCostCents: 42200,
    });
  });
});

function detailOutput(
  p: Production,
  lookId: string,
  kind: DetailKind,
): DetailPreview {
  const look = p.looks.find((item) => item.id === lookId)!,
    detail = look.details!.find((item) => item.kind === kind)!,
    face = p.performers.find(
      (item) => item.id === look.performerId,
    )!.faceCapture!;
  return {
    id: `test-detail-${lookId}-${kind}-${detail.revision}-${p.revision}`,
    lookId,
    kind,
    detailRevision: detail.revision,
    performerId: look.performerId,
    faceCaptureVersion: face.version,
    imageUrl: `/test-only/${lookId}-${kind}.webp`,
    assetId: null,
    sourceImageUrl: face.imageUrl!,
    operation: "Independent detail test double; no provider call",
    provenance: "recorded_provider",
    createdAt: TEST_NOW,
    inputHash: detailInputHash(p, look, kind),
    estimatedUnits: 0,
    inspectionNotes: "Test double only.",
  };
}
function approveDetail(
  p: Production,
  lookId: string,
  kind: DetailKind,
): Production {
  const preview = detailOutput(p, lookId, kind);
  p = command(p, { type: "add_detail_preview", lookId, kind, preview });
  return command(p, {
    type: "approve_detail",
    lookId,
    kind,
    previewId: preview.id,
    approvedBy: "Synthetic evaluator",
    rationale: "Test-only exact independent detail decision.",
  });
}
function approveBeauty(p: Production): Production {
  const look = nora(p),
    face = p.performers.find(
      (item) => item.id === look.performerId,
    )!.faceCapture!;
  const preview = {
    id: `test-beauty-${p.revision}`,
    lookId: look.id,
    beautyRevision: look.beauty!.revision,
    performerId: look.performerId,
    faceCaptureVersion: face.version,
    imageUrl: "/test-only/beauty.webp",
    assetId: null,
    sourceImageUrl: face.imageUrl!,
    operation: "Test double only",
    provenance: "recorded_provider" as const,
    createdAt: TEST_NOW,
    inputHash: beautyInputHash(p, look),
    estimatedUnits: 0,
    inspectionNotes: "No provider call.",
  };
  p = command(p, { type: "add_beauty_preview", lookId: look.id, preview });
  return command(p, {
    type: "approve_beauty",
    lookId: look.id,
    previewId: preview.id,
    approvedBy: "Synthetic evaluator",
    rationale: "Test-only independent makeup decision.",
  });
}
describe("independent hair and necklace lineage", () => {
  it("requires actual exact-kind output and never treats descriptive notes as rendered evidence", () => {
    let p = example();
    const look = mae(p);
    expect(getCurrentDetailPreview(look, "hair_color", p)).toBeUndefined();
    expect(getReadiness(p, TEST_NOW)).toMatchObject({
      detailsTotal: 4,
      detailsApproved: 0,
    });
    const preview = detailOutput(p, look.id, "hair_color");
    expect(() =>
      command(p, {
        type: "add_detail_preview",
        lookId: look.id,
        kind: "hair_color",
        preview: { ...preview, kind: "necklace" },
      }),
    ).toThrow(/different kind/);
    expect(() =>
      command(p, {
        type: "add_detail_preview",
        lookId: look.id,
        kind: "hair_color",
        preview: {
          ...preview,
          sourceImageUrl: p.performers.find(
            (item) => item.id === look.performerId,
          )!.imageUrl!,
        },
      }),
    ).toThrow(/different kind/);
    p = approveDetail(p, look.id, "hair_color");
    expect(getCurrentDetailApproval(mae(p), "hair_color", p)).toBeDefined();
    expect(getReadiness(p, TEST_NOW).detailsApproved).toBe(1);
  });
  it("preserves independent necklace and makeup decisions through a reviewed garment repair", () => {
    let p = approveBeauty(
      approveDetail(approveManaged(example()), "look-nora", "necklace"),
    );
    const necklace = getCurrentDetailApproval(nora(p), "necklace", p),
      beauty = getCurrentBeautyApproval(nora(p)),
      hash = detailInputHash(p, nora(p), "necklace");
    p = reviewedRepair(p, {
      type: "propose_change",
      kind: "garment_unavailable",
      subjectId: "unit-coat-oxblood",
      replacementId: "unit-coat-charcoal",
      seeded: true,
    });
    const proposal = p.proposals.at(-1)!;
    p = command(p, {
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId: proposal.options[0].id,
    });
    expect(getCurrentDetailApproval(nora(p), "necklace", p)).toEqual(necklace);
    expect(getCurrentBeautyApproval(nora(p))).toEqual(beauty);
    expect(detailInputHash(p, nora(p), "necklace")).toBe(hash);
    p = command(p, {
      type: "update_beauty",
      lookId: "look-nora",
      recipe: { ...nora(p).beauty!.recipe, lipIntensity: 50 },
    });
    expect(getCurrentDetailApproval(nora(p), "necklace", p)).toEqual(necklace);
    expect(getCurrentApproval(nora(p), p)).toBeDefined();
  });
  it("keeps face-derived detail on body replacement and invalidates only face evidence on face replacement", () => {
    let p = approveDetail(approveManaged(example()), "look-nora", "necklace");
    const detail = getCurrentDetailApproval(nora(p), "necklace", p)!;
    p = command(p, {
      type: "update_performer",
      performerId: "performer-ada",
      imageUrl: "/api/assets/new-body",
      assetId: "new-body",
      consent: {
        granted: true,
        purpose: "Test permission",
        publicDemo: false,
        recordedAt: TEST_NOW,
      },
    });
    expect(getCurrentApproval(nora(p), p)).toBeUndefined();
    expect(getCurrentDetailApproval(nora(p), "necklace", p)).toEqual(detail);
    p = approveManaged(p);
    const garment = getCurrentApproval(nora(p), p)!,
      face = p.performers.find(
        (item) => item.id === "performer-ada",
      )!.faceCapture!;
    p = command(p, {
      type: "update_face_capture",
      performerId: "performer-ada",
      faceCapture: {
        ...face,
        imageUrl: "/api/assets/new-face",
        assetId: "new-face",
      },
    });
    expect(getCurrentDetailApproval(nora(p), "necklace", p)).toBeUndefined();
    expect(getCurrentApproval(nora(p), p)).toEqual(garment);
  });
  it("retains direction and detail recipe on recast while requiring the replacement actor's separate evidence", () => {
    let p = approveBeauty(
      approveDetail(approveManaged(example()), "look-nora", "necklace"),
    );
    const direction = p.characters[0].direction,
      recipe = nora(p).details![0].recipe;
    p = candidate(p, "unit-coat-oxblood", "performer-celeste");
    p = command(p, {
      type: "adopt_candidate",
      candidateId: p.appearanceCandidates!.at(-1)!.id,
    });
    expect(p.characters[0].direction).toEqual(direction);
    expect(nora(p).details![0].recipe).toEqual(recipe);
    expect(getCurrentApproval(nora(p), p)?.performerId).toBe(
      "performer-celeste",
    );
    expect(getCurrentDetailApproval(nora(p), "necklace", p)).toBeUndefined();
    expect(getCurrentBeautyApproval(nora(p))).toBeUndefined();
    p = approveDetail(p, "look-nora", "necklace");
    expect(getCurrentDetailApproval(nora(p), "necklace", p)).toMatchObject({
      performerId: "performer-celeste",
      faceCaptureVersion: 1,
    });
    expect(
      getCurrentDetailPreview(nora(p), "necklace", p)?.sourceImageUrl,
    ).toBe("/assets/cast/celeste-face.webp");
  });
  it("freezes separate detail evidence and omits face pixels from every context after face-only withdrawal", () => {
    let p = approveBeauty(
      approveDetail(approveManaged(example()), "look-nora", "necklace"),
    );
    p = command(p, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Independent details",
    });
    const frozen = structuredClone(p.packs[0].snapshot),
      garment = getCurrentApproval(nora(p), p)!;
    expect(frozen.looks[0].details![0].previews).toHaveLength(1);
    p = command(p, {
      type: "withdraw_face_consent",
      performerId: "performer-ada",
    });
    expect(getCurrentApproval(nora(p), p)).toEqual(garment);
    expect(p.packs[0].state).toBe("superseded");
    expect(p.packs[0].snapshot).toEqual(frozen);
    p = command(p, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Face withheld",
    });
    const pack = p.packs.at(-1)!;
    expect(pack.snapshot.looks[0].details![0].previews).toEqual([]);
    expect(pack.snapshot.looks[0].beauty!.previews).toEqual([]);
    expect(
      pack.snapshot.appearanceContext!.performers.find(
        (item) => item.id === "performer-ada",
      )?.faceCapture?.imageUrl,
    ).toBeNull();
    expect(pack.warnings.join(" ")).toMatch(
      /necklace.*no exact current approval/,
    );
  });
});
