import { describe, expect, it } from "vitest";
import type { Production, Transition } from "@/lib/types";
import {
  applyCommand,
  createExampleProduction,
  solveAllocation as runSolver,
  getCurrentCandidateApproval,
  validateAllocation,
} from "@/lib/domain";

import { approveManaged, command, reviewCandidate } from "./domain-support";

const NOW = "2026-10-31T12:00:00.000Z";
const EPOCH = Date.parse("2026-11-09T10:00:00.000Z");
const at = (minutes: number) => new Date(EPOCH + minutes * 60000).toISOString();
interface Slot {
  start: number;
  end: number;
  primary: number;
}

/** Physical-constraint tests arrange explicit test-only decisions; rejection/revocation is covered separately. */
function authorizePhysicalProblem(production: Production): Production {
  let p = structuredClone(production);
  p.appearanceCandidates = (p.appearanceCandidates ?? []).filter((candidate) =>
    candidate.lookIds.some((id) => {
      const look = p.looks.find((item) => item.id === id);
      return (
        look &&
        (look.activeCandidateId === candidate.id ||
          p.units
            .find((unit) => unit.id === look.unitIds[0])
            ?.approvedSubstituteIds.includes(candidate.recipe.unitIds[0]))
      );
    }),
  );
  p = approveManaged(p);
  for (const look of p.looks) {
    const primary = p.units.find((unit) => unit.id === look.unitIds[0]);
    for (const id of primary?.approvedSubstituteIds ?? []) {
      if (p.units.find((unit) => unit.id === id)?.category !== look.category)
        continue;
      const existing = p.appearanceCandidates?.find(
        (candidate) =>
          candidate.lookIds.length === 1 &&
          candidate.lookIds[0] === look.id &&
          candidate.recipe.unitIds[0] === id &&
          getCurrentCandidateApproval(p, candidate),
      );
      if (existing) continue;
      p = command(p, {
        type: "create_candidate",
        lookId: look.id,
        unitIds: [id],
      });
      p = reviewCandidate(p, p.appearanceCandidates!.at(-1)!.id);
    }
  }
  return p;
}
function solveAllocation(
  production: Production,
  options: Parameters<typeof runSolver>[1] = {},
) {
  Object.assign(production, authorizePhysicalProblem(production));
  return runSolver(production, options);
}

function problem(
  slots: Slot[],
  prices = [100, 200, 300],
  alternatives = true,
): Production {
  const fixture = createExampleProduction("solver-test", NOW);
  const production = structuredClone(fixture);
  production.performers = fixture.performers.slice(0, slots.length);
  production.characters = slots.map((_, index) => ({
    ...structuredClone(fixture.characters[0]),
    id: `character-${index}`,
    performerId: production.performers[index].id,
  }));
  production.scenes = slots.map((_, index) => ({
    ...structuredClone(fixture.scenes[0]),
    id: `scene-${index}`,
    title: `Scene ${index}`,
    characterIds: [`character-${index}`],
    lookIds: [`look-${index}`],
    requirements: [],
  }));
  production.units = prices.map((price, index) => ({
    ...structuredClone(fixture.units[0]),
    id: `unit-${index}`,
    code: `UNIT-${index}`,
    category: "upper_body",
    priceCents: price,
    approvedSubstituteIds: alternatives
      ? prices
          .map((_, other) => `unit-${other}`)
          .filter((id) => id !== `unit-${index}`)
      : [],
  }));
  production.looks = slots.map((slot, index) => ({
    ...structuredClone(fixture.looks[0]),
    id: `look-${index}`,
    characterId: `character-${index}`,
    performerId: production.performers[index].id,
    sceneIds: [`scene-${index}`],
    unitIds: [`unit-${slot.primary}`],
    category: "upper_body",
    preparationMinutes: 0,
    preparationEvidence: "observed",
  }));
  production.occurrences = slots.map((slot, index) => ({
    ...fixture.occurrences[0],
    id: `occ-${index}`,
    sceneId: `scene-${index}`,
    label: `Occurrence ${index}`,
    start: at(slot.start),
    end: at(slot.end),
    order: index + 1,
  }));
  for (const look of production.looks) {
    delete look.continuityGroupId;
    delete look.activeCandidateId;
    look.details = [];
  }
  production.appearanceCandidates = [];
  production.allocations = [];
  production.allocationResult = null;
  production.transitions = [];
  production.sourcing = [];
  production.packs = [];
  production.proposals = [];
  production.events = [];
  production.budgetCents = 10000;
  return authorizePhysicalProblem(production);
}

describe("physical-unit feasibility and the constraint checker", () => {
  it("two overlapping demands need two physical instances, with explicit alternative permission", () => {
    const slots = [
      { start: 0, end: 10, primary: 0 },
      { start: 0, end: 10, primary: 0 },
    ];
    const production = problem(slots, [100, 200]);
    const solved = solveAllocation(production, { now: NOW });
    expect(solved).toMatchObject({
      status: "OPTIMAL",
      constraintChecked: true,
      totalCostCents: 300,
    });
    expect(
      new Set(solved.assignments.map((assignment) => assignment.unitId)).size,
    ).toBe(2);
    expect(
      solved.assignments.every(
        (assignment) => !!assignment.approvalId && !!assignment.previewId,
      ),
    ).toBe(true);
    const forbidden = problem(slots, [100, 200], false);
    const impossible = solveAllocation(forbidden, { now: NOW });
    expect(impossible.status).toBe("INFEASIBLE");
    expect(impossible.assignments).toEqual([]);
    expect(
      impossible.findings.some((finding) => finding.code === "UNIT_OVERLAP"),
    ).toBe(true);
    expect(forbidden.looks.map((look) => look.unitIds)).toEqual([
      ["unit-0"],
      ["unit-0"],
    ]);
  });

  it("keeps the working recipe until explicit allocation adoption and preserves reviewed candidate identity", () => {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 0, end: 10, primary: 0 },
      ],
      [100, 200],
    );
    const solved = applyCommand(
      production,
      { type: "solve_allocation" },
      { actor: "test", now: NOW },
    );
    expect(solved.looks.every((look) => look.unitIds[0] === "unit-0")).toBe(
      true,
    );
    const adopted = applyCommand(
      solved,
      {
        type: "adopt_allocation",
        inputHash: solved.allocationResult!.inputHash,
      },
      { actor: "test", now: NOW },
    );
    expect(new Set(adopted.looks.map((look) => look.unitIds[0])).size).toBe(2);
    const reviewed = adopted.allocations.find(
      (assignment) => assignment.candidateId,
    )!;
    expect(
      adopted.looks.find((look) => look.id === reviewed.lookId)
        ?.activeCandidateId,
    ).toBe(reviewed.candidateId);
    expect(
      getCurrentCandidateApproval(adopted, reviewed.candidateId!)?.id,
    ).toBe(reviewed.approvalId);
  });

  it("reuses a held unit across nonoverlapping use and charges the production-window quote once", () => {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 20, end: 30, primary: 0 },
      ],
      [1250],
      false,
    );
    production.sourcing = [
      {
        ...createExampleProduction("source", NOW).sourcing[0],
        id: "custody",
        unitIds: ["unit-0"],
        from: at(-60),
        to: at(120),
        status: "held",
      },
    ];
    production.budgetCents = 1250;
    const solved = solveAllocation(production, { now: NOW });
    expect(solved).toMatchObject({
      status: "FEASIBLE",
      totalCostCents: 1250,
      constraintChecked: true,
    });
    expect(solved.assignments).toHaveLength(2);
    expect(
      solved.findings.some((finding) => finding.code === "UNIT_OVERLAP"),
    ).toBe(false);
  });

  it("preserves the hard budget and declared category even when other stock is available", () => {
    const expensive = problem(
      [{ start: 0, end: 10, primary: 0 }],
      [500],
      false,
    );
    expensive.budgetCents = 499;
    expect(solveAllocation(expensive, { now: NOW }).status).toBe("INFEASIBLE");
    expect(
      solveAllocation(expensive, { now: NOW }).findings.some(
        (finding) => finding.code === "HARD_BUDGET",
      ),
    ).toBe(true);
    const wrongCategory = problem(
      [{ start: 0, end: 10, primary: 0 }],
      [500, 100],
    );
    wrongCategory.units[0].status = "unavailable";
    wrongCategory.units[1].category = "shoes";
    expect(solveAllocation(wrongCategory, { now: NOW }).status).toBe(
      "INFEASIBLE",
    );
  });

  it("reserves recorded preparation, rejects a late availability window and exposes unknown transport", () => {
    const production = problem(
      [{ start: 0, end: 10, primary: 0 }],
      [500],
      false,
    );
    production.looks[0].preparationMinutes = 15;
    production.units[0].availability.from = at(-10);
    expect(solveAllocation(production, { now: NOW }).status).toBe("INFEASIBLE");
    production.units[0].availability.from = at(-20);
    production.units[0].location = "A different town";
    const solved = solveAllocation(production, { now: NOW });
    expect(solved.assignments[0].start).toBe(at(-15));
    expect(
      solved.findings.some(
        (finding) =>
          finding.code === "UNIT_LOCATION_UNVERIFIED" &&
          finding.severity === "unverified",
      ),
    ).toBe(true);
  });

  it("unknown preparation remains an evidence gap and a preview cannot establish physical fit", () => {
    const production = problem(
      [{ start: 0, end: 10, primary: 0 }],
      [500],
      false,
    );
    production.looks[0].preparationMinutes = null;
    production.looks[0].preparationEvidence = "unknown";
    production.units[0].fitting.status = "provisional";
    const result = solveAllocation(production, { now: NOW });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PREPARATION_UNKNOWN",
          severity: "unverified",
        }),
        expect.objectContaining({
          code: "FITTING_UNVERIFIED",
          severity: "unverified",
        }),
      ]),
    );
    expect(production.units[0].fitting.status).toBe("provisional");
  });

  it("the checker rejects forged intervals, omitted demands, wrong actors and unapproved units", () => {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 20, end: 30, primary: 1 },
      ],
      [100, 200],
      false,
    );
    production.looks[0].preparationMinutes = 5;
    const valid = solveAllocation(production, { now: NOW }).assignments;
    expect(validateAllocation(production, valid, { now: NOW }).valid).toBe(
      true,
    );
    const shrunk = structuredClone(valid);
    shrunk[0].start = at(0);
    expect(
      validateAllocation(production, shrunk, { now: NOW }).findings.some(
        (finding) => finding.code === "ALLOCATION_INTERVAL",
      ),
    ).toBe(true);
    expect(
      validateAllocation(production, valid.slice(1), { now: NOW }).valid,
    ).toBe(false);
    const wrongActor = structuredClone(valid);
    wrongActor[0].performerId = production.performers[1].id;
    expect(validateAllocation(production, wrongActor, { now: NOW }).valid).toBe(
      false,
    );
    const wrongUnit = structuredClone(valid);
    wrongUnit[0].unitId = "unit-1";
    expect(validateAllocation(production, wrongUnit, { now: NOW }).valid).toBe(
      false,
    );
    const duplicate = structuredClone(valid);
    duplicate[1].id = duplicate[0].id;
    expect(validateAllocation(production, duplicate, { now: NOW }).valid).toBe(
      false,
    );
    const outdated = structuredClone(production);
    outdated.units[0].status = "unavailable";
    expect(
      validateAllocation(outdated, valid, { now: NOW }).findings.some(
        (finding) => finding.code === "UNIT_UNAVAILABLE",
      ),
    ).toBe(true);
  });

  it("an intentionally overlapping schedule edit is impossible without changing the baseline fixture", () => {
    const baseline = createExampleProduction("baseline", NOW);
    const original = JSON.stringify(baseline);
    const target = baseline.occurrences.find(
      (occurrence) => occurrence.id === "occ-01",
    )!;
    const other = baseline.occurrences.find(
      (occurrence) => occurrence.id === "occ-04",
    )!;
    const impossible = applyCommand(
      baseline,
      {
        type: "update_occurrence",
        occurrence: { ...target, start: other.start, end: other.end },
      },
      { actor: "Seeded scenario evaluator", now: NOW },
    );
    const result = solveAllocation(impossible, { now: NOW });
    expect(result.status).toBe("INFEASIBLE");
    expect(
      result.findings.some((finding) => finding.code === "PERFORMER_OVERLAP"),
    ).toBe(true);
    expect(JSON.stringify(baseline)).toBe(original);
    expect(solveAllocation(baseline, { now: NOW }).status).toBe("FEASIBLE");
  });
});

describe("live directional changes, continuous wear and shared crew", () => {
  it("prepares a repeated live look once and retains its physical custody through gaps", () => {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 10, end: 20, primary: 0 },
        { start: 25, end: 30, primary: 0 },
      ],
      [500],
      false,
    );
    production.mode = "live_performance";
    production.performers = [production.performers[0]];
    production.characters = [production.characters[0]];
    production.looks = [
      {
        ...production.looks[0],
        sceneIds: production.scenes.map((scene) => scene.id),
        preparationMinutes: 10,
      },
    ];
    for (const scene of production.scenes) {
      scene.characterIds = [production.characters[0].id];
      scene.lookIds = [production.looks[0].id];
    }
    const solved = solveAllocation(production, { now: NOW });
    expect(solved).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
      totalCostCents: 500,
    });
    expect(
      solved.assignments.map((assignment) => [
        assignment.start,
        assignment.end,
      ]),
    ).toEqual([
      [at(-10), at(10)],
      [at(10), at(20)],
      [at(20), at(30)],
    ]);
    expect(
      solved.findings.some(
        (finding) =>
          finding.code === "UNIT_OVERLAP" ||
          finding.code === "TRANSITION_UNKNOWN",
      ),
    ).toBe(false);
    production.looks[0].preparationMinutes = null;
    production.looks[0].preparationEvidence = "unknown";
    expect(
      solveAllocation(production, { now: NOW }).findings.some(
        (finding) => finding.code === "PREPARATION_UNKNOWN",
      ),
    ).toBe(true);
  });

  it("invalidates the following continuous-wear interval when an earlier scene end changes", () => {
    let production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 10, end: 20, primary: 0 },
        { start: 25, end: 30, primary: 0 },
      ],
      [500],
      false,
    );
    production.mode = "live_performance";
    production.performers = [production.performers[0]];
    production.characters = [production.characters[0]];
    production.looks = [
      {
        ...production.looks[0],
        sceneIds: production.scenes.map((scene) => scene.id),
        preparationMinutes: 10,
      },
    ];
    for (const scene of production.scenes) {
      scene.characterIds = [production.characters[0].id];
      scene.lookIds = [production.looks[0].id];
    }
    production = applyCommand(
      authorizePhysicalProblem(production),
      { type: "solve_allocation" },
      { actor: "test", now: NOW },
    );
    production = applyCommand(
      production,
      {
        type: "adopt_allocation",
        inputHash: production.allocationResult!.inputHash,
      },
      { actor: "test", now: NOW },
    );
    const edited = applyCommand(
      production,
      {
        type: "update_occurrence",
        occurrence: { ...production.occurrences[1], end: at(21) },
      },
      { actor: "test", now: NOW },
    );
    expect(
      edited.allocations
        .filter((allocation) => allocation.state === "blocked")
        .map((allocation) => allocation.occurrenceId)
        .sort(),
    ).toEqual(["occ-1", "occ-2"]);
    expect(
      edited.allocations.find(
        (allocation) => allocation.occurrenceId === "occ-0",
      )!.state,
    ).toBe("allocated");
  });

  it("does not assume the reverse change duration, and rejects an insufficient exact gap", () => {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 15, end: 20, primary: 1 },
        { start: 30, end: 40, primary: 0 },
      ],
      [500, 600],
      false,
    );
    production.mode = "live_performance";
    const performerId = production.performers[0].id;
    production.looks[0].sceneIds.push("scene-2");
    production.looks[1].performerId = performerId;
    production.looks = production.looks.slice(0, 2);
    production.characters[1].performerId = performerId;
    production.scenes[2].characterIds = [production.characters[0].id];
    production.scenes[2].lookIds = [production.looks[0].id];
    const reverse: Transition = {
      id: "reverse",
      performerId,
      fromOccurrenceId: "occ-1",
      toOccurrenceId: "occ-2",
      minutes: 2,
      evidence: "observed",
      crewResource: null,
      crewCapacity: 1,
      note: "B to A only",
    };
    production.transitions = [reverse];
    let solved = solveAllocation(production, { now: NOW });
    expect(
      solved.findings.some(
        (finding) =>
          finding.code === "TRANSITION_UNKNOWN" &&
          finding.occurrenceIds.includes("occ-0"),
      ),
    ).toBe(true);
    expect(
      solved.findings.some(
        (finding) => finding.code === "TRANSITION_TOO_SHORT",
      ),
    ).toBe(false);
    production.transitions.push({
      ...reverse,
      id: "forward",
      fromOccurrenceId: "occ-0",
      toOccurrenceId: "occ-1",
      minutes: 6,
    });
    solved = solveAllocation(production, { now: NOW });
    expect(solved.status).toBe("INFEASIBLE");
    expect(
      solved.findings.some(
        (finding) => finding.code === "TRANSITION_TOO_SHORT",
      ),
    ).toBe(true);
    production.transitions[1].minutes = null;
    production.transitions[1].evidence = "unknown";
    solved = solveAllocation(production, { now: NOW });
    expect(
      solved.findings.some((finding) => finding.code === "TRANSITION_UNKNOWN"),
    ).toBe(true);
    expect(
      solved.findings.some(
        (finding) => finding.code === "TRANSITION_TOO_SHORT",
      ),
    ).toBe(false);
  });

  function sharedCrew(minutes: number, capacity: number): Production {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 20, end: 30, primary: 1 },
        { start: 0, end: 10, primary: 2 },
        { start: 20, end: 30, primary: 3 },
      ],
      [100, 200, 300, 400],
      false,
    );
    production.mode = "live_performance";
    production.looks[1].performerId = production.looks[0].performerId;
    production.looks[3].performerId = production.looks[2].performerId;
    production.characters[1].performerId = production.looks[0].performerId;
    production.characters[3].performerId = production.looks[2].performerId;
    production.transitions = [0, 2].map((index) => ({
      id: `change-${index}`,
      performerId: production.looks[index].performerId,
      fromOccurrenceId: `occ-${index}`,
      toOccurrenceId: `occ-${index + 1}`,
      minutes,
      evidence: "observed",
      crewResource: "Dresser A",
      crewCapacity: capacity,
      note: "Controlled test requirement",
    }));
    return production;
  }

  it("enforces cumulative dresser capacity instead of assuming a crew member twice", () => {
    const impossible = solveAllocation(sharedCrew(8, 1), { now: NOW });
    expect(impossible.status).toBe("INFEASIBLE");
    expect(
      impossible.findings.some((finding) => finding.code === "CREW_CAPACITY"),
    ).toBe(true);
    expect(solveAllocation(sharedCrew(8, 2), { now: NOW }).status).toBe(
      "FEASIBLE",
    );
  });

  it("can stagger two changes within a valid shared crew window", () => {
    const solved = solveAllocation(sharedCrew(5, 1), { now: NOW });
    expect(solved).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
    });
    expect(
      solved.findings.some((finding) => finding.code === "CREW_CAPACITY"),
    ).toBe(false);
  });
});

describe("bounded exact search and held-out exhaustive optima", () => {
  it("reports an unproved bounded answer honestly", () => {
    const production = problem(
      [
        { start: 0, end: 10, primary: 0 },
        { start: 0, end: 10, primary: 0 },
        { start: 0, end: 10, primary: 0 },
      ],
      [100, 200, 300],
    );
    expect(
      solveAllocation(production, { now: NOW, maxNodes: 1 }),
    ).toMatchObject({
      status: "UNKNOWN",
      independentlyChecked: false,
      assignments: [],
    });
    const feasible = solveAllocation(production, { now: NOW, maxNodes: 5 });
    expect(feasible.status).toBe("FEASIBLE");
    expect(feasible.independentlyChecked).toBe(false);
    expect(feasible.constraintChecked).toBe(true);
    expect(
      validateAllocation(production, feasible.assignments, { now: NOW }).valid,
    ).toBe(true);
  });

  it("agrees with a separate brute-force oracle across 192 small resource/budget problems", () => {
    let cases = 0;
    for (let mask = 0; mask < 8; mask++)
      for (const overlap of [false, true])
        for (const budget of [0, 150, 300, 600])
          for (const alternatives of [false, true, "partial"] as const) {
            const slots = [0, 1, 2].map((index) => ({
              start: overlap ? 0 : index * 15,
              end: overlap ? 10 : index * 15 + 10,
              primary: index % 2,
            }));
            const production = problem(
              slots,
              [100, 200, 300],
              alternatives !== false,
            );
            production.budgetCents = budget;
            production.units.forEach((unit, index) => {
              if (!(mask & (1 << index))) unit.status = "unavailable";
            });
            if (alternatives === "partial") {
              production.units[0].approvedSubstituteIds = ["unit-2"];
              production.units[1].approvedSubstituteIds = ["unit-0"];
            }
            let best: { changes: number; cost: number } | null = null;
            for (let a = 0; a < 3; a++)
              for (let b = 0; b < 3; b++)
                for (let c = 0; c < 3; c++) {
                  const selected = [a, b, c];
                  if (
                    selected.some(
                      (unit, index) =>
                        production.units[unit].status !== "available" ||
                        ![
                          production.units[slots[index].primary].id,
                          ...production.units[slots[index].primary]
                            .approvedSubstituteIds,
                        ].includes(`unit-${unit}`),
                    )
                  )
                    continue;
                  let valid = true;
                  for (let left = 0; left < 3; left++)
                    for (let right = left + 1; right < 3; right++)
                      if (
                        selected[left] === selected[right] &&
                        slots[left].start < slots[right].end &&
                        slots[right].start < slots[left].end
                      )
                        valid = false;
                  if (!valid) continue;
                  const cost = [...new Set(selected)].reduce(
                    (sum, unit) => sum + [100, 200, 300][unit],
                    0,
                  );
                  if (cost > budget) continue;
                  const changes = selected.filter(
                    (unit, index) => unit !== slots[index].primary,
                  ).length;
                  if (!best || cost < best.cost) best = { changes, cost };
                }
            const solved = solveAllocation(production, { now: NOW });
            const label = `mask=${mask}, overlap=${overlap}, budget=${budget}, alternatives=${alternatives}`;
            if (!best) expect(solved.status, label).toBe("INFEASIBLE");
            else {
              const choices = production.looks.some((look) => {
                const base = production.units.find(
                  (unit) => unit.id === look.unitIds[0],
                )!;
                return (
                  [base.id, ...base.approvedSubstituteIds].filter(
                    (id) =>
                      production.units.find((unit) => unit.id === id)
                        ?.status === "available",
                  ).length > 1
                );
              });
              expect(solved.status, label).toBe(
                choices ? "OPTIMAL" : "FEASIBLE",
              );
              expect(solved.constraintChecked, label).toBe(true);
              expect(solved.independentlyChecked, label).toBe(false);
              expect(solved.totalCostCents, label).toBe(best.cost);
              expect(
                validateAllocation(production, solved.assignments, { now: NOW })
                  .valid,
                label,
              ).toBe(true);
            }
            cases++;
          }
    expect(cases).toBe(192);
  });
});
