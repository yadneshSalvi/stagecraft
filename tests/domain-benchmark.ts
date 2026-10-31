/** Reproducible software benchmark; provider outputs are test doubles, never network calls. */
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  createExampleProduction,
  getCurrentApproval,
  getReadiness,
} from "../src/lib/domain/index";
import type { Production } from "../src/lib/types";
import {
  command,
  doubleOutput,
  reviewCandidate,
  TEST_NOW,
} from "./domain-support";
function allocate(p: Production): Production {
  p = command(p, { type: "solve_allocation" });
  assert.ok(p.allocationResult?.constraintChecked);
  return command(p, {
    type: "adopt_allocation",
    inputHash: p.allocationResult.inputHash,
  });
}
function run(index: number) {
  let p = createExampleProduction(`benchmark-${index}`, TEST_NOW);
  const elapsed: Record<string, number> = {};
  let start = performance.now();
  for (const look of p.looks)
    p = command(p, {
      type: "add_preview",
      lookId: look.id,
      preview: doubleOutput(p, look.id),
    });
  p = command(p, { type: "set_example_decisions", enabled: true });
  assert.equal(getReadiness(p, TEST_NOW).appearanceApproved, 8);
  elapsed.approval = performance.now() - start;
  start = performance.now();
  p = allocate(p);
  assert.equal(p.allocations.length, 17);
  assert.equal(p.allocationResult?.totalCostCents, 50000);
  elapsed.allocation = performance.now() - start;
  const repair = (
    kind: "garment_unavailable" | "recast",
    subjectId: string,
    replacementId: string,
  ) => {
    const request = {
      type: "propose_change" as const,
      kind,
      subjectId,
      replacementId,
      seeded: true,
    };
    p = command(p, request);
    const proposal = p.proposals.at(-1)!;
    for (const candidateId of proposal.options[0].candidateIds ?? [])
      p = reviewCandidate(p, candidateId);
    p = command(p, request);
    const current = p.proposals.at(-1)!;
    assert.equal(current.options[0].feasible, true);
    p = command(p, {
      type: "adopt_repair",
      proposalId: current.id,
      optionId: current.options[0].id,
    });
    p = allocate(p);
  };
  start = performance.now();
  repair("garment_unavailable", "unit-coat-oxblood", "unit-coat-charcoal");
  elapsed.missingCoat = performance.now() - start;
  assert.equal(p.allocationResult?.totalCostCents, 46500);
  start = performance.now();
  repair("recast", "char-nora", "performer-celeste");
  elapsed.recast = performance.now() - start;
  const nora = p.looks.find((look) => look.id === "look-nora")!;
  assert.equal(nora.performerId, "performer-celeste");
  assert.equal(nora.unitIds[0], "unit-coat-charcoal");
  assert.ok(getCurrentApproval(nora, p));
  assert.equal(getReadiness(p, TEST_NOW).ready, false);
  return {
    elapsed,
    counts: {
      scenes: p.scenes.length,
      looks: p.looks.length,
      assignments: p.allocations.length,
      managedAppearanceApprovals: getReadiness(p, TEST_NOW).appearanceApproved,
      finalQuoteCents: p.allocationResult!.totalCostCents,
      productionRevision: p.revision,
      events: p.events.length,
      ready: false,
    },
  };
}
run(-1); // Warm the modules and one complete scenario; excluded from observed samples.
const samples = Array.from({ length: 10 }, (_, index) => run(index));
const round = (value: number) => Math.round(value * 1000) / 1000;
const timings = Object.fromEntries(
  Object.keys(samples[0].elapsed).map((stage) => {
    const values = samples
      .map((sample) => sample.elapsed[stage])
      .sort((a, b) => a - b);
    return [
      stage,
      {
        medianMs: round((values[4] + values[5]) / 2),
        minMs: round(values[0]),
        maxMs: round(values.at(-1)!),
      },
    ];
  }),
);
const evidence = {
  observedAt: new Date().toISOString(),
  scope:
    "Synthetic single-process domain software benchmark with schema-valid provider test doubles. No network, paid calls, human task timing, fitting or supplier observation.",
  command: "pnpm exec tsx tests/domain-benchmark.ts",
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  warmups: 1,
  samples: samples.length,
  clock: TEST_NOW,
  timings,
  counts: samples[0].counts,
  rawTimings: samples.map((sample) => sample.elapsed),
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/domain-benchmark.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({ ...evidence, rawTimings: undefined }, null, 2) + "\n",
);
