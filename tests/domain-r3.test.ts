import { describe, expect, it } from "vitest";
import type { Production, ProductionCommand } from "@/lib/types";
import {
  candidateInputHash,
  createExampleProduction,
  DomainError,
  getCurrentApproval,
  getCurrentCandidateApproval,
  getCurrentCreativeReferenceFlags,
  getCurrentDirectionAcknowledgement,
  getCurrentPreview,
  getDirectionReferenceReview,
  getReadiness,
  previewInputHash,
} from "@/lib/domain";
import { commandSchema } from "@/lib/server/validation";
import {
  approveManaged,
  candidateDouble,
  command,
  doubleOutput,
  legacyExample,
  reviewCandidate,
  TEST_NOW,
} from "./domain-support";

const example = () => createExampleProduction("r3-domain", TEST_NOW);
const request = {
  type: "propose_change" as const,
  kind: "garment_unavailable" as const,
  subjectId: "unit-coat-oxblood",
  replacementId: "unit-coat-burgundy",
  seeded: true,
};
const selected = (p: Production) => p.proposals.at(-1)!.options[0];
const nora = (p: Production) =>
  p.looks.find((look) => look.id === "look-nora")!;
function errorCode(action: () => unknown) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).code;
  }
  throw new Error("Expected domain rejection");
}
function approveOne(p: Production, lookId: string) {
  const preview = doubleOutput(p, lookId);
  p = command(p, { type: "add_preview", lookId, preview });
  return command(p, {
    type: "approve_look",
    lookId,
    previewId: preview.id,
    approvedBy: "Software evaluator",
    rationale: "Exact output reviewed for this test.",
  });
}
function repaired() {
  let p = reviewCandidate(approveManaged(example()), "candidate-nora-burgundy");
  p = command(p, request);
  return command(p, {
    type: "adopt_repair",
    proposalId: p.proposals.at(-1)!.id,
    optionId: selected(p).id,
  });
}
type AckCommand = Extract<
  ProductionCommand,
  { type: "acknowledge_direction_reference" }
>;
function acknowledge(p: Production, patch: Partial<AckCommand> = {}) {
  const review = getDirectionReferenceReview(
    p,
    "char-nora",
    "unit-coat-oxblood",
  )!;
  return command(p, {
    type: "acknowledge_direction_reference",
    characterId: review.characterId,
    unitId: review.unitId,
    sourceRevision: review.sourceRevision,
    referenceHash: review.referenceHash,
    acknowledgedBy: "Software evaluator",
    rationale: "Keep these words as a memory of the original coat.",
    ...patch,
  });
}

describe("R3 repair decisions and exact candidate twins", () => {
  it("reports six unrelated look decisions as amber metadata while blocking adoption until decisions are current", () => {
    let p = reviewCandidate(example(), "candidate-nora-burgundy");
    p = command(p, request);
    const option = selected(p);
    expect(option).toMatchObject({
      feasible: false,
      requiresVisualApproval: false,
      allocationStatus: "DECISIONS_NEEDED",
      decisionsNeeded: { count: 6 },
    });
    expect([...option.decisionsNeeded!.lookIds].sort()).toEqual(
      [
        "look-elias",
        "look-julian",
        "look-julian-finale",
        "look-mae",
        "look-mae-rehearsal",
        "look-ruth",
      ].sort(),
    );
    expect(option.findings.some((item) => item.severity === "conflict")).toBe(
      false,
    );
    expect(
      errorCode(() =>
        command(p, {
          type: "adopt_repair",
          proposalId: p.proposals.at(-1)!.id,
          optionId: option.id,
        }),
      ),
    ).toBe("REPAIR_DECISIONS_NEEDED");
    p = approveManaged(p);
    p = command(p, request);
    expect(selected(p)).toMatchObject({
      feasible: true,
      requiresVisualApproval: false,
    });
    expect(selected(p).decisionsNeeded).toBeUndefined();
    const adopted = command(p, {
      type: "adopt_repair",
      proposalId: p.proposals.at(-1)!.id,
      optionId: selected(p).id,
    });
    expect(nora(adopted).activeCandidateId).toBe("candidate-nora-burgundy");
  });
  it("counts unique other scheduled dressed looks, excluding own clothes, unscheduled looks and repeated calls", () => {
    let p = approveOne(approveOne(example(), "look-nora"), "look-mae");
    p = command(p, {
      type: "set_own_clothes",
      characterId: "char-ruth",
      ownClothes: true,
    });
    p.looks.push({
      ...structuredClone(p.looks.find((item) => item.id === "look-mae")!),
      id: "look-unscheduled",
      sceneIds: ["scene-unscheduled"],
    });
    p.occurrences.push({
      ...structuredClone(p.occurrences[0]),
      id: "repeat-nora",
      sceneId: "scene-01",
      start: "2026-11-11T20:00:00.000Z",
      end: "2026-11-11T21:00:00.000Z",
    });
    p = reviewCandidate(p, "candidate-nora-burgundy");
    p = command(p, request);
    expect(selected(p)).toMatchObject({
      allocationStatus: "DECISIONS_NEEDED",
      decisionsNeeded: { count: 4 },
    });
    expect([...selected(p).decisionsNeeded!.lookIds].sort()).toEqual(
      [
        "look-elias",
        "look-julian",
        "look-julian-finale",
        "look-mae-rehearsal",
      ].sort(),
    );
  });
  it("keeps an unapproved own candidate in needs-approval state rather than attributing it to other looks", () => {
    const p = command(example(), request);
    expect(selected(p)).toMatchObject({
      feasible: false,
      requiresVisualApproval: true,
    });
    expect(selected(p).decisionsNeeded).toBeUndefined();
    expect(
      getCurrentCandidateApproval(p, selected(p).candidateId!),
    ).toBeUndefined();
  });
  it.each(["availability", "budget", "overlap"] as const)(
    "keeps genuine %s conflicts red when unrelated decisions are absent",
    (cause) => {
      let p = reviewCandidate(example(), "candidate-nora-burgundy");
      if (cause === "availability")
        p = command(p, {
          type: "update_unit",
          unitId: "unit-coat-burgundy",
          status: "unavailable",
        });
      if (cause === "budget")
        p = command(p, { type: "update_production", budgetCents: 1 });
      if (cause === "overlap") {
        const first = p.occurrences.find((item) => item.id === "occ-01")!,
          next = p.occurrences.find((item) => item.id === "occ-04")!;
        first.start = next.start;
        first.end = next.end;
      }
      p = command(p, request);
      expect(selected(p)).toMatchObject({
        feasible: false,
        requiresVisualApproval: false,
        allocationStatus: "INFEASIBLE",
      });
      expect(selected(p).decisionsNeeded).toBeUndefined();
      const code = {
        availability: "UNIT_UNAVAILABLE",
        budget: "HARD_BUDGET",
        overlap: "PERFORMER_OVERLAP",
      }[cause];
      expect(
        selected(p).findings.some(
          (item) => item.code === code && item.severity === "conflict",
        ),
      ).toBe(true);
    },
  );
  it("prefers an older exact current approval over a newer unapproved twin", () => {
    let p = reviewCandidate(
      approveManaged(example()),
      "candidate-nora-burgundy",
    );
    p = command(p, {
      type: "create_candidate",
      lookId: "look-nora",
      unitIds: ["unit-coat-burgundy"],
    });
    const newer = p.appearanceCandidates!.at(-1)!;
    p = command(p, {
      type: "add_candidate_preview",
      candidateId: newer.id,
      preview: candidateDouble(p, newer),
    });
    p = command(p, request);
    expect(selected(p)).toMatchObject({
      candidateId: "candidate-nora-burgundy",
      feasible: true,
      requiresVisualApproval: false,
    });
    expect(getCurrentCandidateApproval(p, newer.id)).toBeUndefined();
    const old = p.appearanceCandidates!.find(
      (item) => item.id === "candidate-nora-burgundy",
    )!;
    p = command(p, {
      type: "revoke_candidate_approval",
      candidateId: old.id,
      approvalId: old.approvals.at(-1)!.id,
    });
    p = command(p, request);
    expect(selected(p)).toMatchObject({
      candidateId: newer.id,
      feasible: false,
      requiresVisualApproval: true,
    });
  });
  it("does not prefer an approval for a stale capture or a different prospective performer", () => {
    let p = reviewCandidate(
      approveManaged(example()),
      "candidate-nora-burgundy",
    );
    p.performers.find((item) => item.id === "performer-ada")!.captureVersion++;
    p = command(p, {
      type: "create_candidate",
      lookId: "look-nora",
      unitIds: ["unit-coat-burgundy"],
    });
    const current = p.appearanceCandidates!.at(-1)!;
    p = command(p, {
      type: "create_candidate",
      lookId: "look-nora",
      unitIds: ["unit-coat-burgundy"],
      performerId: "performer-celeste",
    });
    p = reviewCandidate(p, p.appearanceCandidates!.at(-1)!.id);
    p = command(p, request);
    expect(selected(p)).toMatchObject({
      candidateId: current.id,
      feasible: false,
      requiresVisualApproval: true,
    });
  });
  it("prepares a current candidate instead of reusing a stale scene-scope twin", () => {
    let p = reviewCandidate(
      approveManaged(example()),
      "candidate-nora-burgundy",
    );
    p.appearanceCandidates!.find(
      (item) => item.id === "candidate-nora-burgundy",
    )!.sceneIds = ["scene-01"];
    p = command(p, request);
    expect(selected(p).candidateId).not.toBe("candidate-nora-burgundy");
    expect(selected(p)).toMatchObject({
      feasible: false,
      requiresVisualApproval: true,
    });
    expect(
      p.appearanceCandidates!.find(
        (item) => item.id === selected(p).candidateId,
      )!.sceneIds,
    ).toEqual(["scene-01", "scene-04", "scene-07"]);
  });
});

describe("R3 deliberate direction-reference acknowledgements", () => {
  it("requires an already removed reference and preserves exact current approvals and frozen history", () => {
    const before = command(
      reviewCandidate(approveManaged(example()), "candidate-nora-burgundy"),
      request,
    );
    expect(
      getDirectionReferenceReview(before, "char-nora", "unit-coat-oxblood"),
    ).toBeUndefined();
    expect(
      errorCode(() =>
        command(before, {
          type: "acknowledge_direction_reference",
          characterId: "char-nora",
          unitId: "unit-coat-oxblood",
          sourceRevision: before.revision,
          referenceHash: "0".repeat(64),
          acknowledgedBy: "Evaluator",
          rationale: "Keep the words.",
        }),
      ),
    ).toBe("DIRECTION_REFERENCE_REQUIRED");
    let p = repaired();
    p = command(p, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Before deliberate wording",
    });
    const frozen = structuredClone(p.packs.at(-1)!.snapshot),
      original = JSON.stringify(p);
    const approval = getCurrentApproval(nora(p), p)!,
      preview = getCurrentPreview(nora(p), p)!,
      inputHash = candidateInputHash(p, nora(p).activeCandidateId!);
    const review = getDirectionReferenceReview(
      p,
      "char-nora",
      "unit-coat-oxblood",
    )!;
    expect(review.lookIds).toEqual(["look-nora", "look-nora-finale"]);
    expect(review.references).toContain("Oxblood");
    const acknowledged = acknowledge(p);
    expect(JSON.stringify(p)).toBe(original);
    expect(getCurrentCreativeReferenceFlags(acknowledged)).toEqual([]);
    expect(
      getCurrentDirectionAcknowledgement(
        acknowledged,
        "char-nora",
        "unit-coat-oxblood",
      ),
    ).toMatchObject({
      referenceHash: review.referenceHash,
      directionRevision: review.directionRevision,
      sourceRevision: p.revision,
      acknowledgedRevision: acknowledged.revision,
      acknowledgedBy: "Software evaluator",
    });
    expect(getCurrentApproval(nora(acknowledged), acknowledged)?.id).toBe(
      approval.id,
    );
    expect(getCurrentPreview(nora(acknowledged), acknowledged)?.id).toBe(
      preview.id,
    );
    expect(
      candidateInputHash(acknowledged, nora(acknowledged).activeCandidateId!),
    ).toBe(inputHash);
    expect(acknowledged.packs.at(-1)!.snapshot).toEqual(frozen);
    expect(acknowledged.packs.at(-1)!.state).toBe("superseded");
    const later = command(acknowledged, {
      type: "update_production",
      title: "Unrelated title edit",
    });
    expect(
      getCurrentDirectionAcknowledgement(
        later,
        "char-nora",
        "unit-coat-oxblood",
      ),
    ).toBeDefined();
  });
  it("rejects stale revisions, wrong reference targets and unnamed intent without mutating input", () => {
    const p = repaired(),
      before = JSON.stringify(p);
    for (const [patch, expected] of [
      [{ sourceRevision: p.revision - 1 }, "STALE_DIRECTION_REFERENCE"],
      [{ referenceHash: "0".repeat(64) }, "STALE_DIRECTION_REFERENCE"],
      [{ unitId: "unit-coat-charcoal" }, "DIRECTION_REFERENCE_REQUIRED"],
      [{ characterId: "char-mae" }, "DIRECTION_REFERENCE_REQUIRED"],
      [{ acknowledgedBy: " " }, "DIRECTION_REVIEW_REQUIRED"],
      [{ rationale: " " }, "DIRECTION_REVIEW_REQUIRED"],
    ] as Array<[Partial<AckCommand>, string]>)
      expect(errorCode(() => acknowledge(p, patch))).toBe(expected);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("expires even on a same-word direction edit and never restores appearance approval", () => {
    const p = acknowledge(repaired()),
      originalAck = structuredClone(
        p.characters.find((item) => item.id === "char-nora")!
          .directionAcknowledgements,
      );
    const direction = p.characters.find(
      (item) => item.id === "char-nora",
    )!.direction;
    const edited = command(p, {
      type: "edit_direction",
      characterId: "char-nora",
      text: direction.text,
      essential: direction.essential,
      palette: direction.palette,
    });
    expect(
      getCurrentDirectionAcknowledgement(
        edited,
        "char-nora",
        "unit-coat-oxblood",
      ),
    ).toBeUndefined();
    expect(getCurrentCreativeReferenceFlags(edited)).toHaveLength(1);
    expect(
      edited.characters.find((item) => item.id === "char-nora")!
        .directionAcknowledgements,
    ).toEqual(originalAck);
    expect(getCurrentApproval(nora(edited), edited)).toBeUndefined();
    expect(getCurrentPreview(nora(edited), edited)?.id).toBe(
      getCurrentPreview(nora(p), p)?.id,
    );
  });
  it("expires on changed removed reference or affected recipe/scope facts", () => {
    const p = acknowledge(repaired());
    const changedUnit = structuredClone(p);
    changedUnit.units.find((item) => item.id === "unit-coat-oxblood")!.color =
      "Wine";
    const changedScope = structuredClone(p);
    nora(changedScope).sceneIds = ["scene-01"];
    const changedRecipe = command(p, {
      type: "update_look",
      lookId: "look-nora",
      silhouette: "A revised long silhouette",
    });
    for (const changed of [changedUnit, changedScope, changedRecipe]) {
      expect(
        getCurrentDirectionAcknowledgement(
          changed,
          "char-nora",
          "unit-coat-oxblood",
        ),
      ).toBeUndefined();
      expect(getCurrentCreativeReferenceFlags(changed)).toHaveLength(1);
    }
  });
  it("permits separate reapproval of the same current output after intent changes, with no implicit approval from acknowledgement", () => {
    let p = repaired();
    const preview = getCurrentPreview(nora(p), p)!,
      oldApproval = getCurrentApproval(nora(p), p)!,
      inputHash = candidateInputHash(p, nora(p).activeCandidateId!);
    const direction = p.characters.find(
      (item) => item.id === "char-nora",
    )!.direction;
    p = command(p, {
      type: "edit_direction",
      characterId: "char-nora",
      text: direction.text + " Keep its memory in the words.",
      essential: direction.essential,
    });
    p = acknowledge(p);
    expect(getCurrentApproval(nora(p), p)).toBeUndefined();
    expect(getCurrentPreview(nora(p), p)?.id).toBe(preview.id);
    expect(candidateInputHash(p, nora(p).activeCandidateId!)).toBe(inputHash);
    p = command(p, {
      type: "approve_look",
      lookId: "look-nora",
      previewId: preview.id,
      approvedBy: "Explicit current reviewer",
      rationale: "The unchanged output supports this reviewed direction.",
    });
    expect(getCurrentApproval(nora(p), p)?.id).not.toBe(oldApproval.id);
    expect(getCurrentApproval(nora(p), p)?.previewId).toBe(preview.id);
    expect(
      getCurrentDirectionAcknowledgement(p, "char-nora", "unit-coat-oxblood"),
    ).toBeDefined();
  });
  it("accepts only a complete bounded public acknowledgement and keeps internal solve constraints private", () => {
    const input = {
      type: "acknowledge_direction_reference",
      characterId: "char-nora",
      unitId: "unit-coat-oxblood",
      sourceRevision: 10,
      referenceHash: "a".repeat(64),
      acknowledgedBy: "Reviewer",
      rationale: "Keep the words deliberately.",
    };
    expect(commandSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { sourceRevision: -1 },
      { referenceHash: "a".repeat(63) },
      { referenceHash: "A".repeat(64) },
      { acknowledgedBy: " " },
      { rationale: " " },
      { rationale: "x".repeat(1001) },
      { approved: true },
      { acknowledgedRevision: 11 },
      { directionHash: "b".repeat(64) },
    ])
      expect(commandSchema.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
    expect(
      commandSchema.safeParse({
        type: "solve_allocation",
        fixedCandidateIds: ["candidate-nora-burgundy"],
      }).success,
    ).toBe(false);
  });
});

describe("R3 concise fresh data, preserved stored truth", () => {
  it("uses short example names without changing provenance, permissions or provider input lineage", () => {
    const p = example(),
      beforeDisplay = structuredClone(p);
    expect(p.units[0]).toMatchObject({
      supplier: "Seabright Wardrobe",
      condition: "Not inspected.",
      priceSource: "Quote for the production window.",
      fitting: {
        status: "not_measured",
        evidence: "Not fitted yet.",
        provenance: "synthetic",
      },
      availability: { confirmed: false, provenance: "synthetic" },
    });
    expect(p.events[0].summary).toBe("Created the example production.");
    expect(p.detailReferences![0].name).toBe("Small brass pendant");
    expect(p.script).toMatchObject({
      label: "Draft 2",
      provenance: "synthetic",
    });
    expect(p.performers[0].consent.purpose).toContain("Synthetic");
    beforeDisplay.units.forEach((unit) => {
      unit.supplier = "Seabright Wardrobe · synthetic supplier";
      unit.condition =
        "Synthetic catalogue record; physical condition not inspected.";
      unit.priceSource =
        "Synthetic GBP quote for the full production window; charged once per physical unit.";
    });
    beforeDisplay.looks.forEach(
      (look) =>
        (look.note =
          "Synthetic design and preparation estimate. Garment previews, separate makeup detail and physical evidence carry their own provenance."),
    );
    expect(previewInputHash(p, nora(p))).toBe(
      previewInputHash(beforeDisplay, nora(beforeDisplay)),
    );
    expect(candidateInputHash(p, "candidate-nora-burgundy")).toBe(
      candidateInputHash(beforeDisplay, "candidate-nora-burgundy"),
    );
    expect(getReadiness(p, TEST_NOW).ready).toBe(false);
  });
  it("records short example approval data and keeps real unresolved warnings without a generic example item", () => {
    let p = example();
    for (const look of p.looks)
      p = command(p, {
        type: "add_preview",
        lookId: look.id,
        preview: doubleOutput(p, look.id),
      });
    p = command(p, { type: "set_example_decisions", enabled: true });
    for (const look of p.looks)
      expect(getCurrentApproval(look, p)).toMatchObject({
        approvedBy: "Example reviewer",
        rationale: "Example approval.",
        decisionSource: "example",
      });
    expect(p.events.at(-1)!.summary).toBe("Recorded 8 example approvals.");
    p = command(p, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Open items",
    });
    const pack = p.packs.at(-1)!;
    expect(
      pack.warnings.some((item) => /synthetic production exercise/i.test(item)),
    ).toBe(false);
    expect(
      pack.warnings.some((item) => item.endsWith(": supplier unconfirmed")),
    ).toBe(true);
    expect(
      pack.warnings.some((item) =>
        item.includes("cover every required physical unit"),
      ),
    ).toBe(true);
    expect(pack.title).toMatch(/^Working pack/);
    expect(getReadiness(p, TEST_NOW).ready).toBe(false);
  });
  it("does not rewrite old saved labels or frozen records during an unrelated command", () => {
    const legacy = legacyExample(),
      original = JSON.stringify(legacy),
      units = structuredClone(legacy.units),
      events = structuredClone(legacy.events);
    const changed = command(legacy, {
      type: "update_production",
      title: "Renamed existing book",
    });
    expect(changed.units).toEqual(units);
    expect(changed.events.slice(0, -1)).toEqual(events);
    expect(JSON.stringify(legacy)).toBe(original);
  });
});
