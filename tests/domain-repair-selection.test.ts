import { describe, expect, it } from "vitest";
import type { Production } from "@/lib/types";
import {
  createExampleProduction,
  DomainError,
  getCurrentApproval,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
  getCurrentPreview,
  solveAllocation,
} from "@/lib/domain";
import {
  approveManaged,
  command,
  doubleOutput,
  reviewCandidate,
  TEST_NOW,
} from "./domain-support";

const request = {
  type: "propose_change" as const,
  kind: "garment_unavailable" as const,
  subjectId: "unit-coat-oxblood",
  seeded: true,
};
function exampleDecisions(): Production {
  let p = createExampleProduction("repair-selection-test", TEST_NOW);
  // Schema-valid software doubles only; no provider, human or supplier outcome is claimed.
  for (const look of p.looks)
    p = command(p, {
      type: "add_preview",
      lookId: look.id,
      preview: doubleOutput(p, look.id),
    });
  return command(p, { type: "set_example_decisions", enabled: true });
}
function bothApproved(): Production {
  let p = reviewCandidate(exampleDecisions(), "candidate-nora-burgundy");
  p = command(p, { type: "solve_allocation" });
  p = command(p, request);
  return reviewCandidate(p, "candidate-nora-charcoal");
}
const option = (p: Production, unitId: string) =>
  p.proposals
    .at(-1)!
    .options.find((item) => item.replacementUnitId === unitId)!;
const noraLooks = (p: Production) =>
  p.looks.filter((look) => look.characterId === "char-nora");
const noraUnits = (p: Production) => [
  ...new Set(
    solveAllocation(p, { now: TEST_NOW })
      .assignments.filter((item) => item.lookId.startsWith("look-nora"))
      .map((item) => item.unitId),
  ),
];
function addReviewedCandidate(
  p: Production,
  lookId: string,
  unitId: string,
  performerId?: string,
): Production {
  p = command(p, {
    type: "create_candidate",
    lookId,
    unitIds: [unitId],
    ...(performerId ? { performerId } : {}),
  });
  return reviewCandidate(p, p.appearanceCandidates!.at(-1)!.id);
}

// Explicit repair feasibility must not be confused with the unrestricted cost objective.
describe("exact reviewed repair selection", () => {
  it("keeps both approved repairs feasible and preserves the chosen burgundy identity while global allocation prefers charcoal", () => {
    let p = reviewCandidate(exampleDecisions(), "candidate-nora-burgundy");
    p = command(p, { type: "solve_allocation" });
    expect(p.allocationResult).toMatchObject({
      status: "OPTIMAL",
      totalCostCents: 48500,
    });
    expect(p.allocationResult!.adoptedAt).toBeUndefined();
    expect(p.allocations).toEqual([]);
    expect(
      p.units.find((unit) => unit.id === "unit-coat-oxblood")!.status,
    ).toBe("available");
    expect(
      noraLooks(p).every((look) => look.unitIds[0] === "unit-coat-oxblood"),
    ).toBe(true);
    p = command(p, request);
    expect(option(p, "unit-coat-burgundy")).toMatchObject({
      feasible: true,
      requiresVisualApproval: false,
    });
    expect(option(p, "unit-coat-charcoal")).toMatchObject({
      feasible: false,
      requiresVisualApproval: true,
    });
    p = reviewCandidate(p, "candidate-nora-charcoal");
    p = command(p, request);
    for (const [id, delta] of [
      ["unit-coat-burgundy", -1500],
      ["unit-coat-charcoal", -3500],
    ] as const) {
      expect(option(p, id)).toMatchObject({
        feasible: true,
        requiresVisualApproval: false,
        costDeltaCents: delta,
      });
      expect(
        option(p, id).findings.filter(
          (finding) => finding.severity === "conflict",
        ),
      ).toEqual([]);
    }
    expect(solveAllocation(p, { now: TEST_NOW })).toMatchObject({
      status: "OPTIMAL",
      totalCostCents: 46500,
    });
    expect(noraUnits(p)).toEqual(["unit-coat-charcoal"]);
    const candidate = p.appearanceCandidates!.find(
      (item) => item.id === "candidate-nora-burgundy",
    )!;
    const approval = getCurrentCandidateApproval(p, candidate)!,
      preview = getCurrentCandidatePreview(p, candidate)!;
    const before = JSON.stringify(p),
      proposal = p.proposals.at(-1)!;
    const adopted = command(p, {
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId: option(p, "unit-coat-burgundy").id,
    });
    expect(JSON.stringify(p)).toBe(before);
    for (const look of noraLooks(adopted)) {
      expect(look.unitIds).toEqual(["unit-coat-burgundy"]);
      expect(look.activeCandidateId).toBe(candidate.id);
      expect(getCurrentApproval(look, adopted)?.id).toBe(approval.id);
      expect(getCurrentPreview(look, adopted)?.id).toBe(preview.id);
    }
    expect(
      getCurrentCandidateApproval(adopted, "candidate-nora-charcoal"),
    ).toBeDefined();
    expect(noraUnits(adopted)).toEqual(["unit-coat-charcoal"]);
  });

  it.each(["unavailable", "over_budget", "overlap", "unapproved"] as const)(
    "blocks an explicit %s burgundy repair even when charcoal remains feasible",
    (cause) => {
      let p = bothApproved();
      if (cause === "unavailable")
        p = command(p, {
          type: "update_unit",
          unitId: "unit-coat-burgundy",
          status: "unavailable",
        });
      if (cause === "over_budget")
        p = command(p, {
          type: "update_unit",
          unitId: "unit-coat-burgundy",
          priceCents: 16000,
        });
      if (cause === "overlap") {
        p = command(p, { type: "update_production", budgetCents: 80000 });
        p = command(p, {
          type: "update_look",
          lookId: "look-elias",
          unitIds: ["unit-coat-burgundy"],
          category: "outerwear",
        });
        p = approveManaged(p);
      }
      if (cause === "unapproved") {
        const candidate = p.appearanceCandidates!.find(
          (item) => item.id === "candidate-nora-burgundy",
        )!;
        p = command(p, {
          type: "revoke_candidate_approval",
          candidateId: candidate.id,
          approvalId: candidate.approvals.at(-1)!.id,
        });
      }
      p = command(p, request);
      const selected = option(p, "unit-coat-burgundy");
      expect(selected.feasible).toBe(false);
      expect(option(p, "unit-coat-charcoal").feasible).toBe(true);
      if (cause === "unapproved")
        expect(selected.requiresVisualApproval).toBe(true);
      else {
        const code = {
          unavailable: "UNIT_UNAVAILABLE",
          over_budget: "HARD_BUDGET",
          overlap: "UNIT_OVERLAP",
        }[cause];
        expect(
          selected.findings.some(
            (item) => item.code === code && item.severity === "conflict",
          ),
        ).toBe(true);
      }
      const before = JSON.stringify(p);
      expect(() =>
        command(p, {
          type: "adopt_repair",
          proposalId: p.proposals.at(-1)!.id,
          optionId: selected.id,
        }),
      ).toThrowError(DomainError);
      expect(JSON.stringify(p)).toBe(before);
    },
  );

  it("pins only the recast scopes, preserving the exact approved original-coat output while unrelated approved choices remain optimizable", () => {
    let p = exampleDecisions();
    p = addReviewedCandidate(
      p,
      "look-nora",
      "unit-coat-oxblood",
      "performer-celeste",
    );
    const recastCandidate = p.appearanceCandidates!.at(-1)!;
    const approvalId = getCurrentCandidateApproval(p, recastCandidate)!.id,
      previewId = getCurrentCandidatePreview(p, recastCandidate)!.id;
    p = addReviewedCandidate(
      p,
      "look-nora",
      "unit-coat-burgundy",
      "performer-celeste",
    );
    p = addReviewedCandidate(p, "look-julian-finale", "unit-jacket-olive");
    const unrelatedCandidateId = p.appearanceCandidates!.at(-1)!.id;
    // Fixing Celeste to C-014 can meet this budget only if the unrelated approved jacket choice stays free.
    p = command(p, { type: "update_production", budgetCents: 46000 });
    p = command(p, {
      type: "propose_change",
      kind: "recast",
      subjectId: "performer-ada",
      replacementId: "performer-celeste",
      seeded: true,
    });
    const proposal = p.proposals.at(-1)!,
      selected = proposal.options[0];
    expect(selected).toMatchObject({
      feasible: true,
      requiresVisualApproval: false,
      candidateId: recastCandidate.id,
    });
    expect(selected.findings.some((item) => item.severity === "conflict")).toBe(
      false,
    );
    const adopted = command(p, {
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId: selected.id,
    });
    for (const look of noraLooks(adopted)) {
      expect(look.performerId).toBe("performer-celeste");
      expect(look.unitIds).toEqual(["unit-coat-oxblood"]);
      expect(getCurrentApproval(look, adopted)?.id).toBe(approvalId);
      expect(getCurrentPreview(look, adopted)?.id).toBe(previewId);
    }
    expect(
      adopted.looks.find((look) => look.id === "look-julian-finale")!.unitIds,
    ).toEqual(["unit-jacket-rust"]);
    expect(
      getCurrentCandidateApproval(adopted, unrelatedCandidateId),
    ).toBeDefined();
    expect(solveAllocation(adopted, { now: TEST_NOW })).toMatchObject({
      status: "OPTIMAL",
      totalCostCents: 43500,
    });
    expect(noraUnits(adopted)).toEqual(["unit-coat-burgundy"]);
  });
});
