import type {
  Allocation,
  AllocationFinding,
  AllocationResult,
  Look,
  Occurrence,
  PhysicalUnit,
  Production,
} from "../types";
import {
  allocationInputHash,
  appearanceRecipeHash,
  continuityLookIds,
  getApprovedAppearanceChoices,
} from "./lineage";
import { fingerprint } from "./hash";
import { money } from "../format";
import {
  getAllocationDecisionSummary,
  scheduledDressedLooks,
} from "./allocation-context";
import {
  buildAllocationChoiceComparisons,
  countGarmentChangeovers,
  getAllocationSwaps,
} from "./allocation-review";
export {
  getAllocationDecisionSummary,
  getAllocationStatus,
} from "./allocation-context";
export {
  getAllocationSwaps,
  getAllocationAdoptionReview,
} from "./allocation-review";
import type { ApprovedAppearanceChoice } from "./lineage";

const MINUTE = 60000;
const time = (value: string) => Date.parse(value);
const iso = (value: number) => new Date(value).toISOString();
const unique = <T>(items: T[]) => [...new Set(items)];
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

export interface AllocationOptions {
  now?: string;
  maxNodes?: number;
  sourceRevision?: number;
  proposalId?: string;
  /** Internal explicit-repair constraint; never grants appearance permission. */
  fixedCandidateIds?: string[];
}
export interface AllocationValidation {
  valid: boolean;
  findings: AllocationFinding[];
  totalCostCents: number;
}
interface Demand {
  key: string;
  look: Look;
  occurrence: Occurrence;
  required: PhysicalUnit;
  allowedIds: string[];
  choiceGroup: string;
  slot: number;
  choices: ApprovedAppearanceChoice[];
  start: number;
  end: number;
}

function finding(
  code: string,
  severity: AllocationFinding["severity"],
  message: string,
  units: string[] = [],
  occurrences: string[] = [],
  looks: string[] = [],
): AllocationFinding {
  return {
    id: `${code}:${[...units, ...occurrences, ...looks].join(":")}`,
    code,
    severity,
    message,
    unitIds: unique(units),
    occurrenceIds: unique(occurrences),
    lookIds: unique(looks),
  };
}

export function deduplicateFindings(
  findings: AllocationFinding[],
): AllocationFinding[] {
  return [
    ...new Map(
      findings.map((item) => [
        `${item.code}:${item.unitIds.join()}:${item.occurrenceIds.join()}:${item.lookIds.join()}`,
        item,
      ]),
    ).values(),
  ];
}

function preparationStart(
  production: Production,
  look: Look,
  occurrence: Occurrence,
): number {
  const earlier = production.occurrences
    .filter(
      (candidate) =>
        candidate.id !== occurrence.id &&
        time(candidate.end) <= time(occurrence.start) &&
        production.looks.some(
          (other) =>
            other.performerId === look.performerId &&
            other.sceneIds.includes(candidate.sceneId),
        ),
    )
    .sort((a, b) => time(b.end) - time(a.end));
  const previous = earlier[0];
  if (previous) {
    const previousLooks = production.looks.filter(
      (other) =>
        other.performerId === look.performerId &&
        other.sceneIds.includes(previous.sceneId),
    );
    let sameDay = false;
    try {
      const format = new Intl.DateTimeFormat("en-CA", {
        timeZone: production.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      sameDay =
        format.format(new Date(previous.start)) ===
        format.format(new Date(occurrence.start));
    } catch {
      /* Invalid timezones are rejected by commands; the checker stays conservative. */
    }
    const reset = production.transitions.some(
      (transition) =>
        transition.performerId === look.performerId &&
        transition.fromOccurrenceId === previous.id &&
        transition.toOccurrenceId === occurrence.id,
    );
    if (
      previousLooks.length === 1 &&
      previousLooks[0].id === look.id &&
      previous.location === occurrence.location &&
      sameDay &&
      !reset
    ) {
      // Continuous wear retains this physical unit through the gap. It is not prepared again.
      return time(previous.end);
    }
  }
  return (
    time(occurrence.start) -
    (look.preparationMinutes !== null && look.preparationEvidence !== "unknown"
      ? look.preparationMinutes * MINUTE
      : 0)
  );
}

/** Ignores missing working-recipe permission only to diagnose physical facts, never adoption. */
function physicalPlanningChoices(
  production: Production,
  look: Look,
): ApprovedAppearanceChoice[] {
  const lookIds = continuityLookIds(production, look);
  const group = scheduledDressedLooks(production).filter((item) =>
    lookIds.includes(item.id),
  );
  const recipes = [
    ...(group.length ? group : [look]).map((item) => ({
      category: item.category,
      unitIds: [...item.unitIds],
    })),
    ...getApprovedAppearanceChoices(production, look).map(
      (choice) => choice.recipe,
    ),
  ];
  return [
    ...new Map(
      recipes.map((recipe) => [appearanceRecipeHash(recipe), recipe]),
    ).entries(),
  ].map(([hash, recipe]) => ({
    id: `physical-only:${look.continuityGroupId ?? look.id}:${hash}`,
    lookIds,
    recipe,
    evidence: {},
  }));
}

function buildDemands(
  production: Production,
  physicalOnly = false,
  fixedCandidateIds: string[] = [],
): {
  demands: Demand[];
  findings: AllocationFinding[];
  invalid: boolean;
  incomplete: boolean;
} {
  const demands: Demand[] = [];
  const findings: AllocationFinding[] = [];
  let invalid = false,
    incomplete = false;
  const fixedCandidates = (production.appearanceCandidates ?? []).filter(
    (candidate) => fixedCandidateIds.includes(candidate.id),
  );
  if (fixedCandidates.length !== unique(fixedCandidateIds).length) {
    invalid = true;
    findings.push(
      finding(
        "FIXED_CANDIDATE_MISSING",
        "conflict",
        "An explicitly selected repair candidate is missing. Refresh the repair proposal.",
      ),
    );
  }
  for (const [label, records] of [
    ["occurrence", production.occurrences],
    ["look", production.looks],
    ["unit", production.units],
    ["performer", production.performers],
    ["scene", production.scenes],
  ] as const) {
    if (new Set(records.map((record) => record.id)).size !== records.length) {
      invalid = true;
      findings.push(
        finding(
          "DUPLICATE_FACT_ID",
          "conflict",
          `The ${label} facts contain duplicate identities; physical instances and scheduled demands must be distinct.`,
        ),
      );
    }
  }
  if (
    !Number.isSafeInteger(production.budgetCents) ||
    production.budgetCents < 0
  ) {
    invalid = true;
    findings.push(
      finding(
        "INVALID_BUDGET",
        "conflict",
        "The hard budget must be a nonnegative integer in the production currency's minor units.",
      ),
    );
  }
  for (const occurrence of production.occurrences) {
    const scene = production.scenes.find(
      (item) => item.id === occurrence.sceneId,
    );
    if (
      !scene ||
      !Number.isFinite(time(occurrence.start)) ||
      !Number.isFinite(time(occurrence.end)) ||
      time(occurrence.start) >= time(occurrence.end)
    ) {
      invalid = true;
      findings.push(
        finding(
          "INVALID_OCCURRENCE",
          "conflict",
          `${occurrence.label} needs a mapped scene and a valid start before its end.`,
          [],
          [occurrence.id],
        ),
      );
      continue;
    }
    if (!occurrence.location.trim())
      findings.push(
        finding(
          "LOCATION_UNKNOWN",
          "unverified",
          `${occurrence.label} has no recorded location.`,
          [],
          [occurrence.id],
        ),
      );
    const looks = production.looks.filter(
      (look) =>
        look.sceneIds.includes(scene.id) &&
        !production.characters.find(
          (character) => character.id === look.characterId,
        )?.ownClothes,
    );
    for (const characterId of scene.characterIds) {
      if (
        production.characters.find((character) => character.id === characterId)
          ?.ownClothes
      )
        continue;
      if (!looks.some((look) => look.characterId === characterId)) {
        incomplete = true;
        findings.push(
          finding(
            "LOOK_MISSING",
            "unverified",
            `${scene.title} still needs a look for ${production.characters.find((item) => item.id === characterId)?.name ?? characterId}.`,
            [],
            [occurrence.id],
          ),
        );
      }
    }
    for (const look of looks) {
      const fixed = fixedCandidates.filter((candidate) =>
        candidate.lookIds.includes(look.id),
      );
      if (fixed.length > 1) {
        invalid = true;
        findings.push(
          finding(
            "CONFLICTING_APPEARANCE_CONSTRAINT",
            "conflict",
            "A continuity scope cannot be fixed to different exact repair candidates.",
            [],
            [occurrence.id],
            [look.id],
          ),
        );
      }
      const choices = (
        physicalOnly
          ? physicalPlanningChoices(production, look)
          : getApprovedAppearanceChoices(production, look)
      ).filter((choice) =>
        fixed.every((candidate) =>
          physicalOnly
            ? appearanceRecipeHash(choice.recipe) === candidate.recipeHash
            : choice.candidateId === candidate.id,
        ),
      );
      if (!physicalOnly && !choices.length)
        findings.push(
          finding(
            "APPEARANCE_APPROVAL_REQUIRED",
            "unverified",
            `${look.title} has no exact current approved appearance. Review an existing output or approve a candidate before allocation.`,
            look.unitIds,
            [occurrence.id],
            [look.id],
          ),
        );
      const performer = production.performers.find(
        (item) => item.id === look.performerId,
      );
      if (!performer) {
        incomplete = true;
        findings.push(
          finding(
            "CAST_UNASSIGNED",
            "unverified",
            `${look.title} needs a cast performer before allocation can be complete.`,
            [],
            [occurrence.id],
            [look.id],
          ),
        );
        continue;
      }
      if (!performer.consent.granted)
        findings.push(
          finding(
            "CONSENT_MISSING",
            "unverified",
            `${performer.name}'s image permission is withdrawn or missing.`,
            [],
            [occurrence.id],
            [look.id],
          ),
        );
      if (look.unitIds.length === 0) {
        incomplete = true;
        findings.push(
          finding(
            "WARDROBE_UNSPECIFIED",
            "unverified",
            `${look.title} needs at least one specified physical unit.`,
            [],
            [occurrence.id],
            [look.id],
          ),
        );
      }
      if (unique(look.unitIds).length !== look.unitIds.length) {
        invalid = true;
        findings.push(
          finding(
            "DUPLICATE_UNIT_REQUIREMENT",
            "conflict",
            `${look.title} specifies the same physical unit more than once.`,
            look.unitIds,
            [occurrence.id],
            [look.id],
          ),
        );
      }
      if (
        look.preparationMinutes === null ||
        look.preparationEvidence === "unknown"
      )
        findings.push(
          finding(
            "PREPARATION_UNKNOWN",
            "unverified",
            `${look.title}: prep time unknown`,
            look.unitIds,
            [occurrence.id],
            [look.id],
          ),
        );
      else if (
        !Number.isFinite(look.preparationMinutes) ||
        look.preparationMinutes < 0
      ) {
        invalid = true;
        findings.push(
          finding(
            "INVALID_PREPARATION",
            "conflict",
            `${look.title} has an invalid preparation duration.`,
            look.unitIds,
            [occurrence.id],
            [look.id],
          ),
        );
      } else if (look.preparationEvidence === "estimate")
        findings.push(
          finding(
            "PREPARATION_ESTIMATED",
            "unverified",
            `${look.title}: ${look.preparationMinutes}-min prep (estimate)`,
            look.unitIds,
            [occurrence.id],
            [look.id],
          ),
        );
      for (let index = 0; index < look.unitIds.length; index++) {
        const required = production.units.find(
          (unit) => unit.id === look.unitIds[index],
        );
        if (!required) {
          invalid = true;
          findings.push(
            finding(
              "UNIT_MISSING",
              "conflict",
              `${look.title} references a physical unit that no longer exists.`,
              [look.unitIds[index]],
              [occurrence.id],
              [look.id],
            ),
          );
          continue;
        }
        if (
          !Number.isSafeInteger(required.priceCents) ||
          required.priceCents < 0 ||
          !Number.isFinite(time(required.availability.from)) ||
          !Number.isFinite(time(required.availability.to)) ||
          time(required.availability.from) >= time(required.availability.to)
        ) {
          invalid = true;
          findings.push(
            finding(
              "INVALID_UNIT_FACT",
              "conflict",
              `${required.code} needs a valid availability interval and a nonnegative integer price. Missing evidence cannot be represented as invented free stock.`,
              [required.id],
              [occurrence.id],
              [look.id],
            ),
          );
        }
        demands.push({
          key: `${occurrence.id}:${look.id}:${index}`,
          look,
          occurrence,
          required,
          allowedIds: unique(
            choices
              .map((choice) => choice.recipe.unitIds[index])
              .filter((id): id is string => !!id),
          ),
          choiceGroup: look.continuityGroupId ?? look.id,
          slot: index,
          choices,
          start: preparationStart(production, look, occurrence),
          end: time(occurrence.end),
        });
      }
    }
  }
  return { demands, findings, invalid, incomplete };
}

/** Used by schedule commands to invalidate only demand intervals that actually changed. */
export function allocationDemandIntervals(production: Production): Array<{
  occurrenceId: string;
  lookId: string;
  performerId: string;
  unitId: string;
  start: number;
  end: number;
}> {
  return buildDemands(production).demands.map((demand) => ({
    occurrenceId: demand.occurrence.id,
    lookId: demand.look.id,
    performerId: demand.look.performerId,
    unitId: demand.required.id,
    start: demand.start,
    end: demand.end,
  }));
}

/** Solver pruning. The constraint checker separately verifies the proposed assignments. */
function candidateFits(demand: Demand, unit: PhysicalUnit): boolean {
  return (
    unit.status === "available" &&
    unit.category === demand.required.category &&
    Number.isSafeInteger(unit.priceCents) &&
    unit.priceCents >= 0 &&
    !!unit.priceSource.trim() &&
    Number.isFinite(time(unit.availability.from)) &&
    Number.isFinite(time(unit.availability.to)) &&
    time(unit.availability.from) <= demand.start &&
    time(unit.availability.to) >= demand.end &&
    !(
      unit.fitting.status === "alteration" &&
      unit.fitting.performerId === demand.look.performerId
    )
  );
}

interface CrewTask {
  id: string;
  resource: string;
  capacity: number;
  release: number;
  deadline: number;
  duration: number;
  occurrences: string[];
}

/** Exact, bounded nonpreemptive scheduling for small crew/station windows. */
function scheduleCrew(
  tasks: CrewTask[],
): "feasible" | "infeasible" | "unknown" {
  if (tasks.length > 12) return "unknown";
  let nodes = 0,
    exhausted = false;
  const placed: Array<CrewTask & { start: number; end: number }> = [];
  const visit = (remaining: CrewTask[]): boolean => {
    if (++nodes > 30000) {
      exhausted = true;
      return false;
    }
    if (!remaining.length) return true;
    for (const task of [...remaining].sort(
      (a, b) => a.deadline - b.deadline || a.id.localeCompare(b.id),
    )) {
      const capacity = Math.min(
        ...tasks
          .filter((item) => item.resource === task.resource)
          .map((item) => item.capacity),
      );
      const starts = unique([
        task.release,
        ...placed
          .filter((item) => item.resource === task.resource)
          .map((item) => item.end),
      ])
        .filter(
          (start) =>
            start >= task.release && start + task.duration <= task.deadline,
        )
        .sort((a, b) => a - b);
      for (const start of starts) {
        const end = start + task.duration;
        const simultaneous = placed.filter(
          (item) =>
            item.resource === task.resource &&
            overlaps(start, end, item.start, item.end),
        );
        const points = unique([
          start,
          ...simultaneous.map((item) => Math.max(start, item.start)),
        ]);
        if (
          points.some(
            (point) =>
              1 +
                simultaneous.filter(
                  (item) => item.start <= point && point < item.end,
                ).length >
              capacity,
          )
        )
          continue;
        placed.push({ ...task, start, end });
        if (visit(remaining.filter((item) => item.id !== task.id))) return true;
        placed.pop();
      }
      if (exhausted) return false;
    }
    return false;
  };
  return visit(tasks) ? "feasible" : exhausted ? "unknown" : "infeasible";
}

function transitionFindings(production: Production): AllocationFinding[] {
  const findings: AllocationFinding[] = [];
  const crewTasks: CrewTask[] = [];
  for (const performer of production.performers) {
    const looks = production.looks.filter(
      (look) => look.performerId === performer.id,
    );
    const occurrences = production.occurrences
      .filter((occurrence) =>
        looks.some((look) => look.sceneIds.includes(occurrence.sceneId)),
      )
      .sort(
        (a, b) => time(a.start) - time(b.start) || a.id.localeCompare(b.id),
      );
    for (let index = 0; index < occurrences.length; index++) {
      const occurrence = occurrences[index];
      const currentLooks = looks.filter((look) =>
        look.sceneIds.includes(occurrence.sceneId),
      );
      if (currentLooks.length > 1)
        findings.push(
          finding(
            "AMBIGUOUS_LOOK",
            "conflict",
            `${performer.name} has more than one look assigned to ${occurrence.label}; split the appearance into explicit occurrences.`,
            [],
            [occurrence.id],
            currentLooks.map((look) => look.id),
          ),
        );
      for (const other of occurrences.slice(index + 1)) {
        if (
          overlaps(
            time(occurrence.start),
            time(occurrence.end),
            time(other.start),
            time(other.end),
          )
        )
          findings.push(
            finding(
              "PERFORMER_OVERLAP",
              "conflict",
              `${performer.name} cannot attend ${occurrence.label} and ${other.label} at the same time.`,
              [],
              [occurrence.id, other.id],
            ),
          );
      }
      const next = occurrences[index + 1];
      if (!next || time(occurrence.end) > time(next.start)) continue;
      const nextLooks = looks.filter((look) =>
        look.sceneIds.includes(next.sceneId),
      );
      const changesLook =
        JSON.stringify(currentLooks.map((look) => look.id).sort()) !==
        JSON.stringify(nextLooks.map((look) => look.id).sort());
      const transition = production.transitions.find(
        (item) =>
          item.performerId === performer.id &&
          item.fromOccurrenceId === occurrence.id &&
          item.toOccurrenceId === next.id,
      );
      if (occurrence.location !== next.location)
        findings.push(
          finding(
            "LOCATION_TRANSFER_UNKNOWN",
            "unverified",
            `${performer.name}'s transfer from ${occurrence.location} to ${next.location} has no separate recorded travel requirement.`,
            [],
            [occurrence.id, next.id],
          ),
        );
      if (
        !transition &&
        production.mode === "live_performance" &&
        changesLook
      ) {
        findings.push(
          finding(
            "TRANSITION_UNKNOWN",
            "unverified",
            `${performer.name}'s directional change from ${occurrence.label} to ${next.label} needs a recorded duration and crew requirement.`,
            [],
            [occurrence.id, next.id],
          ),
        );
        continue;
      }
      if (!transition) continue;
      if (transition.minutes === null || transition.evidence === "unknown") {
        findings.push(
          finding(
            "TRANSITION_UNKNOWN",
            "unverified",
            `${performer.name}: change time unknown`,
            [],
            [occurrence.id, next.id],
          ),
        );
        continue;
      }
      if (
        !Number.isFinite(transition.minutes) ||
        transition.minutes < 0 ||
        !Number.isSafeInteger(transition.crewCapacity) ||
        transition.crewCapacity < 1
      ) {
        findings.push(
          finding(
            "INVALID_TRANSITION",
            "conflict",
            `${performer.name}'s transition needs a nonnegative duration and positive crew capacity.`,
            [],
            [occurrence.id, next.id],
          ),
        );
        continue;
      }
      const gap = (time(next.start) - time(occurrence.end)) / MINUTE;
      if (transition.minutes > gap)
        findings.push(
          finding(
            "TRANSITION_TOO_SHORT",
            "conflict",
            `${performer.name} has ${gap} minutes for a directional change requiring ${transition.minutes} minutes.`,
            [],
            [occurrence.id, next.id],
          ),
        );
      if (transition.evidence === "estimate")
        findings.push(
          finding(
            "TRANSITION_ESTIMATED",
            "unverified",
            `${performer.name}: change time estimated`,
            [],
            [occurrence.id, next.id],
          ),
        );
      if (transition.crewResource && transition.minutes > 0)
        crewTasks.push({
          id: transition.id,
          resource: transition.crewResource,
          capacity: transition.crewCapacity,
          release: time(occurrence.end),
          deadline: time(next.start),
          duration: transition.minutes * MINUTE,
          occurrences: [occurrence.id, next.id],
        });
    }
  }
  for (const resource of unique(crewTasks.map((task) => task.resource))) {
    const tasks = crewTasks.filter((task) => task.resource === resource);
    const status = scheduleCrew(tasks);
    if (status !== "feasible")
      findings.push(
        finding(
          status === "infeasible" ? "CREW_CAPACITY" : "CREW_CAPACITY_UNKNOWN",
          status === "infeasible" ? "conflict" : "unverified",
          status === "infeasible"
            ? `${resource} cannot complete the recorded changes within its capacity and change windows.`
            : `${resource}: too many windows to verify`,
          [],
          unique(tasks.flatMap((task) => task.occurrences)),
        ),
      );
  }
  return findings;
}

/** Independent of the optimizer: checks coverage, exact intervals, facts and all overlaps. */
function validateAllocationModel(
  production: Production,
  assignments: Allocation[],
  options: Pick<AllocationOptions, "now" | "fixedCandidateIds"> = {},
  physicalOnly = false,
): AllocationValidation {
  const now = time(options.now ?? new Date().toISOString());
  const built = buildDemands(
    production,
    physicalOnly,
    options.fixedCandidateIds,
  );
  const findings = [...built.findings, ...transitionFindings(production)];
  if (
    unique(assignments.map((assignment) => assignment.id)).length !==
    assignments.length
  )
    findings.push(
      finding(
        "DUPLICATE_ALLOCATION_ID",
        "conflict",
        "Every allocation must have a distinct identity.",
      ),
    );
  const matched = new Map<string, Allocation>();
  let matchingNodes = 0;
  const match = (index: number, available: Allocation[]): boolean => {
    if (++matchingNodes > 30000) return false;
    if (index === built.demands.length) return available.length === 0;
    const demand = built.demands[index];
    for (const assignment of available) {
      if (
        assignment.occurrenceId !== demand.occurrence.id ||
        assignment.lookId !== demand.look.id ||
        assignment.performerId !== demand.look.performerId ||
        !demand.allowedIds.includes(assignment.unitId)
      )
        continue;
      matched.set(demand.key, assignment);
      if (
        match(
          index + 1,
          available.filter((item) => item !== assignment),
        )
      )
        return true;
      matched.delete(demand.key);
    }
    return false;
  };
  const coverageComplete =
    assignments.length === built.demands.length &&
    built.demands.length <= 100 &&
    match(0, assignments);
  if (!coverageComplete) {
    const checkLimited = matchingNodes > 30000 || built.demands.length > 100;
    findings.push(
      finding(
        checkLimited ? "COVERAGE_CHECK_LIMIT" : "DEMAND_COVERAGE",
        checkLimited ? "unverified" : "conflict",
        checkLimited
          ? "Coverage not verified"
          : "The allocation must cover every required physical unit exactly once using only exact currently approved appearance recipes.",
      ),
    );
  }
  for (const demand of built.demands) {
    const assignment = matched.get(demand.key);
    if (!assignment) continue;
    const unit = production.units.find((item) => item.id === assignment.unitId);
    if (!unit) {
      findings.push(
        finding(
          "UNIT_MISSING",
          "conflict",
          "An assigned physical unit no longer exists.",
          [assignment.unitId],
          [demand.occurrence.id],
          [demand.look.id],
        ),
      );
      continue;
    }
    const scope: [string[], string[], string[]] = [
      [unit.id],
      [demand.occurrence.id],
      [demand.look.id],
    ];
    if (assignment.state === "blocked" || assignment.state === "historical")
      findings.push(
        finding(
          "ALLOCATION_INACTIVE",
          "conflict",
          `${unit.code}'s allocation is ${assignment.state} and cannot establish current feasibility.`,
          ...scope,
        ),
      );
    if (
      !Number.isFinite(time(assignment.start)) ||
      !Number.isFinite(time(assignment.end)) ||
      time(assignment.start) !== demand.start ||
      time(assignment.end) !== demand.end
    )
      findings.push(
        finding(
          "ALLOCATION_INTERVAL",
          "conflict",
          `${unit.code}'s allocation must include its recorded preparation and exact occurrence interval.`,
          ...scope,
        ),
      );
    if (unit.status !== "available")
      findings.push(
        finding(
          "UNIT_UNAVAILABLE",
          "conflict",
          `${unit.code} is ${unit.status}.`,
          ...scope,
        ),
      );
    if (unit.category !== demand.required.category)
      findings.push(
        finding(
          "CATEGORY_MISMATCH",
          "conflict",
          `${unit.code} does not satisfy the required garment category.`,
          ...scope,
        ),
      );
    if (
      !Number.isFinite(time(unit.availability.from)) ||
      !Number.isFinite(time(unit.availability.to)) ||
      time(unit.availability.from) > demand.start ||
      time(unit.availability.to) < demand.end
    )
      findings.push(
        finding(
          "AVAILABILITY_WINDOW",
          "conflict",
          `${unit.code}'s recorded availability does not cover preparation and use for ${demand.occurrence.label}.`,
          ...scope,
        ),
      );
    if (
      !unit.availability.confirmed ||
      unit.availability.provenance === "synthetic" ||
      !unit.availability.source.trim()
    )
      findings.push(
        finding(
          "AVAILABILITY_UNCONFIRMED",
          "unverified",
          `${unit.code}: availability unconfirmed`,
          ...scope,
        ),
      );
    if (!unit.priceSource.trim())
      findings.push(
        finding(
          "PRICE_UNKNOWN",
          "conflict",
          `${unit.code}: no price recorded`,
          ...scope,
        ),
      );
    if (!Number.isSafeInteger(unit.priceCents) || unit.priceCents < 0)
      findings.push(
        finding(
          "INVALID_PRICE",
          "conflict",
          `${unit.code}: invalid price`,
          ...scope,
        ),
      );
    if (
      !Number.isFinite(time(unit.priceValidUntil)) ||
      time(unit.priceValidUntil) < now ||
      !unit.priceSource.trim()
    )
      findings.push(
        finding(
          "QUOTE_EXPIRED",
          "unverified",
          `${unit.code}: quote expired`,
          ...scope,
        ),
      );
    if (unit.location !== demand.occurrence.location)
      findings.push(
        finding(
          "UNIT_LOCATION_UNVERIFIED",
          "unverified",
          `${unit.code}: transport from ${unit.location || "unknown location"} not recorded`,
          ...scope,
        ),
      );
    const fit = unit.fitting;
    if (
      fit.status === "alteration" &&
      fit.performerId === demand.look.performerId
    )
      findings.push(
        finding(
          "ALTERATION_REQUIRED",
          "conflict",
          `${unit.code} requires alteration for this performer before use.`,
          ...scope,
        ),
      );
    else if (
      fit.status !== "confirmed" ||
      fit.performerId !== demand.look.performerId ||
      !fit.evidence.trim() ||
      (fit.provenance !== "observed" && fit.provenance !== "manual")
    )
      findings.push(
        finding(
          "FITTING_UNVERIFIED",
          "unverified",
          `${unit.code}: fit ${fit.status.replaceAll("_", " ")}`,
          ...scope,
        ),
      );
    const physicallyObserved =
      fit.status === "confirmed" &&
      fit.performerId === demand.look.performerId &&
      !!fit.evidence.trim() &&
      (fit.provenance === "manual" || fit.provenance === "observed");
    if (!physicallyObserved) {
      const performer = production.performers.find(
        (item) => item.id === demand.look.performerId,
      );
      const dimensions = (["chestCm", "waistCm"] as const).filter(
        (dimension) =>
          performer?.measurements[dimension] !== null &&
          performer?.measurements[dimension] !== undefined &&
          unit.measurements[dimension] !== null,
      );
      const smaller = dimensions.some(
        (dimension) =>
          unit.measurements[dimension]! < performer!.measurements[dimension]!,
      );
      const code = dimensions.length
        ? smaller
          ? "MEASUREMENT_SCREEN_REVIEW"
          : "MEASUREMENT_SCREEN_PROVISIONAL"
        : "MEASUREMENTS_UNKNOWN";
      const message = dimensions.length
        ? smaller
          ? `${unit.code}: smaller than performer`
          : `${unit.code}: measurements provisional`
        : `${unit.code}: measurements missing`;
      findings.push(finding(code, "unverified", message, ...scope));
    }
  }
  const groups = new Map<string, Demand[]>();
  for (const demand of built.demands)
    groups.set(demand.choiceGroup, [
      ...(groups.get(demand.choiceGroup) ?? []),
      demand,
    ]);
  for (const group of groups.values()) {
    const coherent = group[0].choices.some((choice) =>
      group.every((demand) => {
        const assignment = matched.get(demand.key);
        const evidence = choice.evidence[demand.look.id];
        return (
          !!assignment &&
          assignment.unitId === choice.recipe.unitIds[demand.slot] &&
          assignment.approvalId === evidence?.approvalId &&
          assignment.previewId === evidence?.previewId &&
          assignment.candidateId === choice.candidateId
        );
      }),
    );
    if (!coherent)
      findings.push(
        finding(
          "CONTINUITY_APPROVAL_LINEAGE",
          "conflict",
          "Use one approved look across the continuity group.",
          unique(group.flatMap((demand) => demand.allowedIds)),
          unique(group.map((demand) => demand.occurrence.id)),
          unique(group.map((demand) => demand.look.id)),
        ),
      );
  }
  for (let left = 0; left < assignments.length; left++) {
    const a = assignments[left];
    for (const b of assignments.slice(left + 1)) {
      if (
        a.unitId === b.unitId &&
        overlaps(time(a.start), time(a.end), time(b.start), time(b.end))
      )
        findings.push(
          finding(
            "UNIT_OVERLAP",
            "conflict",
            `${production.units.find((item) => item.id === a.unitId)?.code ?? a.unitId} is one physical unit and cannot cover overlapping use or preparation.`,
            [a.unitId],
            [a.occurrenceId, b.occurrenceId],
            [a.lookId, b.lookId],
          ),
        );
    }
  }
  const totalCostCents = unique(
    assignments.map((assignment) => assignment.unitId),
  ).reduce(
    (sum, id) =>
      sum + (production.units.find((unit) => unit.id === id)?.priceCents ?? 0),
    0,
  );
  if (totalCostCents > production.budgetCents)
    findings.push(
      finding(
        "HARD_BUDGET",
        "conflict",
        `Over budget by ${money(totalCostCents - production.budgetCents, production.currency)}.`,
        unique(assignments.map((assignment) => assignment.unitId)),
      ),
    );
  const result = deduplicateFindings(findings);
  return {
    valid:
      coverageComplete &&
      !built.invalid &&
      !built.incomplete &&
      !result.some((item) => item.severity === "conflict"),
    findings: result,
    totalCostCents,
  };
}

function solveAllocationModel(
  production: Production,
  options: AllocationOptions = {},
  physicalOnly = false,
): AllocationResult {
  const now = options.now ?? new Date().toISOString();
  const sourceRevision = options.sourceRevision ?? production.revision;
  const built = buildDemands(
    production,
    physicalOnly,
    options.fixedCandidateIds,
  );
  const staticFindings = [...built.findings, ...transitionFindings(production)];
  const base = {
    sourceRevision,
    inputHash: allocationInputHash(production),
    solver: "stagecraft-bounded-exact/2-approved-choices",
    policy:
      "Hard constraints first, then lowest cost, then fewest changeovers.",
    createdAt: now,
  };
  if (
    !built.invalid &&
    production.occurrences.length &&
    !built.demands.length &&
    !built.incomplete
  )
    return {
      ...base,
      status: "FEASIBLE",
      assignments: [],
      findings: staticFindings,
      totalCostCents: 0,
      independentlyChecked: false,
      constraintChecked: !staticFindings.some(
        (item) => item.severity === "conflict",
      ),
    };
  if (built.invalid || !production.occurrences.length || !built.demands.length)
    return {
      ...base,
      status: "INVALID_INPUT",
      assignments: [],
      findings: deduplicateFindings([
        ...staticFindings,
        finding(
          "ALLOCATION_INPUT_MISSING",
          "conflict",
          "Add calls, looks and units first.",
        ),
      ]),
      totalCostCents: 0,
      independentlyChecked: false,
    };
  if (built.demands.length > 100)
    return {
      ...base,
      status: "UNKNOWN",
      assignments: [],
      findings: [
        ...staticFindings,
        finding(
          "SEARCH_SCOPE",
          "unverified",
          "Too large to check (100-demand limit).",
        ),
      ],
      totalCostCents: 0,
      independentlyChecked: false,
    };
  if (staticFindings.some((item) => item.severity === "conflict"))
    return {
      ...base,
      status: staticFindings.some((item) => item.code.startsWith("INVALID_"))
        ? "INVALID_INPUT"
        : "INFEASIBLE",
      assignments: [],
      findings: deduplicateFindings(staticFindings),
      totalCostCents: 0,
      independentlyChecked: false,
    };
  const makeAssignment = (
    demand: Demand,
    unit: PhysicalUnit,
    choice?: ApprovedAppearanceChoice,
  ): Allocation => ({
    id: `allocation-${demand.key}`,
    occurrenceId: demand.occurrence.id,
    lookId: demand.look.id,
    performerId: demand.look.performerId,
    unitId: unit.id,
    start: iso(demand.start),
    end: iso(demand.end),
    state: "proposed",
    reason: null,
    sourceRevision,
    candidateId: choice?.candidateId,
    approvalId: choice?.evidence[demand.look.id]?.approvalId,
    previewId: choice?.evidence[demand.look.id]?.previewId,
  });
  const requiredAssignments = () =>
    built.demands.map((demand) =>
      makeAssignment(
        demand,
        demand.required,
        demand.choices.find(
          (choice) => choice.recipe.unitIds[demand.slot] === demand.required.id,
        ),
      ),
    );
  const candidates = new Map(
    built.demands.map((demand) => [
      demand.key,
      demand.choices
        .map((choice) => ({
          choice,
          unit: production.units.find(
            (unit) => unit.id === choice.recipe.unitIds[demand.slot],
          ),
        }))
        .filter(
          (
            entry,
          ): entry is {
            choice: ApprovedAppearanceChoice;
            unit: PhysicalUnit;
          } => !!entry.unit && candidateFits(demand, entry.unit),
        )
        .sort(
          (a, b) =>
            Number(b.unit.id === demand.required.id) -
              Number(a.unit.id === demand.required.id) ||
            a.unit.priceCents - b.unit.priceCents ||
            a.choice.id.localeCompare(b.choice.id),
        ),
    ]),
  );
  const actualChoices = [
    ...new Set(built.demands.map((demand) => demand.choiceGroup)),
  ].some((group) => {
    const first = built.demands.find((demand) => demand.choiceGroup === group)!;
    const eligible = first.choices.filter((choice) =>
      built.demands
        .filter((demand) => demand.choiceGroup === group)
        .every((demand) => {
          const unit = production.units.find(
            (item) => item.id === choice.recipe.unitIds[demand.slot],
          );
          return !!unit && candidateFits(demand, unit);
        }),
    );
    return (
      new Set(
        eligible.map((choice) =>
          JSON.stringify([...choice.recipe.unitIds].sort()),
        ),
      ).size > 1
    );
  });
  const missing = built.demands.filter(
    (demand) => !candidates.get(demand.key)!.length,
  );
  if (missing.length) {
    const unknownPrice = missing.some((demand) =>
      demand.allowedIds.some(
        (id) =>
          !production.units.find((unit) => unit.id === id)?.priceSource.trim(),
      ),
    );
    const check = validateAllocationModel(
      production,
      requiredAssignments(),
      { now, fixedCandidateIds: options.fixedCandidateIds },
      physicalOnly,
    );
    return {
      ...base,
      status: unknownPrice ? "UNKNOWN" : "INFEASIBLE",
      assignments: [],
      findings: deduplicateFindings([
        ...staticFindings,
        ...check.findings.filter((item) => item.severity === "conflict"),
        ...missing.map((demand) =>
          finding(
            "NO_ELIGIBLE_UNIT",
            "conflict",
            `${demand.look.title}: no eligible unit.`,
            demand.allowedIds,
            [demand.occurrence.id],
            [demand.look.id],
          ),
        ),
      ]),
      totalCostCents: 0,
      independentlyChecked: false,
    };
  }
  const order = [...built.demands].sort(
    (a, b) =>
      candidates.get(a.key)!.length - candidates.get(b.key)!.length ||
      a.start - b.start ||
      a.key.localeCompare(b.key),
  );
  const chosen: Array<{
    demand: Demand;
    unit: PhysicalUnit;
    choice: ApprovedAppearanceChoice;
  }> = [];
  const groupChoices = new Map<string, string>();
  let best: Allocation[] | null = null,
    bestCost = Infinity,
    bestChanges = Infinity,
    nodes = 0,
    limited = false;
  const maxNodes = Math.max(1, Math.min(options.maxNodes ?? 50000, 1000000));
  const visit = (index: number, cost: number, selected: Set<string>) => {
    if (++nodes > maxNodes) {
      limited = true;
      return;
    }
    if (cost > bestCost || cost > production.budgetCents) return;
    if (index === order.length) {
      const changeovers = countGarmentChangeovers(
        production,
        chosen.map(({ demand, unit, choice }) =>
          makeAssignment(demand, unit, choice),
        ),
      );
      if (cost < bestCost || (cost === bestCost && changeovers < bestChanges)) {
        bestChanges = changeovers;
        bestCost = cost;
        best = chosen.map(({ demand, unit, choice }) =>
          makeAssignment(demand, unit, choice),
        );
      }
      return;
    }
    const demand = order[index];
    for (const { unit, choice } of candidates.get(demand.key)!) {
      const previousChoice = groupChoices.get(demand.choiceGroup);
      if (previousChoice && previousChoice !== choice.id) continue;
      if (
        chosen.some(
          (previous) =>
            previous.unit.id === unit.id &&
            overlaps(
              previous.demand.start,
              previous.demand.end,
              demand.start,
              demand.end,
            ),
        )
      )
        continue;
      chosen.push({ demand, unit, choice });
      groupChoices.set(demand.choiceGroup, choice.id);
      const next = new Set(selected);
      next.add(unit.id);
      visit(
        index + 1,
        cost + (selected.has(unit.id) ? 0 : unit.priceCents),
        next,
      );
      chosen.pop();
      if (!previousChoice) groupChoices.delete(demand.choiceGroup);
      if (limited) return;
    }
  };
  visit(0, 0, new Set());
  if (best === null) {
    const check = validateAllocationModel(
      production,
      requiredAssignments(),
      { now, fixedCandidateIds: options.fixedCandidateIds },
      physicalOnly,
    );
    return {
      ...base,
      status: limited ? "UNKNOWN" : "INFEASIBLE",
      assignments: [],
      findings: deduplicateFindings([
        ...staticFindings,
        ...check.findings.filter((item) => item.severity === "conflict"),
        finding(
          limited ? "SEARCH_LIMIT" : "NO_FEASIBLE_COMBINATION",
          limited ? "unverified" : "conflict",
          limited
            ? `The deterministic search reached its ${maxNodes}-node bound without a checked solution. Infeasibility is not proved.`
            : "No permitted allocation fits the recorded constraints.",
        ),
      ]),
      totalCostCents: 0,
      independentlyChecked: false,
    };
  }
  const checked = validateAllocationModel(
    production,
    best,
    { now, fixedCandidateIds: options.fixedCandidateIds },
    physicalOnly,
  );
  const checkerLimited = checked.findings.some(
    (item) => item.code === "COVERAGE_CHECK_LIMIT",
  );
  if (!checked.valid && !built.incomplete)
    return {
      ...base,
      status: checkerLimited ? "UNKNOWN" : "INVALID_INPUT",
      assignments: [],
      findings: [
        ...checked.findings,
        finding(
          "CONSTRAINT_CHECK_FAILED",
          checkerLimited ? "unverified" : "conflict",
          checkerLimited
            ? "The checker reached its coverage bound; the proposed assignment cannot be adopted as checked."
            : "The proposed assignment failed the constraint checker and cannot be adopted.",
        ),
      ],
      totalCostCents: checked.totalCostCents,
      independentlyChecked: false,
    };
  return {
    ...base,
    status: built.incomplete
      ? "UNKNOWN"
      : limited || !actualChoices
        ? "FEASIBLE"
        : "OPTIMAL",
    assignments: best,
    findings: deduplicateFindings([
      ...checked.findings,
      ...(limited
        ? [finding("SEARCH_LIMIT", "info", `Feasible; not proven optimal.`)]
        : []),
    ]),
    totalCostCents: checked.totalCostCents,
    independentlyChecked: false,
    constraintChecked: checked.valid,
  };
}

/** Public checking always enforces exact appearance permission. */
export function validateAllocation(
  production: Production,
  assignments: Allocation[],
  options: Pick<AllocationOptions, "now"> = {},
): AllocationValidation {
  return validateAllocationModel(production, assignments, options);
}
export function solveAllocation(
  production: Production,
  options: AllocationOptions = {},
): AllocationResult {
  const built = buildDemands(production, false, options.fixedCandidateIds);
  const pending = built.findings.some(
    (item) => item.code === "APPEARANCE_APPROVAL_REQUIRED",
  );
  let result: AllocationResult;
  if (pending && !built.invalid) {
    const physical = solveAllocationModel(production, options, true);
    result = {
      ...physical,
      status: ["FEASIBLE", "OPTIMAL"].includes(physical.status)
        ? "DECISIONS_NEEDED"
        : physical.status,
      assignments: [],
      constraintChecked: false,
      totalCostCents: 0,
      findings: deduplicateFindings([
        ...physical.findings,
        ...built.findings.filter(
          (item) => item.code === "APPEARANCE_APPROVAL_REQUIRED",
        ),
      ]),
    };
  } else result = solveAllocationModel(production, options);
  result.decisions = getAllocationDecisionSummary(production);
  result.proposalId =
    options.proposalId ??
    `allocation-${fingerprint({ productionId: production.id, sourceRevision: result.sourceRevision, inputHash: result.inputHash }).slice(0, 32)}`;
  result.originalRecipes = production.looks.map((look) => ({
    lookId: look.id,
    unitIds: [...look.unitIds],
  }));
  result.swaps = getAllocationSwaps(production, result);
  if (
    result.constraintChecked &&
    ["FEASIBLE", "OPTIMAL"].includes(result.status)
  )
    result.choiceComparisons = buildAllocationChoiceComparisons(
      production,
      result,
      validateAllocation,
    );
  return result;
}
