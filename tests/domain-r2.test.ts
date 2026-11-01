import { describe, expect, it } from "vitest";
import type {
  AllocationConfirmation,
  AllocationResult,
  Production,
} from "@/lib/types";
import {
  createExampleProduction,
  getAllocationDecisionSummary,
  getAllocationStatus,
  getAllocationAdoptionReview,
  getAllocationSwaps,
  getCreativeReferenceFlags,
  getCurrentCreativeReferenceFlags,
  getCurrentApproval,
  getCurrentPreview,
  solveAllocation,
  DomainError,
} from "@/lib/domain";
import {
  approveManaged,
  command,
  doubleOutput,
  reviewCandidate,
  TEST_NOW,
} from "./domain-support";
const example = () => createExampleProduction("r2-test", TEST_NOW);
const look = (p: Production, id = "look-nora") =>
  p.looks.find((item) => item.id === id)!;
function approveOne(p: Production, id: string): Production {
  const preview = doubleOutput(p, id);
  p = command(p, { type: "add_preview", lookId: id, preview });
  return command(p, {
    type: "approve_look",
    lookId: id,
    previewId: preview.id,
    approvedBy: "Synthetic evaluator",
    rationale: "Test-only exact-output decision.",
  });
}
function candidate(
  p: Production,
  unitId = "unit-coat-burgundy",
  lookId = "look-nora",
): Production {
  p = command(p, { type: "create_candidate", lookId, unitIds: [unitId] });
  return reviewCandidate(p, p.appearanceCandidates!.at(-1)!.id);
}
function confirmation(p: Production): AllocationConfirmation {
  const review = getAllocationAdoptionReview(p, p.allocationResult!);
  return {
    proposalId: review.proposalId,
    inputHash: review.inputHash,
    sourceRevision: review.sourceRevision,
    reviewHash: review.reviewHash,
  };
}
function code(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).code;
  }
  throw new Error("Expected rejection");
}
const solve = (p: Production) => command(p, { type: "solve_allocation" });
const swapPlan = () => solve(candidate(approveManaged(example())));

describe("R2 decisions are separate from physical conflicts", () => {
  it("reports eight unique dressed looks needing decisions without assigning any unapproved item", () => {
    const p = example(),
      result = solveAllocation(p, { now: TEST_NOW });
    expect(result).toMatchObject({
      status: "DECISIONS_NEEDED",
      assignments: [],
      constraintChecked: false,
      decisions: { looksTotal: 8, approvedLooks: 0 },
    });
    expect(result.decisions!.missingLookIds).toHaveLength(8);
    expect(new Set(result.decisions!.missingLookIds).size).toBe(8);
    expect(result.findings.some((item) => item.severity === "conflict")).toBe(
      false,
    );
    expect(
      result.findings
        .filter((item) => item.code === "APPEARANCE_APPROVAL_REQUIRED")
        .every((item) => item.severity === "unverified"),
    ).toBe(true);
    const saved = solve(p);
    expect(
      code(() =>
        command(saved, {
          type: "adopt_allocation",
          inputHash: saved.allocationResult!.inputHash,
        }),
      ),
    ).toBe("ALLOCATION_NOT_FEASIBLE");
  });
  it("counts a repeated look once, a scoped approval twice, and no own-clothes or unscheduled looks", () => {
    let p = example();
    const unscheduled = structuredClone(look(p));
    Object.assign(unscheduled, {
      id: "look-unscheduled",
      sceneIds: ["scene-unscheduled"],
    });
    delete unscheduled.continuityGroupId;
    p.looks.push(unscheduled);
    p.characters.push({
      ...structuredClone(p.characters[0]),
      id: "char-own",
      ownClothes: true,
    });
    const own = structuredClone(unscheduled);
    Object.assign(own, {
      id: "look-own",
      characterId: "char-own",
      sceneIds: ["scene-01"],
    });
    p.looks.push(own);
    const empty = structuredClone(unscheduled);
    Object.assign(empty, {
      id: "look-empty",
      unitIds: [],
      sceneIds: ["scene-01"],
    });
    p.looks.push(empty);
    p.occurrences.push({
      ...structuredClone(p.occurrences[0]),
      id: "repeated-call",
      sceneId: "scene-01",
    });
    expect(getAllocationDecisionSummary(p)).toMatchObject({
      looksTotal: 8,
      approvedLooks: 0,
    });
    p = approveOne(p, "look-nora");
    expect(getAllocationDecisionSummary(p)).toMatchObject({
      looksTotal: 8,
      approvedLooks: 1,
    });
    p = reviewCandidate(p, "candidate-nora-charcoal");
    const summary = getAllocationDecisionSummary(p);
    expect(summary).toMatchObject({ looksTotal: 8, approvedLooks: 2 });
    expect(summary.missingLookIds).not.toContain("look-nora");
    expect(summary.missingLookIds).not.toContain("look-nora-finale");
    expect(summary.missingLookIds).toHaveLength(6);
  });
  it("does not require an unscheduled continuity variant's base decision", () => {
    let p = example();
    p.occurrences = p.occurrences.filter((item) => item.sceneId !== "scene-07");
    p.looks = p.looks.filter(
      (item) => !["look-mae", "look-julian-finale"].includes(item.id),
    );
    for (const item of p.looks.filter((item) => item.id !== "look-nora-finale"))
      p = approveOne(p, item.id);
    expect(getAllocationDecisionSummary(p).missingLookIds).toEqual([]);
    expect(solveAllocation(p, { now: TEST_NOW }).status).toBe("FEASIBLE");
  });
  it("keeps genuine overlap, hard-budget and unavailable-stock failures red while decisions are also missing", () => {
    const overlap = example(),
      a = overlap.occurrences.find((item) => item.id === "occ-01")!,
      b = overlap.occurrences.find((item) => item.id === "occ-04")!;
    a.start = b.start;
    a.end = b.end;
    const budget = example();
    budget.budgetCents = 1;
    const unavailable = example();
    unavailable.units.forEach((unit) => (unit.status = "unavailable"));
    const missingCoat = example();
    missingCoat.units.find((unit) => unit.id === "unit-coat-oxblood")!.status =
      "unavailable";
    for (const [p, expected] of [
      [overlap, "PERFORMER_OVERLAP"],
      [budget, "HARD_BUDGET"],
      [unavailable, "UNIT_UNAVAILABLE"],
      [missingCoat, "UNIT_UNAVAILABLE"],
    ] as const) {
      const result = solveAllocation(p, { now: TEST_NOW });
      expect(result.status).toBe("INFEASIBLE");
      expect(result.assignments).toEqual([]);
      expect(
        result.findings.some(
          (item) => item.code === expected && item.severity === "conflict",
        ),
      ).toBe(true);
      expect(
        result.findings.some(
          (item) =>
            item.code === "APPEARANCE_APPROVAL_REQUIRED" &&
            item.severity === "unverified",
        ),
      ).toBe(true);
    }
  });
  it("reads approval-only legacy red results as amber without changing saved JSON or hiding other conflicts", () => {
    const p = example(),
      fresh = solveAllocation(p, { now: TEST_NOW }),
      legacy: AllocationResult = {
        ...fresh,
        status: "INFEASIBLE",
        findings: fresh.findings.map((item) =>
          item.code === "APPEARANCE_APPROVAL_REQUIRED"
            ? { ...item, severity: "conflict" }
            : item,
        ),
      };
    delete legacy.decisions;
    delete legacy.proposalId;
    delete legacy.swaps;
    delete legacy.originalRecipes;
    const before = JSON.stringify(legacy);
    expect(getAllocationStatus(p, legacy)).toBe("DECISIONS_NEEDED");
    expect(getAllocationDecisionSummary(p, legacy).missingLookIds).toHaveLength(
      8,
    );
    expect(JSON.stringify(legacy)).toBe(before);
    legacy.findings.push({
      id: "real-overlap",
      code: "UNIT_OVERLAP",
      severity: "conflict",
      message: "A real overlap",
      unitIds: [],
      lookIds: [],
      occurrenceIds: [],
    });
    expect(getAllocationStatus(p, legacy)).toBe("INFEASIBLE");
  });
  it("returns the approved fixed £500 plan and keeps no-swap legacy adoption compatible", () => {
    const p = solve(approveManaged(example()));
    expect(p.allocationResult).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
      totalCostCents: 50000,
      decisions: { looksTotal: 8, approvedLooks: 8 },
    });
    expect(getAllocationSwaps(p, p.allocationResult!)).toEqual([]);
    const old = structuredClone(p);
    delete old.allocationResult!.proposalId;
    delete old.allocationResult!.decisions;
    delete old.allocationResult!.originalRecipes;
    delete old.allocationResult!.swaps;
    delete old.allocationResult!.choiceComparisons;
    expect(
      command(old, {
        type: "adopt_allocation",
        inputHash: old.allocationResult!.inputHash,
      }).allocations,
    ).toHaveLength(17);
  });
});

describe("R2 exact swap confirmation and direction continuity", () => {
  it("shows the exact original-to-selected scope and direction references, rejecting an unconfirmed swap immutably", () => {
    const p = swapPlan(),
      before = JSON.stringify(p),
      review = getAllocationAdoptionReview(p, p.allocationResult!);
    expect(review.confirmationRequired).toBe(true);
    expect(review.swaps).toHaveLength(1);
    expect(review.swaps[0]).toMatchObject({
      lookIds: ["look-nora", "look-nora-finale"],
      fromUnitIds: ["unit-coat-oxblood"],
      toUnitIds: ["unit-coat-burgundy"],
      sceneIds: ["scene-01", "scene-04", "scene-07"],
      occurrenceIds: ["occ-01", "occ-04", "occ-07"],
    });
    expect(review.creativeFlags[0].references).toContain("Oxblood");
    expect(
      code(() =>
        command(p, {
          type: "adopt_allocation",
          inputHash: p.allocationResult!.inputHash,
        }),
      ),
    ).toBe("ALLOCATION_SWAP_CONFIRMATION_REQUIRED");
    expect(JSON.stringify(p)).toBe(before);
  });
  it("rejects a confirmation for the wrong proposal, input, revision or review hash", () => {
    const p = swapPlan(),
      token = confirmation(p);
    for (const patch of [
      { proposalId: "another-proposal" },
      { inputHash: "0".repeat(64) },
      { sourceRevision: token.sourceRevision - 1 },
      { reviewHash: "1".repeat(64) },
    ])
      expect(
        code(() =>
          command(p, {
            type: "adopt_allocation",
            inputHash: p.allocationResult!.inputHash,
            confirmation: { ...token, ...patch },
          }),
        ),
      ).toBe("STALE_ALLOCATION_CONFIRMATION");
  });
  it("invalidates the token on identical recompute and on both command and bare fact/intent races", () => {
    const p = swapPlan(),
      token = confirmation(p),
      again = solve(p);
    expect(again.allocationResult!.inputHash).toBe(
      p.allocationResult!.inputHash,
    );
    expect(again.allocationResult!.proposalId).not.toBe(
      p.allocationResult!.proposalId,
    );
    expect(
      code(() =>
        command(again, {
          type: "adopt_allocation",
          inputHash: again.allocationResult!.inputHash,
          confirmation: token,
        }),
      ),
    ).toBe("STALE_ALLOCATION_CONFIRMATION");
    const edited = command(p, {
      type: "update_production",
      title: "Concurrent title",
    });
    expect(
      code(() =>
        command(edited, {
          type: "adopt_allocation",
          inputHash: p.allocationResult!.inputHash,
          confirmation: token,
        }),
      ),
    ).toBe("STALE_ALLOCATION");
    const fact = structuredClone(p);
    fact.units[0].version++;
    expect(
      getAllocationAdoptionReview(fact, fact.allocationResult!).reviewHash,
    ).not.toBe(token.reviewHash);
    expect(
      code(() =>
        command(fact, {
          type: "adopt_allocation",
          inputHash: p.allocationResult!.inputHash,
          confirmation: token,
        }),
      ),
    ).toBe("STALE_ALLOCATION");
    const intent = structuredClone(p);
    intent.characters[0].direction.text = "New creative intent";
    expect(
      getAllocationAdoptionReview(intent, intent.allocationResult!).reviewHash,
    ).not.toBe(token.reviewHash);
    expect(
      code(() =>
        command(intent, {
          type: "adopt_allocation",
          inputHash: p.allocationResult!.inputHash,
          confirmation: token,
        }),
      ),
    ).toBe("STALE_ALLOCATION");
  });
  it("rejects a prepared confirmation after candidate revocation or bare scope changes", () => {
    const p = swapPlan(),
      token = confirmation(p),
      chosen = p.appearanceCandidates!.find(
        (item) =>
          item.id ===
          p.allocationResult!.assignments.find((item) => item.candidateId)
            ?.candidateId,
      )!;
    const revoked = command(p, {
      type: "revoke_candidate_approval",
      candidateId: chosen.id,
      approvalId: chosen.approvals.at(-1)!.id,
    });
    expect(
      code(() =>
        command(revoked, {
          type: "adopt_allocation",
          inputHash: p.allocationResult!.inputHash,
          confirmation: token,
        }),
      ),
    ).toBe("STALE_ALLOCATION");
    const scope = structuredClone(p);
    scope.appearanceCandidates!.find((item) => item.id === chosen.id)!.lookIds =
      ["look-nora"];
    expect(
      getAllocationAdoptionReview(scope, scope.allocationResult!).reviewHash,
    ).not.toBe(token.reviewHash);
    expect(
      code(() =>
        command(scope, {
          type: "adopt_allocation",
          inputHash: p.allocationResult!.inputHash,
          confirmation: token,
        }),
      ),
    ).toBe("STALE_ALLOCATION");
  });
  it("retains reviewed identity and frozen history, persisting removed-reference flags until current direction is corrected", () => {
    let p = approveManaged(example());
    p = command(p, {
      type: "create_pack",
      occurrenceIds: ["occ-01"],
      title: "Before deliberate swap",
    });
    const frozen = structuredClone(p.packs[0].snapshot);
    p = solve(candidate(p));
    const review = getAllocationAdoptionReview(p, p.allocationResult!),
      decision = p.appearanceCandidates!.at(-1)!.approvals.at(-1)!;
    const adopted = command(p, {
      type: "adopt_allocation",
      inputHash: p.allocationResult!.inputHash,
      confirmation: confirmation(p),
    });
    expect(getCurrentApproval(look(adopted), adopted)?.id).toBe(decision.id);
    expect(adopted.allocationResult!.acceptedConfirmation).toEqual(
      confirmation(p),
    );
    expect(adopted.packs[0].snapshot).toEqual(frozen);
    expect(adopted.packs[0].state).toBe("superseded");
    expect(getAllocationSwaps(adopted, adopted.allocationResult!)).toEqual(
      review.swaps,
    );
    expect(
      getAllocationAdoptionReview(adopted, adopted.allocationResult!)
        .creativeFlags,
    ).toEqual(review.creativeFlags);
    const preview = getCurrentPreview(look(adopted), adopted)!;
    const recomputed = solve(adopted);
    expect(
      getAllocationSwaps(recomputed, recomputed.allocationResult!),
    ).toEqual([]);
    expect(
      getAllocationAdoptionReview(recomputed, recomputed.allocationResult!)
        .creativeFlags,
    ).toEqual(review.creativeFlags);
    const corrected = command(recomputed, {
      type: "edit_direction",
      characterId: "char-nora",
      text: "A long burgundy wool coat repeats through the story.",
      essential: ["Long wool outer layer"],
    });
    expect(
      getAllocationAdoptionReview(corrected, corrected.allocationResult!)
        .creativeFlags,
    ).toEqual([]);
    expect(
      getCreativeReferenceFlags(
        corrected,
        review.swaps[0].lookIds,
        review.swaps[0].fromUnitIds,
      ),
    ).toEqual([]);
    expect(getCurrentPreview(look(corrected), corrected)?.id).toBe(preview.id);
    expect(getCurrentApproval(look(corrected), corrected)).toBeUndefined();
  });
  it("clears removed-item flags when the working garment is explicitly restored", () => {
    const p = swapPlan();
    const adopted = command(p, {
      type: "adopt_allocation",
      inputHash: p.allocationResult!.inputHash,
      confirmation: confirmation(p),
    });
    expect(
      getCurrentCreativeReferenceFlags(adopted).some(
        (flag) => flag.unitId === "unit-coat-oxblood",
      ),
    ).toBe(true);
    let restored = adopted;
    for (const id of ["look-nora", "look-nora-finale"])
      restored = command(restored, {
        type: "update_look",
        lookId: id,
        unitIds: ["unit-coat-oxblood"],
      });
    expect(
      getCurrentCreativeReferenceFlags(restored).some(
        (flag) => flag.unitId === "unit-coat-oxblood",
      ),
    ).toBe(false);
    expect(look(restored).removedUnitIds).not.toContain("unit-coat-oxblood");
    expect(getCurrentApproval(look(restored), restored)).toBeUndefined();
  });
});

function physicalScenario(changeover = false): Production {
  const p = example(),
    a = structuredClone(look(p)),
    b = structuredClone(a);
  delete a.continuityGroupId;
  delete b.continuityGroupId;
  Object.assign(a, {
    id: "look-a",
    sceneIds: ["scene-a"],
    unitIds: ["unit-coat-oxblood"],
    preparationMinutes: 0,
    preparationEvidence: "estimate",
    beauty: undefined,
    details: [],
  });
  Object.assign(b, {
    id: "look-b",
    characterId: "char-elias",
    performerId: "performer-theo",
    sceneIds: ["scene-b"],
    unitIds: ["unit-coat-charcoal"],
    preparationMinutes: 0,
    preparationEvidence: "estimate",
    beauty: undefined,
    details: [],
  });
  p.characters = p.characters.filter((character) =>
    ["char-nora", "char-elias"].includes(character.id),
  );
  p.looks = [a, b];
  if (changeover) {
    const next = structuredClone(a);
    Object.assign(next, { id: "look-next", sceneIds: ["scene-next"] });
    p.looks.push(next);
  }
  p.scenes = p.looks.map((item, index) => ({
    ...structuredClone(p.scenes[0]),
    id: item.sceneIds[0],
    number: String(index + 1),
    characterIds: [item.characterId],
    lookIds: [item.id],
    requirements: [],
  }));
  p.occurrences = p.looks.map((item, index) => ({
    ...structuredClone(p.occurrences[0]),
    id: `call-${index}`,
    sceneId: item.sceneIds[0],
    start: `2026-11-09T${changeover ? (index === 0 ? "10" : index === 1 ? "12" : "11") : "10"}:00:00.000Z`,
    end: `2026-11-09T${changeover ? (index === 0 ? "10" : index === 1 ? "12" : "11") : "10"}:30:00.000Z`,
  }));
  p.units = p.units.filter((unit) =>
    ["unit-coat-oxblood", "unit-coat-charcoal"].includes(unit.id),
  );
  if (changeover) p.units.forEach((unit) => (unit.priceCents = 100));
  p.appearanceCandidates = [];
  p.transitions = [];
  p.sourcing = [];
  p.allocations = [];
  p.allocationResult = null;
  return approveManaged(p);
}
describe("R2 comparative physical choice explanations", () => {
  it("keeps multi-unit recipe slots intact when displaying sorted physical references", () => {
    let p = physicalScenario();
    p.looks = [p.looks[0]];
    p.looks[0].unitIds = ["unit-coat-oxblood", "unit-coat-charcoal"];
    p.looks[0].revision++;
    p.scenes = [p.scenes[0]];
    p.occurrences = [p.occurrences[0]];
    p = solve(approveManaged(p));
    expect(p.allocationResult).toMatchObject({
      status: "FEASIBLE",
      totalCostCents: 25500,
    });
    expect(
      p.allocationResult!.choiceComparisons![0].choices.find(
        (item) => item.selected,
      ),
    ).toMatchObject({ original: true, findings: [], planCostDeltaCents: 0 });
  });
  it("retains the losing original recipe and separates unit quote from whole-plan cost difference", () => {
    const p = swapPlan(),
      group = p.allocationResult!.choiceComparisons!.find(
        (item) => item.groupId === "continuity-nora-coat",
      )!;
    expect(group.originalUnitIds).toEqual(["unit-coat-oxblood"]);
    expect(group.selectedUnitIds).toEqual(["unit-coat-burgundy"]);
    expect(group.choices.find((item) => item.original)).toMatchObject({
      selected: false,
      admissible: true,
      quoteCents: 14500,
      planCostDeltaCents: 1500,
      reason: "higher_cost",
    });
    expect(group.choices.find((item) => item.selected)).toMatchObject({
      quoteCents: 13000,
      planCostDeltaCents: 0,
      reason: "selected",
    });
    expect(
      group.choices.find((item) => item.unitIds[0] === "unit-coat-charcoal"),
    ).toMatchObject({
      admissible: false,
      quoteCents: 11000,
      planCostDeltaCents: -2000,
      reason: "approval_required",
    });
    const adopted = command(p, {
      type: "adopt_allocation",
      inputHash: p.allocationResult!.inputHash,
      confirmation: confirmation(p),
    });
    expect(adopted.allocationResult!.choiceComparisons).toEqual(
      p.allocationResult!.choiceComparisons,
    );
  });
  it("explains an approved lower-quote unit's actual overlap with the other saved assignments", () => {
    const p = solve(
        candidate(physicalScenario(), "unit-coat-charcoal", "look-a"),
      ),
      group = p.allocationResult!.choiceComparisons!.find((item) =>
        item.lookIds.includes("look-a"),
      )!,
      loser = group.choices.find(
        (item) => item.unitIds[0] === "unit-coat-charcoal",
      )!;
    expect(p.allocationResult!.status).toBe("OPTIMAL");
    expect(loser).toMatchObject({
      admissible: true,
      selected: false,
      quoteCents: 11000,
      planCostDeltaCents: -14500,
      reason: "overlap",
    });
    expect(loser.findings.some((item) => item.code === "UNIT_OVERLAP")).toBe(
      true,
    );
  });
  it("explains equal-cost alternatives using the implemented performer-changeover objective", () => {
    const p = solve(
        candidate(physicalScenario(true), "unit-coat-charcoal", "look-next"),
      ),
      group = p.allocationResult!.choiceComparisons!.find((item) =>
        item.lookIds.includes("look-next"),
      )!,
      loser = group.choices.find(
        (item) => item.unitIds[0] === "unit-coat-charcoal",
      )!;
    expect(p.allocationResult).toMatchObject({
      status: "OPTIMAL",
      totalCostCents: 200,
    });
    expect(loser).toMatchObject({
      admissible: true,
      selected: false,
      quoteCents: 100,
      planCostDeltaCents: 0,
      changeoverDelta: 1,
      reason: "more_changeovers",
      findings: [],
    });
  });
  it("explains current availability failure without claiming an artistic rejection", () => {
    let p = candidate(approveManaged(example()));
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-burgundy",
      status: "unavailable",
    });
    p = solve(p);
    const alternative = p
      .allocationResult!.choiceComparisons!.find(
        (item) => item.groupId === "continuity-nora-coat",
      )!
      .choices.find((item) => item.unitIds[0] === "unit-coat-burgundy")!;
    expect(p.allocationResult!.status).toBe("FEASIBLE");
    expect(alternative).toMatchObject({
      admissible: true,
      reason: "availability",
      planCostDeltaCents: -1500,
    });
    expect(
      alternative.findings.some((item) => item.code === "UNIT_UNAVAILABLE"),
    ).toBe(true);
  });
  it("shows the actual hard-budget consequence of an approved losing recipe", () => {
    let p = candidate(approveManaged(example()));
    p = command(p, {
      type: "update_unit",
      unitId: "unit-coat-burgundy",
      priceCents: 16000,
    });
    p = solve(p);
    const alternative = p
      .allocationResult!.choiceComparisons!.find(
        (item) => item.groupId === "continuity-nora-coat",
      )!
      .choices.find((item) => item.unitIds[0] === "unit-coat-burgundy")!;
    expect(p.allocationResult).toMatchObject({
      status: "OPTIMAL",
      totalCostCents: 50000,
    });
    expect(alternative).toMatchObject({
      admissible: true,
      selected: false,
      quoteCents: 16000,
      planCostDeltaCents: 1500,
      reason: "hard_budget",
    });
    expect(
      alternative.findings.some((item) => item.code === "HARD_BUDGET"),
    ).toBe(true);
  });
});
