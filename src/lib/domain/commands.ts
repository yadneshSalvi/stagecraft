import type {
  AppearanceApproval,
  AppearanceCandidate,
  CrewPack,
  Look,
  PhysicalUnit,
  Production,
  ProductionCommand,
  SourcingRequest,
} from "../types";
import {
  allocationDemandIntervals,
  solveAllocation,
  validateAllocation,
  getAllocationAdoptionReview,
} from "./allocation";
import {
  affectedLookIds,
  buildRepairProposal,
  matchingRepairCandidates,
  simulateRepair,
} from "./change";
import { DomainError, findRecord, requireFact } from "./errors";
import { canonicalJson } from "./hash";
import { applyCandidateCommand, adoptAppearanceCandidate } from "./candidates";
import { createExampleProduction } from "./fixture";
import {
  applyDetailCommand,
  getCurrentDetailApproval,
  getCurrentDetailPreview,
  invalidateDetails,
  validatedDetailRecipe,
} from "./details";
import {
  allocationInputHash,
  appearanceIntentHash,
  getCurrentPreview,
  getCurrentApproval,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
  previewEvidenceHash,
  previewInputHash,
  repairInputHash,
  sameIds,
} from "./lineage";
import { mergeScriptRevision, validateSceneSources } from "./script";
import {
  applyBeautyCommand,
  beautyInputHash,
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
  invalidateBeauty,
  revokeFaceConsent,
  validatedBeautyRecipe,
} from "./beauty";

export interface CommandContext {
  actor: string;
  now?: string;
  id?: string | (() => string);
}
const unique = <T>(values: T[]) => [...new Set(values)];
const date = (value: string) => Date.parse(value);
const changed = (left: unknown, right: unknown) =>
  canonicalJson(left) !== canonicalJson(right);

function requireWindow(from: string, to: string): void {
  requireFact(
    Number.isFinite(date(from)) &&
      Number.isFinite(date(to)) &&
      date(from) < date(to),
    "INVALID_TIME_WINDOW",
    "Record a valid start before the end, with an explicit date and timezone.",
  );
  requireFact(
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(from) && /(?:Z|[+-]\d{2}:\d{2})$/i.test(to),
    "TIMEZONE_REQUIRED",
    "Schedule and custody times must include a UTC offset or Z.",
  );
}

function requireMoney(value: number): void {
  requireFact(
    Number.isSafeInteger(value) && value >= 0,
    "INVALID_MONEY",
    "Use a nonnegative integer amount in the production currency's minor units.",
  );
}

function requireNew<T extends { id: string }>(
  records: T[],
  id: string,
  label: string,
): void {
  requireFact(!!id.trim(), "ID_REQUIRED", `${label} needs a stable identity.`);
  requireFact(
    !records.some((record) => record.id === id),
    "DUPLICATE_ID",
    `${label} ${id} already exists.`,
    409,
  );
}

function invalidateOperations(
  production: Production,
  scope: {
    lookIds?: string[];
    occurrenceIds?: string[];
    unitIds?: string[];
    sourcingIds?: string[];
  },
  reason: string,
  sources = false,
): void {
  const affected = (allocation: Production["allocations"][number]) =>
    scope.lookIds?.includes(allocation.lookId) ||
    scope.occurrenceIds?.includes(allocation.occurrenceId) ||
    scope.unitIds?.includes(allocation.unitId);
  for (const allocation of production.allocations)
    if (allocation.state !== "historical" && affected(allocation)) {
      allocation.state = "blocked";
      allocation.reason = reason;
    }
  for (const source of production.sourcing) {
    if (source.status === "returned" || source.status === "cancelled") continue;
    if (
      scope.sourcingIds?.includes(source.id) ||
      (sources && scope.unitIds?.some((id) => source.unitIds.includes(id)))
    )
      source.stale = true;
  }
  for (const pack of production.packs) {
    if (pack.state === "superseded") continue;
    if (
      scope.lookIds?.some((id) =>
        pack.snapshot.looks.some((look) => look.id === id),
      ) ||
      scope.occurrenceIds?.some((id) => pack.occurrenceIds.includes(id)) ||
      scope.unitIds?.some((id) =>
        pack.snapshot.units.some((unit) => unit.id === id),
      ) ||
      scope.sourcingIds?.some((id) =>
        pack.snapshot.sourcing.some((source) => source.id === id),
      )
    )
      pack.state = "superseded";
  }
}

function invalidateAppearance(
  production: Production,
  lookIds: string[],
  reason: string,
  advanceRecipe: boolean,
  state: AppearanceApproval["state"] = "stale",
  candidateRelevant?: (candidate: AppearanceCandidate) => boolean,
): void {
  for (const look of production.looks.filter((look) =>
    lookIds.includes(look.id),
  )) {
    if (advanceRecipe) look.revision += 1;
    look.reviewReason = reason;
    for (const approval of look.approvals)
      if (approval.state === "current") {
        approval.state = state;
        approval.reason = reason;
      }
  }
  for (const candidate of production.appearanceCandidates ?? [])
    if (
      candidateRelevant
        ? candidateRelevant(candidate)
        : candidate.lookIds.some((id) => lookIds.includes(id))
    )
      for (const approval of candidate.approvals)
        if (approval.state === "current") {
          approval.state = state;
          approval.reason = reason;
        }
  invalidateOperations(production, { lookIds }, reason);
}

function validateUnit(unit: PhysicalUnit, production: Production): void {
  requireMoney(unit.priceCents);
  requireFact(
    !!unit.priceSource.trim(),
    "QUOTE_SOURCE_REQUIRED",
    "Record the source of the production-window quote, including an explicit source for a genuine zero-cost item. Unknown price is not free stock.",
  );
  requireWindow(unit.availability.from, unit.availability.to);
  requireFact(
    Number.isFinite(date(unit.priceValidUntil)),
    "INVALID_QUOTE_DATE",
    "Record when the physical unit's quote expires.",
  );
  requireFact(
    unit.approvedSubstituteIds.every(
      (id) =>
        id !== unit.id &&
        production.units.some((candidate) => candidate.id === id),
    ),
    "INVALID_SUBSTITUTE",
    "Approved alternatives must refer to distinct existing physical units.",
  );
  if (unit.fitting.performerId)
    findRecord(
      production.performers,
      unit.fitting.performerId,
      "Fitting performer",
    );
  if (unit.fitting.status === "confirmed")
    requireFact(
      !!unit.fitting.performerId && !!unit.fitting.evidence.trim(),
      "FITTING_EVIDENCE_REQUIRED",
      "A confirmed fit needs a named performer and actual fitting evidence; a render cannot supply it.",
    );
  if (unit.availability.confirmed)
    requireFact(
      !!unit.availability.source.trim() &&
        Number.isFinite(date(unit.availability.checkedAt)),
      "AVAILABILITY_EVIDENCE_REQUIRED",
      "Confirmed availability needs a source and evidence timestamp.",
    );
}

const sourcingTransitions: Record<
  SourcingRequest["status"],
  SourcingRequest["status"][]
> = {
  draft: ["requested", "cancelled"],
  requested: ["held", "confirmed", "declined", "cancelled"],
  held: ["confirmed", "declined", "cancelled"],
  confirmed: ["received", "cancelled"],
  declined: ["requested", "cancelled"],
  received: ["returned"],
  returned: [],
  cancelled: [],
};

/** An accepted command returns a new graph and exactly one new production revision. */
export function applyCommand(
  production: Production,
  command: ProductionCommand,
  context: CommandContext,
): Production {
  requireFact(
    !!context.actor?.trim(),
    "ACTOR_REQUIRED",
    "Record the operator responsible for this change.",
  );
  const now = context.now ?? new Date().toISOString();
  requireFact(
    Number.isFinite(date(now)),
    "INVALID_CLOCK",
    "The command timestamp is invalid.",
  );
  const previousRevision = production.revision;
  const draft = structuredClone(production);
  draft.revision = previousRevision + 1;
  draft.updatedAt = now;
  const commandToken =
    typeof context.id === "function"
      ? context.id()
      : (context.id ?? `${production.id}-r${draft.revision}`);
  const makeId = (kind: string) => `${kind}-${commandToken}`;
  let summary = "",
    newProposalId: string | null = null;
  switch (command.type) {
    case "update_detail":
    case "add_detail_preview":
    case "approve_detail": {
      summary = applyDetailCommand(draft, command, { now, makeId });
      break;
    }
    case "create_candidate":
    case "add_candidate_preview":
    case "approve_candidate":
    case "revoke_candidate_approval":
    case "adopt_candidate": {
      summary = applyCandidateCommand(draft, command, {
        now,
        makeId,
        invalidate: (lookIds, unitIds = []) => {
          invalidateOperations(
            draft,
            { lookIds, unitIds },
            "Appearance evidence changed; recheck dependent allocations and handoffs.",
            unitIds.length > 0,
          );
        },
      });
      break;
    }
    case "import_example_performer": {
      const source = findRecord(
        createExampleProduction("library", now).performers,
        command.sourcePerformerId,
        "Example performer",
      );
      const performer = structuredClone(source);
      performer.id = makeId("performer");
      performer.librarySourceId = source.id;
      if (performer.faceCapture)
        performer.faceCapture.librarySourceId = source.id;
      draft.performers.push(performer);
      summary = `Imported ${performer.name} from the labelled synthetic adult cast library; no real participant permission is claimed.`;
      break;
    }
    case "import_example_unit": {
      const source = findRecord(
        createExampleProduction("library", now).units,
        command.sourceUnitId,
        "Example physical unit",
      );
      const unit = structuredClone(source);
      unit.id = makeId("unit");
      unit.librarySourceId = source.id;
      unit.approvedSubstituteIds = [];
      draft.units.push(unit);
      summary = `Imported ${unit.code} as a distinct synthetic physical-unit record; no fitting, stock confirmation or purchase is inferred.`;
      break;
    }
    case "set_own_clothes": {
      const character = findRecord(
        draft.characters,
        command.characterId,
        "Character",
      );
      character.ownClothes = command.ownClothes;
      const lookIds = draft.looks
        .filter((look) => look.characterId === character.id)
        .map((look) => look.id);
      invalidateOperations(
        draft,
        {
          lookIds,
          occurrenceIds: draft.occurrences
            .filter((occurrence) =>
              draft.scenes.some(
                (scene) =>
                  scene.id === occurrence.sceneId &&
                  scene.characterIds.includes(character.id),
              ),
            )
            .map((item) => item.id),
        },
        "The character's own-clothes planning scope changed.",
      );
      summary = `${character.name} ${command.ownClothes ? "is explicitly exempt from managed wardrobe allocation and uses their own clothes" : "requires managed wardrobe planning again"}.`;
      break;
    }
    case "draft_schedule": {
      requireFact(
        Number.isFinite(date(command.start)) &&
          /(?:Z|[+-]\d{2}:\d{2})$/i.test(command.start),
        "TIMEZONE_REQUIRED",
        "Choose a valid schedule start with its UTC offset.",
      );
      requireFact(
        Number.isFinite(command.sceneMinutes) &&
          command.sceneMinutes > 0 &&
          Number.isFinite(command.gapMinutes) &&
          command.gapMinutes >= 0 &&
          !!command.location.trim(),
        "INVALID_SCHEDULE_DRAFT",
        "A schedule draft needs positive scene minutes, nonnegative gap minutes and a location.",
      );
      let start = date(command.start),
        added = 0;
      for (const scene of draft.scenes) {
        const existing = draft.occurrences.filter(
          (item) => item.sceneId === scene.id,
        );
        if (existing.length) {
          start = Math.max(
            start,
            ...existing.map(
              (item) => date(item.end) + command.gapMinutes * 60000,
            ),
          );
          continue;
        }
        const end = start + command.sceneMinutes * 60000;
        draft.occurrences.push({
          id: makeId(`occ-${scene.id}`),
          sceneId: scene.id,
          label: `Draft call · scene ${scene.number}`,
          kind: draft.mode === "film" ? "shoot" : "performance",
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          location: command.location.trim(),
          order: draft.occurrences.length + 1,
        });
        start = end + command.gapMinutes * 60000;
        added++;
      }
      summary = `Drafted ${added} missing scene calls in script order. Existing edited calls were retained; durations remain planning inputs.`;
      break;
    }
    case "set_example_decisions": {
      requireFact(
        draft.fixture,
        "EXAMPLE_ONLY",
        "Sample decisions are available only in the explicitly synthetic example production.",
        403,
      );
      const reviewer = "Example reviewer (sample decision)";
      let decisions = 0;
      const revokedIds = new Set<string>();
      const revoke = (approval: {
        id: string;
        state: string;
        reason: string | null;
        decisionSource?: string;
      }) => {
        if (
          approval.decisionSource === "example" &&
          approval.state === "current"
        ) {
          approval.state = "blocked";
          approval.reason = "Example decisions were explicitly switched off.";
          if (!revokedIds.has(approval.id)) {
            decisions++;
            revokedIds.add(approval.id);
          }
        }
      };
      if (!command.enabled) {
        for (const look of draft.looks) {
          look.approvals.forEach(revoke);
          look.beauty?.approvals.forEach(revoke);
          for (const detail of look.details ?? [])
            detail.approvals.forEach(revoke);
        }
        for (const candidate of draft.appearanceCandidates ?? [])
          candidate.approvals.forEach(revoke);
        invalidateOperations(
          draft,
          { lookIds: draft.looks.map((look) => look.id) },
          "Sample appearance decisions were removed; recheck managed wardrobe allocation.",
        );
      } else {
        for (const look of draft.looks) {
          const preview = getCurrentPreview(look, draft);
          if (
            preview &&
            !look.activeCandidateId &&
            !getCurrentApproval(look, draft)
          ) {
            look.approvals.push({
              id: makeId(`example-approval-${look.id}`),
              lookId: look.id,
              recipeRevision: look.revision,
              previewId: preview.id,
              performerId: look.performerId,
              captureVersion: preview.captureVersion,
              sceneIds: [...look.sceneIds],
              approvedBy: reviewer,
              rationale:
                "Sample creative decision on this exact recorded output for the synthetic story; no physical fitting or human research outcome is claimed.",
              approvedAt: now,
              state: "current",
              reason: null,
              intentHash: appearanceIntentHash(draft, [look.id]),
              previewHash: previewEvidenceHash(preview),
              decisionSource: "example",
            });
            look.reviewReason = null;
            decisions++;
          }
          const beautyPreview = look.beauty && getCurrentBeautyPreview(look);
          const face = draft.performers.find(
            (item) => item.id === look.performerId,
          )?.faceCapture;
          if (
            beautyPreview &&
            face?.consent.granted &&
            beautyPreview.faceCaptureVersion === face.version &&
            beautyPreview.inputHash === beautyInputHash(draft, look) &&
            !getCurrentBeautyApproval(look)
          ) {
            look.beauty!.approvals.push({
              id: makeId(`example-beauty-${look.id}`),
              lookId: look.id,
              beautyRevision: look.beauty!.revision,
              previewId: beautyPreview.id,
              performerId: look.performerId,
              faceCaptureVersion: face.version,
              sceneIds: [...look.sceneIds],
              approvedBy: reviewer,
              rationale:
                "Sample independent makeup decision on the exact recorded synthetic face detail.",
              approvedAt: now,
              state: "current",
              reason: null,
              decisionSource: "example",
            });
            decisions++;
          }
          for (const detail of look.details ?? []) {
            const detailPreview = getCurrentDetailPreview(
              look,
              detail.kind,
              draft,
            );
            if (
              detailPreview &&
              !getCurrentDetailApproval(look, detail.kind, draft)
            ) {
              applyDetailCommand(
                draft,
                {
                  type: "approve_detail",
                  lookId: look.id,
                  kind: detail.kind,
                  previewId: detailPreview.id,
                  approvedBy: reviewer,
                  rationale:
                    "Sample independent creative decision on this exact recorded synthetic detail; no physical outcome is claimed.",
                },
                { now, makeId: (kind) => makeId(`example-${kind}-${look.id}`) },
              );
              detail.approvals.at(-1)!.decisionSource = "example";
              decisions++;
            }
          }
        }
        for (const candidateId of unique(
          draft.looks
            .map((look) => look.activeCandidateId)
            .filter((id): id is string => !!id),
        )) {
          const candidate = findRecord(
            draft.appearanceCandidates ?? [],
            candidateId,
            "Active candidate",
          );
          const preview = getCurrentCandidatePreview(draft, candidate);
          if (!getCurrentCandidateApproval(draft, candidate) && preview) {
            applyCandidateCommand(
              draft,
              {
                type: "approve_candidate",
                candidateId,
                previewId: preview.id,
                approvedBy: reviewer,
                rationale:
                  "Sample exact candidate decision for the fictional production; no physical fit is inferred.",
              },
              {
                now,
                makeId: (kind) => makeId(`example-${kind}-${candidateId}`),
                invalidate: () => {},
              },
            );
            const approval = candidate.approvals.at(-1)!;
            approval.decisionSource = "example";
            for (const look of draft.looks)
              for (const copy of look.approvals.filter(
                (item) => item.id === approval.id,
              ))
                copy.decisionSource = "example";
            decisions++;
          }
        }
      }
      summary = `${command.enabled ? "Recorded" : "Removed"} ${decisions} explicit sample decisions. Manual approvals, source truth and physical evidence remain separate.`;
      break;
    }
    case "update_production": {
      if (command.title !== undefined) {
        requireFact(
          !!command.title.trim(),
          "TITLE_REQUIRED",
          "Name this production.",
        );
        draft.title = command.title.trim();
      }
      if (command.subtitle !== undefined) draft.subtitle = command.subtitle;
      if (command.budgetCents !== undefined) {
        requireMoney(command.budgetCents);
        draft.budgetCents = command.budgetCents;
      }
      if (command.mode !== undefined) draft.mode = command.mode;
      if (command.timeZone !== undefined) {
        try {
          new Intl.DateTimeFormat("en", {
            timeZone: command.timeZone,
          }).format();
        } catch {
          throw new DomainError(
            "INVALID_TIMEZONE",
            "Choose a valid IANA production timezone.",
          );
        }
        draft.timeZone = command.timeZone;
      }
      if (
        changed(
          {
            budget: production.budgetCents,
            mode: production.mode,
            zone: production.timeZone,
          },
          { budget: draft.budgetCents, mode: draft.mode, zone: draft.timeZone },
        )
      )
        invalidateOperations(
          draft,
          {
            occurrenceIds: draft.occurrences.map((occurrence) => occurrence.id),
          },
          "Production budget, mode or timezone changed; allocation review is required.",
        );
      if (
        production.title !== draft.title ||
        production.subtitle !== draft.subtitle
      )
        for (const pack of draft.packs) pack.state = "superseded";
      summary = "Updated the production's recorded settings.";
      break;
    }
    case "review_scene": {
      const scene = findRecord(draft.scenes, command.sceneId, "Scene");
      requireFact(
        !!draft.script,
        "SCRIPT_REQUIRED",
        "Import the source script before reviewing its breakdown.",
      );
      const reviewed = {
        ...scene,
        title: command.title.trim(),
        storyDay: command.storyDay,
        storyDaySource: "reviewed" as const,
        requirements: structuredClone(command.requirements).map(
          (requirement) => ({ ...requirement, reviewed: true }),
        ),
        reviewed: true,
      };
      requireFact(
        !!reviewed.title,
        "TITLE_REQUIRED",
        "Give the scene a title.",
      );
      validateSceneSources(
        draft.script,
        draft.scenes.map((item) => (item.id === reviewed.id ? reviewed : item)),
        draft.characters,
      );
      const semantic = (item: typeof scene) => ({
        storyDay: item.storyDay,
        requirements: item.requirements.map(
          ({ id, characterId, text, explicit }) => ({
            id,
            characterId,
            text,
            explicit,
          }),
        ),
      });
      if (changed(semantic(scene), semantic(reviewed))) {
        invalidateDetails(
          draft,
          draft.looks
            .filter((look) => look.sceneIds.includes(scene.id))
            .map((look) => look.id),
          "Reviewed story day or requirements changed; review independent detail scope.",
          false,
          "needs_review",
        );
        invalidateAppearance(
          draft,
          draft.looks
            .filter((look) => look.sceneIds.includes(scene.id))
            .map((look) => look.id),
          "Reviewed story day or script appearance requirements changed.",
          false,
          "needs_review",
        );
        invalidateBeauty(
          draft,
          draft.looks
            .filter((look) => look.sceneIds.includes(scene.id))
            .map((look) => look.id),
          "Reviewed story day or script appearance requirements changed; review the separate beauty scope.",
          false,
          "needs_review",
        );
      } else
        invalidateOperations(
          draft,
          { occurrenceIds: [] },
          "Scene metadata changed.",
        );
      Object.assign(scene, reviewed);
      for (const look of draft.looks.filter((look) =>
        look.sceneIds.includes(scene.id),
      ))
        look.storyDays = unique(
          look.sceneIds.map(
            (id) => findRecord(draft.scenes, id, "Scene").storyDay,
          ),
        );
      for (const pack of draft.packs)
        if (pack.snapshot.scenes.some((item) => item.id === scene.id))
          pack.state = "superseded";
      summary = `Reviewed scene ${scene.number}: ${scene.title}.`;
      break;
    }
    case "adopt_script": {
      const merged = mergeScriptRevision(
        draft,
        command.script,
        command.scenes,
        command.characters,
      );
      draft.script = structuredClone(command.script);
      draft.scenes = merged.scenes;
      draft.characters = merged.characters;
      for (const look of draft.looks)
        look.storyDays = unique(
          look.sceneIds.map(
            (id) => findRecord(draft.scenes, id, "Look scene").storyDay,
          ),
        );
      const affected = draft.looks
        .filter((look) =>
          look.sceneIds.some((id) => merged.diff.changedSceneIds.includes(id)),
        )
        .map((look) => look.id);
      invalidateAppearance(
        draft,
        affected,
        "New script source or appearance requirements need review; human corrections were preserved.",
        false,
        "needs_review",
      );
      invalidateBeauty(
        draft,
        affected,
        "New source requirements affect this beauty approval scope; human corrections were preserved.",
        false,
        "needs_review",
      );
      invalidateDetails(
        draft,
        affected,
        "Script requirements changed; review independent detail intent and scene scope.",
        false,
        "needs_review",
      );
      for (const pack of draft.packs) pack.state = "superseded";
      summary = `Adopted ${command.script.label}; preserved ${merged.diff.preservedReviewedSceneIds.length} reviewed scene corrections and flagged ${merged.diff.changedSceneIds.length} changed scenes.`;
      break;
    }
    case "update_occurrence": {
      const occurrence = structuredClone(command.occurrence);
      findRecord(draft.scenes, occurrence.sceneId, "Scheduled scene");
      requireWindow(occurrence.start, occurrence.end);
      requireFact(
        !!occurrence.location.trim(),
        "LOCATION_REQUIRED",
        "Record the occurrence location before allocation.",
      );
      const old = draft.occurrences.find((item) => item.id === occurrence.id);
      if (old) Object.assign(old, occurrence);
      else {
        requireNew(draft.occurrences, occurrence.id, "Occurrence");
        draft.occurrences.push(occurrence);
      }
      const beforeIntervals = allocationDemandIntervals(production),
        afterIntervals = allocationDemandIntervals(draft);
      const changedOccurrences = unique([
        occurrence.id,
        ...draft.occurrences
          .filter((item) =>
            changed(
              beforeIntervals.filter(
                (interval) => interval.occurrenceId === item.id,
              ),
              afterIntervals.filter(
                (interval) => interval.occurrenceId === item.id,
              ),
            ),
          )
          .map((item) => item.id),
      ]);
      invalidateOperations(
        draft,
        { occurrenceIds: changedOccurrences },
        "The occurrence or a dependent continuous-wear interval changed.",
      );
      const usedUnits = draft.looks
        .filter((look) => look.sceneIds.includes(occurrence.sceneId))
        .flatMap((look) => look.unitIds);
      for (const request of draft.sourcing)
        if (
          request.unitIds.some((id) => usedUnits.includes(id)) &&
          afterIntervals.some(
            (interval) =>
              interval.occurrenceId === occurrence.id &&
              request.unitIds.includes(interval.unitId) &&
              (date(request.from) > interval.start ||
                date(request.to) < interval.end),
          )
        )
          request.stale = true;
      for (const pack of draft.packs)
        if (pack.snapshot.units.some((unit) => usedUnits.includes(unit.id)))
          pack.state = "superseded";
      summary = `Updated ${occurrence.label}; story chronology and appearance approvals were preserved.`;
      break;
    }
    case "add_performer": {
      requireNew(draft.performers, command.performer.id, "Performer");
      requireFact(
        !!command.performer.name.trim(),
        "NAME_REQUIRED",
        "Name the performer.",
      );
      draft.performers.push({
        ...structuredClone(command.performer),
        captureVersion: Math.max(1, command.performer.captureVersion),
      });
      summary = `Added performer ${command.performer.name}.`;
      break;
    }
    case "add_character": {
      requireNew(draft.characters, command.character.id, "Character");
      requireFact(
        !!command.character.name.trim(),
        "NAME_REQUIRED",
        "Name the character.",
      );
      if (command.character.performerId)
        findRecord(
          draft.performers,
          command.character.performerId,
          "Cast performer",
        );
      requireFact(
        !command.character.direction.approvedBy,
        "DIRECTION_APPROVAL_REQUIRED",
        "Create the character first, then explicitly record the direction approval.",
      );
      draft.characters.push({
        ...structuredClone(command.character),
        direction: {
          ...structuredClone(command.character.direction),
          revision: 1,
          approvedBy: null,
        },
      });
      summary = `Added character ${command.character.name}.`;
      break;
    }
    case "update_performer": {
      const performer = findRecord(
        draft.performers,
        command.performerId,
        "Performer",
      );
      const sourceChanged =
        (command.imageUrl !== undefined &&
          command.imageUrl !== performer.imageUrl) ||
        (command.assetId !== undefined &&
          command.assetId !== performer.assetId);
      const consentWithdrawn =
        command.consent !== undefined &&
        !command.consent.granted &&
        performer.consent.granted;
      if (command.name !== undefined) {
        requireFact(
          !!command.name.trim(),
          "NAME_REQUIRED",
          "Name the performer.",
        );
        performer.name = command.name.trim();
      }
      if (command.imageUrl !== undefined) performer.imageUrl = command.imageUrl;
      if (command.assetId !== undefined) performer.assetId = command.assetId;
      if (command.consent !== undefined)
        performer.consent = structuredClone(command.consent);
      if (sourceChanged && command.assetId) {
        performer.synthetic = false;
        performer.consent = command.consent
          ? { ...performer.consent, publicDemo: false }
          : {
              granted: false,
              purpose:
                "User-provided source image; record specific processing permission before generating a preview.",
              publicDemo: false,
              recordedAt: null,
            };
      }
      const lookIds = draft.looks
        .filter((look) => look.performerId === performer.id)
        .map((look) => look.id);
      if (sourceChanged || consentWithdrawn) {
        if (sourceChanged) delete performer.librarySourceId;
        performer.captureVersion += 1;
        invalidateAppearance(
          draft,
          lookIds,
          consentWithdrawn
            ? "Performer image permission was withdrawn. Stop new derivations and review private asset access."
            : "Performer source capture changed; old output is historical evidence only.",
          true,
          consentWithdrawn ? "blocked" : "stale",
          (candidate) => candidate.performerId === performer.id,
        );
        if (consentWithdrawn) revokeFaceConsent(draft, performer.id, now);
      } else {
        for (const pack of draft.packs)
          if (pack.snapshot.performers.some((item) => item.id === performer.id))
            pack.state = "superseded";
      }
      summary = `Updated ${performer.name}${sourceChanged ? " and advanced the source capture version" : ""}.`;
      break;
    }
    case "withdraw_consent": {
      const performer = findRecord(
        draft.performers,
        command.performerId,
        "Performer",
      );
      performer.consent = {
        ...performer.consent,
        granted: false,
        publicDemo: false,
        recordedAt: now,
      };
      performer.captureVersion += 1;
      revokeFaceConsent(draft, performer.id, now);
      invalidateAppearance(
        draft,
        draft.looks
          .filter((look) => look.performerId === performer.id)
          .map((look) => look.id),
        "Performer image consent withdrawn. New previews, approvals and image-bearing handoffs are blocked.",
        true,
        "blocked",
        (candidate) => candidate.performerId === performer.id,
      );
      summary = `Recorded ${performer.name}'s image-consent withdrawal; related actor evidence requires review.`;
      break;
    }
    case "update_face_capture":
    case "withdraw_face_consent":
    case "update_beauty":
    case "add_beauty_preview":
    case "approve_beauty": {
      summary = applyBeautyCommand(draft, command, { now, makeId });
      break;
    }
    case "edit_direction":
    case "update_direction": {
      const character = findRecord(
        draft.characters,
        command.characterId,
        "Character",
      );
      requireFact(
        !!command.text.trim() &&
          (command.type === "edit_direction" || !!command.approvedBy.trim()),
        "DIRECTION_REVIEW_REQUIRED",
        "Record the direction and its named reviewer.",
      );
      character.direction = {
        ...character.direction,
        text: command.text,
        essential: unique(command.essential),
        palette:
          command.type === "edit_direction" && command.palette
            ? [...command.palette]
            : character.direction.palette,
        approvedBy:
          command.type === "edit_direction" ? null : command.approvedBy.trim(),
        revision: character.direction.revision + 1,
      };
      invalidateDetails(
        draft,
        draft.looks
          .filter((look) => look.characterId === character.id)
          .map((look) => look.id),
        "Character direction changed; inspect existing independent detail pixels against the new intent.",
        false,
        "needs_review",
      );
      invalidateBeauty(
        draft,
        draft.looks
          .filter((look) => look.characterId === character.id)
          .map((look) => look.id),
        "Character direction changed; review whether this separate beauty detail still supports it.",
        false,
        "needs_review",
      );
      invalidateAppearance(
        draft,
        draft.looks
          .filter((look) => look.characterId === character.id)
          .map((look) => look.id),
        "Character direction changed; review whether the exact existing preview still satisfies it.",
        false,
        "needs_review",
      );
      summary = `Recorded direction revision ${character.direction.revision} for ${character.name}.`;
      break;
    }
    case "create_look": {
      requireNew(draft.looks, command.look.id, "Look");
      const look = structuredClone(command.look);
      delete look.removedUnitIds;
      const character = findRecord(
        draft.characters,
        look.characterId,
        "Character",
      );
      findRecord(draft.performers, look.performerId, "Look performer");
      requireFact(
        character.performerId === look.performerId,
        "CASTING_MISMATCH",
        "Assign this performer to the character before creating their look. Use the reviewed recast workflow to change casting.",
      );
      requireFact(
        look.previews.length === 0 && look.approvals.length === 0,
        "EVIDENCE_IMPORT_FORBIDDEN",
        "A new look starts without provider outputs or appearance approvals.",
      );
      if (look.beauty) {
        requireFact(
          look.beauty.previews.length === 0 &&
            look.beauty.approvals.length === 0,
          "EVIDENCE_IMPORT_FORBIDDEN",
          "A new beauty recipe cannot import forged provider output or approval.",
        );
        look.beauty = {
          revision: 1,
          recipe: validatedBeautyRecipe(look.beauty.recipe),
          previews: [],
          approvals: [],
          reviewReason:
            "Beauty detail is configured but not yet generated or approved.",
        };
      }
      if (look.details)
        look.details = look.details.map((detail) => {
          requireFact(
            detail.previews.length === 0 && detail.approvals.length === 0,
            "EVIDENCE_IMPORT_FORBIDDEN",
            "A new independent detail cannot import provider evidence or approvals.",
          );
          return {
            kind: detail.kind,
            revision: 1,
            recipe: validatedDetailRecipe(draft, detail.recipe),
            previews: [],
            approvals: [],
            reviewReason:
              "Independent detail is configured and needs its own exact output and approval.",
          };
        });
      requireFact(
        look.makeup.skinSmoothStrength === 0 &&
          look.makeup.skinSmoothColorIntensity === 0,
        "SMOOTHING_DISABLED",
        "Normal production recipes must explicitly preserve both zero skin-smoothing settings.",
      );
      requireFact(
        unique(look.unitIds).length === look.unitIds.length,
        "DUPLICATE_UNIT_REQUIREMENT",
        "A recipe cannot specify the same physical unit twice.",
      );
      for (const unitId of look.unitIds)
        findRecord(draft.units, unitId, "Look physical unit");
      for (const sceneId of look.sceneIds) {
        const scene = findRecord(draft.scenes, sceneId, "Look scene");
        scene.lookIds = unique([...scene.lookIds, look.id]);
        scene.characterIds = unique([...scene.characterIds, character.id]);
      }
      look.revision = 1;
      look.previews = [];
      look.approvals = [];
      look.reviewReason = null;
      look.storyDays = unique(
        look.sceneIds.map(
          (id) => findRecord(draft.scenes, id, "Look scene").storyDay,
        ),
      );
      if (look.preparationMinutes === null)
        look.preparationEvidence = "unknown";
      requireFact(
        look.preparationMinutes === null ||
          (Number.isFinite(look.preparationMinutes) &&
            look.preparationMinutes >= 0),
        "INVALID_PREPARATION",
        "Preparation duration must be unknown or a nonnegative number of minutes.",
      );
      draft.looks.push(look);
      invalidateOperations(
        draft,
        {
          occurrenceIds: draft.occurrences
            .filter((occurrence) => look.sceneIds.includes(occurrence.sceneId))
            .map((occurrence) => occurrence.id),
        },
        "A look was added to the scene plan.",
      );
      summary = `Created ${look.title} for ${character.name}; no visual or physical approval was inferred.`;
      break;
    }
    case "update_look": {
      const look = findRecord(draft.looks, command.lookId, "Look");
      const before = structuredClone(look);
      if (command.unitIds !== undefined) {
        requireFact(
          unique(command.unitIds).length === command.unitIds.length,
          "DUPLICATE_UNIT_REQUIREMENT",
          "A recipe cannot specify the same physical unit twice.",
        );
        for (const unitId of command.unitIds)
          findRecord(draft.units, unitId, "Look physical unit");
        look.removedUnitIds = unique([
          ...(look.removedUnitIds ?? []),
          ...look.unitIds.filter((id) => !command.unitIds!.includes(id)),
        ]).filter((id) => !command.unitIds!.includes(id));
        look.unitIds = [...command.unitIds];
      }
      if (command.category !== undefined) look.category = command.category;
      if (
        !sameIds(before.unitIds, look.unitIds) ||
        before.category !== look.category
      )
        delete look.activeCandidateId;
      if (command.silhouette !== undefined)
        look.silhouette = command.silhouette;
      if (command.makeupNotes !== undefined)
        look.makeup.notes = command.makeupNotes;
      if (command.hair !== undefined) look.hair = command.hair;
      if (command.accessories !== undefined)
        look.accessories = command.accessories;
      if (command.note !== undefined) look.note = command.note;
      if (command.preparationMinutes !== undefined) {
        requireFact(
          command.preparationMinutes === null ||
            (Number.isFinite(command.preparationMinutes) &&
              command.preparationMinutes >= 0),
          "INVALID_PREPARATION",
          "Preparation duration must be unknown or a nonnegative number of minutes.",
        );
        look.preparationMinutes = command.preparationMinutes;
        look.preparationEvidence =
          command.preparationMinutes === null ? "unknown" : "estimate";
      }
      const visual = (item: Look) => ({
        unitIds: item.unitIds,
        category: item.category,
        silhouette: item.silhouette,
        makeup: item.makeup,
        hair: item.hair,
        accessories: item.accessories,
      });
      if (changed(visual(before), visual(look)))
        invalidateAppearance(
          draft,
          [look.id],
          "The exact recipe changed; regenerate and approve the new revision.",
          true,
        );
      else if (
        before.preparationMinutes !== look.preparationMinutes ||
        before.preparationEvidence !== look.preparationEvidence
      )
        invalidateOperations(
          draft,
          { lookIds: [look.id] },
          "Preparation timing changed; recheck the physical schedule.",
        );
      if (!sameIds(before.unitIds, look.unitIds))
        invalidateOperations(
          draft,
          {
            unitIds: before.unitIds.filter((id) => !look.unitIds.includes(id)),
          },
          "A garment was removed from this recipe; review its sourcing scope.",
          true,
        );
      for (const pack of draft.packs)
        if (pack.snapshot.looks.some((item) => item.id === look.id))
          pack.state = "superseded";
      summary = `Saved ${look.title}${before.revision !== look.revision ? ` as recipe revision ${look.revision}` : ""}.`;
      break;
    }
    case "add_preview": {
      const look = findRecord(draft.looks, command.lookId, "Look");
      const performer = findRecord(
        draft.performers,
        look.performerId,
        "Preview performer",
      );
      requireFact(
        performer.consent.granted && !!performer.imageUrl,
        "CONSENT_REQUIRED",
        "A source image with current performer permission is required before adding a preview.",
        403,
      );
      const preview = command.preview;
      requireFact(
        preview.provenance === "recorded_provider" ||
          preview.provenance === "live_provider",
        "PROVIDER_EVIDENCE_REQUIRED",
        "Source portraits and synthetic images cannot be attached as provider previews.",
      );
      requireNew(
        draft.looks.flatMap((item) => item.previews),
        preview.id,
        "Preview",
      );
      requireFact(
        preview.lookId === look.id &&
          preview.recipeRevision === look.revision &&
          preview.performerId === performer.id &&
          preview.captureVersion === performer.captureVersion &&
          sameIds(preview.unitIds, look.unitIds) &&
          preview.sourceImageUrl === performer.imageUrl &&
          preview.inputHash === previewInputHash(draft, look),
        "STALE_PREVIEW",
        "The provider result belongs to a different actor, source capture, garment or recipe revision. Keep it as historical job evidence and request the current inputs.",
        409,
      );
      requireFact(
        !!preview.imageUrl.trim() &&
          preview.imageUrl !== preview.sourceImageUrl,
        "PREVIEW_OUTPUT_REQUIRED",
        "A preview needs a distinct, stored provider output image.",
      );
      look.previews.push(structuredClone(preview));
      look.reviewReason =
        "Inspect the current garment result and record a fresh exact-output appearance approval.";
      for (const pack of draft.packs)
        if (pack.snapshot.looks.some((item) => item.id === look.id))
          pack.state = "superseded";
      summary = `Attached a ${preview.provenance === "recorded_provider" ? "recorded" : "live"} provider result to ${look.title}; appearance approval remains explicit.`;
      break;
    }
    case "approve_look": {
      const look = findRecord(draft.looks, command.lookId, "Look");
      if (look.activeCandidateId) {
        summary = applyCandidateCommand(
          draft,
          {
            type: "approve_candidate",
            candidateId: look.activeCandidateId,
            previewId: command.previewId,
            approvedBy: command.approvedBy,
            rationale: command.rationale,
          },
          {
            now,
            makeId,
            invalidate: (lookIds) =>
              invalidateOperations(
                draft,
                { lookIds },
                "The exact adopted candidate decision changed.",
              ),
          },
        );
        break;
      }
      const performer = findRecord(
        draft.performers,
        look.performerId,
        "Appearance performer",
      );
      requireFact(
        performer.consent.granted,
        "CONSENT_REQUIRED",
        "Current performer permission is required to approve their image.",
        403,
      );
      const preview = findRecord(
        look.previews,
        command.previewId,
        "Provider preview",
      );
      requireFact(
        preview.recipeRevision === look.revision &&
          preview.performerId === performer.id &&
          preview.captureVersion === performer.captureVersion &&
          sameIds(preview.unitIds, look.unitIds) &&
          preview.inputHash === previewInputHash(draft, look),
        "STALE_PREVIEW",
        "Approve a preview of the exact current actor, capture and recipe revision.",
        409,
      );
      requireFact(
        !!command.approvedBy.trim() && !!command.rationale.trim(),
        "APPROVAL_RATIONALE_REQUIRED",
        "Record the named reviewer and why this exact appearance is approved.",
      );
      // Bring the deliberately selected candidate into the displayed-current position.
      look.previews = [
        ...look.previews.filter((item) => item.id !== preview.id),
        preview,
      ];
      for (const approval of look.approvals)
        if (approval.state === "current") {
          approval.state = "historical";
          approval.reason =
            "A new exact-output approval superseded this approval.";
        }
      look.approvals.push({
        id: makeId("approval"),
        lookId: look.id,
        recipeRevision: look.revision,
        previewId: preview.id,
        performerId: performer.id,
        captureVersion: performer.captureVersion,
        sceneIds: [...look.sceneIds],
        approvedBy: command.approvedBy.trim(),
        rationale: command.rationale.trim(),
        approvedAt: now,
        state: "current",
        reason: null,
        intentHash: appearanceIntentHash(draft, [look.id]),
        previewHash: previewEvidenceHash(preview),
        decisionSource: "manual",
      });
      look.reviewReason = null;
      for (const pack of draft.packs)
        if (pack.snapshot.looks.some((item) => item.id === look.id))
          pack.state = "superseded";
      summary = `${command.approvedBy.trim()} approved the exact ${look.title} preview for ${performer.name}; fit and availability remain separate.`;
      break;
    }
    case "add_unit": {
      requireNew(draft.units, command.unit.id, "Physical unit");
      validateUnit(command.unit, draft);
      draft.units.push({ ...structuredClone(command.unit), version: 1 });
      summary = `Added physical unit ${command.unit.code}; its evidence provenance was retained.`;
      break;
    }
    case "update_unit": {
      const unit = findRecord(draft.units, command.unitId, "Physical unit");
      const previous = structuredClone(unit);
      if (command.status !== undefined) unit.status = command.status;
      if (command.location !== undefined) unit.location = command.location;
      if (command.priceCents !== undefined) {
        requireMoney(command.priceCents);
        unit.priceCents = command.priceCents;
      }
      if (command.priceSource !== undefined)
        unit.priceSource = command.priceSource;
      if (command.priceValidUntil !== undefined)
        unit.priceValidUntil = command.priceValidUntil;
      if (command.condition !== undefined) unit.condition = command.condition;
      if (command.availability !== undefined)
        unit.availability = structuredClone(command.availability);
      if (command.fitting !== undefined)
        unit.fitting = structuredClone(command.fitting);
      if (command.imageUrl !== undefined) unit.imageUrl = command.imageUrl;
      if (command.assetId !== undefined) unit.assetId = command.assetId;
      validateUnit(unit, draft);
      unit.version += 1;
      const assetChanged =
        previous.imageUrl !== unit.imageUrl ||
        previous.assetId !== unit.assetId;
      if (assetChanged) delete unit.librarySourceId;
      if (assetChanged)
        invalidateAppearance(
          draft,
          draft.looks
            .filter((look) => look.unitIds.includes(unit.id))
            .map((look) => look.id),
          "The source garment asset changed; the existing preview no longer represents the exact inputs.",
          true,
          "stale",
          (candidate) => candidate.recipe.unitIds.includes(unit.id),
        );
      const commercialChanged =
        previous.status !== unit.status ||
        previous.priceCents !== unit.priceCents ||
        previous.priceSource !== unit.priceSource ||
        previous.priceValidUntil !== unit.priceValidUntil ||
        changed(previous.availability, unit.availability);
      invalidateOperations(
        draft,
        { unitIds: [unit.id] },
        `${unit.code}'s physical facts changed; affected allocation and handoff need review.`,
        commercialChanged,
      );
      summary = `Updated ${unit.code} to fact version ${unit.version}; unrelated appearance approvals were preserved.`;
      break;
    }
    case "solve_allocation": {
      draft.allocationResult = solveAllocation(draft, {
        now,
        sourceRevision: draft.revision,
        proposalId: makeId("allocation"),
      });
      summary = `Computed ${draft.allocationResult.status.toLowerCase()} allocation using the bounded deterministic engine${draft.allocationResult.constraintChecked ? " and constraint check" : ""}.`;
      break;
    }
    case "adopt_allocation": {
      const result = draft.allocationResult;
      requireFact(
        !!result &&
          result.sourceRevision === previousRevision &&
          result.inputHash === command.inputHash &&
          result.inputHash === allocationInputHash(draft),
        "STALE_ALLOCATION",
        "This allocation was computed against an older production revision or different inventory facts. Recompute before adoption.",
        409,
      );
      requireFact(
        (result.status === "OPTIMAL" || result.status === "FEASIBLE") &&
          result.constraintChecked,
        "ALLOCATION_NOT_FEASIBLE",
        "Only a feasible allocation that passed its constraint check can be adopted.",
        409,
      );
      const review = getAllocationAdoptionReview(production, result);
      requireFact(
        !review.confirmationRequired || !!command.confirmation,
        "ALLOCATION_SWAP_CONFIRMATION_REQUIRED",
        "Review the listed garment changes and current direction references, then explicitly confirm this exact allocation proposal.",
        409,
      );
      if (command.confirmation)
        requireFact(
          command.confirmation.proposalId === review.proposalId &&
            command.confirmation.inputHash === review.inputHash &&
            command.confirmation.sourceRevision === review.sourceRevision &&
            command.confirmation.sourceRevision === previousRevision &&
            command.confirmation.reviewHash === review.reviewHash,
          "STALE_ALLOCATION_CONFIRMATION",
          "This confirmation belongs to another proposal, revision, candidate or creative intent. Review and confirm the current garment changes again.",
          409,
        );
      const check = validateAllocation(draft, result.assignments, { now });
      requireFact(
        check.valid,
        "ALLOCATION_CHECK_FAILED",
        check.findings.find((item) => item.severity === "conflict")?.message ??
          "The constraint checker could not establish complete demand coverage.",
        409,
      );
      for (const candidateId of unique(
        result.assignments
          .map((assignment) => assignment.candidateId)
          .filter((id): id is string => !!id),
      )) {
        const candidate = findRecord(
          draft.appearanceCandidates ?? [],
          candidateId,
          "Allocated candidate",
        );
        if (
          candidate.lookIds.some(
            (id) =>
              draft.looks.find((look) => look.id === id)?.activeCandidateId !==
              candidate.id,
          )
        )
          adoptAppearanceCandidate(draft, candidate, {
            now,
            makeId,
            invalidate: (lookIds, unitIds = []) =>
              invalidateOperations(
                draft,
                { lookIds, unitIds },
                "A solver-selected reviewed candidate was explicitly adopted.",
                unitIds.length > 0,
              ),
          });
      }
      draft.allocations = result.assignments.map((assignment) => ({
        ...structuredClone(assignment),
        state: "allocated",
        reason: null,
        sourceRevision: draft.revision,
      }));
      result.adoptedAt = now;
      result.adoptionRevision = draft.revision;
      if (command.confirmation)
        result.acceptedConfirmation = structuredClone(command.confirmation);
      for (const pack of draft.packs) pack.state = "superseded";
      summary = `Adopted ${draft.allocations.length} checked physical-unit assignments. Outstanding fitting, timing and supplier evidence remains visible.`;
      break;
    }
    case "create_sourcing": {
      requireFact(
        command.unitIds.length > 0 &&
          unique(command.unitIds).length === command.unitIds.length,
        "SOURCING_UNITS_REQUIRED",
        "Select distinct physical units for the sourcing request.",
      );
      requireWindow(command.from, command.to);
      const units = command.unitIds.map((id) =>
        findRecord(draft.units, id, "Requested physical unit"),
      );
      requireFact(
        !!command.supplier.trim() &&
          units.every((unit) => unit.supplier === command.supplier),
        "SUPPLIER_MISMATCH",
        "A sourcing request groups units from one recorded supplier.",
      );
      const quoteValidUntil = units
        .map((unit) => unit.priceValidUntil)
        .sort((a, b) => date(a) - date(b))[0];
      const synthetic =
        draft.fixture ||
        units.some(
          (unit) =>
            unit.availability.provenance === "synthetic" ||
            unit.fitting.provenance === "synthetic",
        );
      draft.sourcing.push({
        id: makeId("source"),
        unitIds: [...command.unitIds],
        supplier: command.supplier,
        from: command.from,
        to: command.to,
        status: "draft",
        sourceRevision: draft.revision,
        quoteCents: units.reduce((sum, unit) => sum + unit.priceCents, 0),
        quoteValidUntil,
        provenance: synthetic ? "synthetic" : "manual",
        operator: null,
        evidence: null,
        externalReference: null,
        updatedAt: now,
        stale: false,
        note: command.note,
      });
      summary = `Created a ${synthetic ? "synthetic " : ""}sourcing draft; no supplier message or confirmation was inferred.`;
      break;
    }
    case "update_sourcing": {
      const request = findRecord(
        draft.sourcing,
        command.requestId,
        "Sourcing request",
      );
      requireFact(
        sourcingTransitions[request.status].includes(command.status),
        "INVALID_SOURCING_TRANSITION",
        `A ${request.status} request cannot become ${command.status}. Confirmation, receipt and return are separate recorded stages.`,
        409,
      );
      requireFact(
        !!command.operator.trim() &&
          !!command.evidence.trim() &&
          !!command.externalReference.trim(),
        "SOURCING_EVIDENCE_REQUIRED",
        "Record the named operator, response or custody evidence, and external reference for this sourcing stage.",
      );
      const units = request.unitIds.map((id) =>
        findRecord(draft.units, id, "Requested physical unit"),
      );
      const synthetic =
        request.provenance === "synthetic" ||
        draft.fixture ||
        units.some((unit) => unit.availability.provenance === "synthetic");
      requireFact(
        !synthetic || command.provenance === "synthetic",
        "SYNTHETIC_PROVENANCE_REQUIRED",
        "This request uses synthetic supplier or fixture evidence. Its confirmation, receipt and return must remain labelled synthetic; it cannot become a real supplier outcome.",
      );
      if (command.status === "held" || command.status === "confirmed") {
        requireFact(
          !request.stale,
          "STALE_SOURCING",
          "The sourcing scope or quote changed. Create and review a current request before recording a hold or confirmation.",
          409,
        );
        requireFact(
          date(request.quoteValidUntil) >= date(now),
          "QUOTE_EXPIRED",
          "The quote expired. Obtain and record a current quote before a hold or confirmation.",
          409,
        );
        requireFact(
          units.every(
            (unit) =>
              !!unit.priceSource.trim() &&
              date(unit.priceValidUntil) >= date(now),
          ),
          "PRICE_EVIDENCE_REQUIRED",
          "A zero or missing price is not a free reservation. Record a current, sourced quote for every unit before a hold or confirmation.",
          409,
        );
        requireFact(
          units.every(
            (unit) =>
              unit.status === "available" &&
              date(unit.availability.from) <= date(request.from) &&
              date(unit.availability.to) >= date(request.to),
          ),
          "SOURCING_UNAVAILABLE",
          "The recorded unit status or availability no longer covers this request. Review the supplier response and inventory first.",
          409,
        );
      }
      request.status = command.status;
      request.operator = command.operator.trim();
      request.evidence = command.evidence.trim();
      request.externalReference = command.externalReference.trim();
      request.provenance = command.provenance;
      request.updatedAt = now;
      if (command.status === "confirmed") {
        for (const unit of units) {
          unit.availability = {
            from: request.from,
            to: request.to,
            source: `${command.provenance === "synthetic" ? "Synthetic exercise" : "Manual supplier confirmation"}: ${request.externalReference}. ${request.evidence}`,
            checkedAt: now,
            confirmed: true,
            provenance: command.provenance,
          };
          unit.version += 1;
        }
      }
      for (const pack of draft.packs)
        if (
          pack.snapshot.units.some((unit) => request.unitIds.includes(unit.id))
        )
          pack.state = "superseded";
      if (
        command.status === "declined" ||
        command.status === "cancelled" ||
        command.status === "returned"
      )
        invalidateOperations(
          draft,
          { unitIds: request.unitIds },
          `Sourcing request recorded as ${command.status}; current custody and availability need review.`,
        );
      summary = `${request.operator} recorded ${command.status}${request.provenance === "synthetic" ? " in the synthetic supplier exercise" : " with external evidence"}; receipt and return remain distinct stages.`;
      break;
    }
    case "propose_change": {
      const affected = draft.looks.filter((look) =>
        affectedLookIds(draft, command).includes(look.id),
      );
      const replacements =
        command.kind === "garment_unavailable"
          ? draft.units
              .filter(
                (unit) =>
                  unit.id !== command.subjectId &&
                  unit.category ===
                    findRecord(draft.units, command.subjectId, "Physical unit")
                      .category &&
                  (!command.replacementId || unit.id === command.replacementId),
              )
              .map((unit) => unit.id)
          : draft.performers
              .filter(
                (performer) =>
                  performer.consent.granted &&
                  !!performer.imageUrl &&
                  (!command.replacementId ||
                    performer.id === command.replacementId),
              )
              .map((performer) => performer.id);
      for (const replacement of replacements) {
        const existing = matchingRepairCandidates(draft, command, replacement);
        const seen = new Set<string>();
        for (const look of affected) {
          const key = look.continuityGroupId ?? look.id;
          if (
            seen.has(key) ||
            existing.some((candidate) => candidate.lookIds.includes(look.id))
          )
            continue;
          seen.add(key);
          const performerId =
            command.kind === "recast" ? replacement : look.performerId;
          if (
            !draft.performers.find((performer) => performer.id === performerId)
              ?.consent.granted
          )
            continue;
          if (command.kind === "recast" && performerId === look.performerId)
            continue;
          applyCandidateCommand(
            draft,
            {
              type: "create_candidate",
              lookId: look.id,
              unitIds:
                command.kind === "garment_unavailable"
                  ? look.unitIds.map((id) =>
                      id === command.subjectId ? replacement : id,
                    )
                  : look.unitIds,
              performerId,
            },
            {
              now,
              makeId: (kind) => makeId(`${kind}-${key}-${replacement}`),
              invalidate: () => {},
            },
          );
        }
      }
      const proposal = buildRepairProposal(draft, command, {
        id: makeId("repair"),
        now,
        seeded: command.seeded,
      });
      draft.proposals.push(proposal);
      newProposalId = proposal.id;
      summary = `Prepared a ${command.seeded ? "seeded " : ""}${command.kind === "recast" ? "recast" : "garment replacement"} proposal against revision ${draft.revision}; the baseline plan was preserved.`;
      break;
    }
    case "adopt_repair": {
      const proposal = findRecord(
        draft.proposals,
        command.proposalId,
        "Repair proposal",
      );
      requireFact(
        proposal.status === "proposed" &&
          proposal.baseRevision === previousRevision &&
          proposal.inputHash === repairInputHash(draft),
        "STALE_PROPOSAL",
        "This repair was reviewed against an older production revision, capture or inventory fact version. Recompute the proposal before adopting it.",
        409,
      );
      const option = findRecord(
        proposal.options,
        command.optionId,
        "Repair option",
      );
      requireFact(
        option.feasible,
        "REPAIR_INFEASIBLE",
        "This option does not satisfy the recorded constraints. Review its findings and choose an explicit permissible change.",
        409,
      );
      const replacementId =
        proposal.kind === "garment_unavailable"
          ? option.replacementUnitId
          : option.replacementPerformerId;
      requireFact(
        !!replacementId && replacementId !== proposal.subjectId,
        "REPLACEMENT_REQUIRED",
        "Select a distinct replacement before adoption.",
      );
      const request = {
        kind: proposal.kind,
        subjectId: proposal.subjectId,
        replacementId,
      };
      const lookIds = affectedLookIds(draft, request);
      const scratch = simulateRepair(draft, request, replacementId);
      const checked = solveAllocation(scratch, { now });
      requireFact(
        (proposal.kind === "recast" && lookIds.length === 0) ||
          ((checked.status === "OPTIMAL" || checked.status === "FEASIBLE") &&
            checked.constraintChecked),
        "REPAIR_INFEASIBLE",
        checked.findings.find((item) => item.severity === "conflict")
          ?.message ??
          "The current physical facts no longer establish this repair's feasibility.",
        409,
      );
      draft.characters = scratch.characters;
      draft.looks = scratch.looks;
      draft.units = scratch.units;
      draft.appearanceCandidates = scratch.appearanceCandidates;
      const reason =
        proposal.kind === "recast"
          ? "Recast adopted. Character direction is retained; this actor needs new source-specific previews, appearance approval and fitting evidence."
          : "Garment replacement adopted. The exact recipe changed; the prior appearance approval is historical and requires a fresh preview and approval.";
      const unapproved = lookIds.filter(
        (id) =>
          !getCurrentApproval(
            findRecord(draft.looks, id, "Repaired look"),
            draft,
          ),
      );
      if (unapproved.length)
        invalidateAppearance(draft, unapproved, reason, false);
      if (proposal.kind === "recast")
        invalidateBeauty(draft, lookIds, reason, false);
      if (proposal.kind === "recast")
        invalidateDetails(draft, lookIds, reason, false);
      invalidateOperations(
        draft,
        {
          lookIds,
          unitIds:
            proposal.kind === "garment_unavailable" ? [proposal.subjectId] : [],
          sourcingIds: proposal.impact.sourcingIds,
        },
        reason,
      );
      proposal.status = "adopted";
      proposal.adoptedAt = now;
      summary = `Adopted ${option.label} as production revision ${draft.revision}. Exact reviewed candidate identities and ${proposal.impact.preservedApprovalIds.length} unrelated approvals were preserved; physical fitting and supplier evidence remain separate.`;
      break;
    }
    case "create_pack": {
      requireFact(
        command.occurrenceIds.length > 0 &&
          unique(command.occurrenceIds).length === command.occurrenceIds.length,
        "PACK_OCCURRENCES_REQUIRED",
        "Select distinct scheduled occurrences for the crew pack.",
      );
      const occurrences = command.occurrenceIds.map((id) =>
        findRecord(draft.occurrences, id, "Pack occurrence"),
      );
      const sceneIds = unique(
        occurrences.map((occurrence) => occurrence.sceneId),
      );
      const looks = draft.looks.filter(
        (look) =>
          look.sceneIds.some((id) => sceneIds.includes(id)) &&
          !draft.characters.find(
            (character) => character.id === look.characterId,
          )?.ownClothes,
      );
      const performers = draft.performers.filter((performer) =>
        looks.some((look) => look.performerId === performer.id),
      );
      requireFact(
        performers.every((performer) => performer.consent.granted),
        "CONSENT_REQUIRED",
        "An image-bearing crew pack cannot be generated for a performer whose permission is missing or withdrawn.",
        403,
      );
      const allocations = draft.allocations.filter((allocation) =>
        command.occurrenceIds.includes(allocation.occurrenceId),
      );
      const unitIds = unique([
        ...looks.flatMap((look) => look.unitIds),
        ...allocations.map((allocation) => allocation.unitId),
      ]);
      const sourcing = draft.sourcing.filter((source) =>
        source.unitIds.some((id) => unitIds.includes(id)),
      );
      const checked = validateAllocation(
        draft,
        draft.allocations.filter(
          (allocation) => allocation.state === "allocated",
        ),
        { now },
      );
      const warnings = checked.findings
        .filter(
          (item) =>
            item.severity !== "info" &&
            (!item.occurrenceIds.length ||
              item.occurrenceIds.some((id) =>
                command.occurrenceIds.includes(id),
              )),
        )
        .map((item) => item.message);
      for (const character of draft.characters.filter(
        (character) =>
          character.ownClothes &&
          draft.scenes.some(
            (scene) =>
              sceneIds.includes(scene.id) &&
              scene.characterIds.includes(character.id),
          ),
      ))
        warnings.push(
          `${character.name}: explicitly using own clothes; no managed garment allocation or appearance approval is claimed.`,
        );
      for (const look of looks)
        if (!getCurrentApproval(look, draft))
          warnings.push(
            `${look.title}: no exact current appearance approval. Source portrait or unapproved preview must not be read as an approved look.`,
          );
      for (const look of looks)
        if (look.beauty && !getCurrentBeautyApproval(look))
          warnings.push(
            `${look.title}: separate beauty detail is configured but has no exact current beauty approval. Garment approval does not approve the face detail.`,
          );
      for (const look of looks)
        for (const detail of look.details ?? [])
          if (!getCurrentDetailApproval(look, detail.kind, draft))
            warnings.push(
              `${look.title}: independent ${detail.kind === "hair_color" ? "hair colour" : "necklace"} detail has no exact current approval. Digital output does not establish a physical wig, hairstyle or jewellery fit.`,
            );
      for (const look of looks)
        if (look.beauty) {
          const face = performers.find(
            (performer) => performer.id === look.performerId,
          )?.faceCapture;
          if (!face?.imageUrl || !face.consent.granted)
            warnings.push(
              `${look.title}: a separately permitted face source is missing or withdrawn. Face images and beauty output are omitted from this new working pack.`,
            );
        }
      for (const unitId of unitIds) {
        const unit = findRecord(draft.units, unitId, "Pack unit");
        if (
          unit.ownership === "rental" &&
          !sourcing.some(
            (source) =>
              source.unitIds.includes(unitId) &&
              !source.stale &&
              (source.status === "confirmed" || source.status === "received") &&
              source.provenance === "manual",
          )
        )
          warnings.push(
            `${unit.code}: real supplier confirmation is outstanding.`,
          );
      }
      if (draft.fixture)
        warnings.push(
          "Synthetic production exercise. Cast portraits, script and inventory are fictional; only explicitly labelled provider previews are actual recorded or live provider outputs. No physical or supplier outcome is implied.",
        );
      const title = command.title.trim() || "Crew scene pack";
      const candidates = (draft.appearanceCandidates ?? []).filter(
        (candidate) =>
          looks.some((look) => look.activeCandidateId === candidate.id),
      );
      const contextLooks = draft.looks.filter(
        (look) =>
          looks.some((item) => item.id === look.id) ||
          candidates.some((candidate) => candidate.lookIds.includes(look.id)),
      );
      const appearanceContext = {
        looks: contextLooks,
        scenes: draft.scenes.filter((scene) =>
          contextLooks.some((look) => look.sceneIds.includes(scene.id)),
        ),
        characters: draft.characters.filter((character) =>
          contextLooks.some((look) => look.characterId === character.id),
        ),
        performers: draft.performers.filter((performer) =>
          contextLooks.some((look) => look.performerId === performer.id),
        ),
        units: draft.units.filter((unit) =>
          contextLooks.some((look) => look.unitIds.includes(unit.id)),
        ),
      };
      const pack: CrewPack = {
        id: makeId("pack"),
        title: warnings.length ? `Working pack · ${title}` : title,
        occurrenceIds: [...command.occurrenceIds],
        sourceRevision: draft.revision,
        generatedAt: now,
        state: "current",
        warnings: unique(warnings),
        snapshot: structuredClone({
          title: draft.title,
          looks,
          performers,
          units: draft.units.filter((unit) => unitIds.includes(unit.id)),
          occurrences,
          scenes: draft.scenes.filter((scene) => sceneIds.includes(scene.id)),
          characters: draft.characters.filter((character) =>
            looks.some((look) => look.characterId === character.id),
          ),
          sourcing,
          allocations,
          transitions: draft.transitions.filter(
            (transition) =>
              command.occurrenceIds.includes(transition.fromOccurrenceId) ||
              command.occurrenceIds.includes(transition.toOccurrenceId),
          ),
          currency: draft.currency,
          timeZone: draft.timeZone,
          budgetCents: draft.budgetCents,
          script: draft.script,
          appearanceCandidates: candidates,
          appearanceContext,
          detailReferences: draft.detailReferences ?? [],
        }),
      };
      for (const performer of [
        ...pack.snapshot.performers,
        ...(pack.snapshot.appearanceContext?.performers ?? []),
      ])
        if (performer.faceCapture && !performer.faceCapture.consent.granted) {
          performer.faceCapture.imageUrl = null;
          performer.faceCapture.assetId = null;
        }
      for (const look of [
        ...pack.snapshot.looks,
        ...(pack.snapshot.appearanceContext?.looks ?? []),
      ])
        if (
          !pack.snapshot.performers.find(
            (performer) => performer.id === look.performerId,
          )?.faceCapture?.consent.granted
        )
          for (const detail of look.details ?? []) {
            detail.previews = [];
            detail.reviewReason =
              "Face-source permission is missing or withdrawn; independent detail images are omitted from this working pack.";
          }
      for (const look of [
        ...pack.snapshot.looks,
        ...(pack.snapshot.appearanceContext?.looks ?? []),
      ])
        if (
          look.beauty &&
          !pack.snapshot.performers.find(
            (performer) => performer.id === look.performerId,
          )?.faceCapture?.consent.granted
        ) {
          look.beauty.previews = [];
          look.beauty.reviewReason =
            "Face-source permission is missing or withdrawn; beauty images were omitted from this working pack.";
        }
      draft.packs.push(pack);
      summary = `Froze ${warnings.length ? "a working pack with outstanding-evidence warnings" : "a crew pack"} from revision ${draft.revision}.`;
      break;
    }
    case "update_transition": {
      const transition = structuredClone(command.transition);
      const performer = findRecord(
        draft.performers,
        transition.performerId,
        "Transition performer",
      );
      const from = findRecord(
        draft.occurrences,
        transition.fromOccurrenceId,
        "From occurrence",
      );
      const to = findRecord(
        draft.occurrences,
        transition.toOccurrenceId,
        "To occurrence",
      );
      requireFact(
        from.id !== to.id && date(from.start) < date(to.start),
        "TRANSITION_DIRECTION",
        "A directional transition must lead from an earlier occurrence to a distinct later occurrence.",
      );
      requireFact(
        [from, to].every((occurrence) =>
          draft.looks.some(
            (look) =>
              look.performerId === performer.id &&
              look.sceneIds.includes(occurrence.sceneId),
          ),
        ),
        "TRANSITION_SCOPE",
        "The performer must have a look in both exact transition occurrences.",
      );
      requireFact(
        transition.minutes === null ||
          (Number.isFinite(transition.minutes) && transition.minutes >= 0),
        "INVALID_TRANSITION",
        "A transition duration is unknown or a nonnegative number of minutes.",
      );
      requireFact(
        Number.isSafeInteger(transition.crewCapacity) &&
          transition.crewCapacity > 0,
        "INVALID_CREW_CAPACITY",
        "Record a positive integer capacity for the crew or station resource.",
      );
      requireFact(
        transition.minutes !== null || transition.evidence === "unknown",
        "TRANSITION_EVIDENCE_REQUIRED",
        "An estimated or observed transition needs its actual duration; an unknown duration remains unverified.",
      );
      const previous = draft.transitions.find(
        (item) => item.id === transition.id,
      );
      requireFact(
        !draft.transitions.some(
          (item) =>
            item.id !== transition.id &&
            item.performerId === transition.performerId &&
            item.fromOccurrenceId === transition.fromOccurrenceId &&
            item.toOccurrenceId === transition.toOccurrenceId,
        ),
        "DUPLICATE_TRANSITION",
        "This exact performer and directional occurrence pair already has a transition requirement.",
      );
      if (previous) Object.assign(previous, transition);
      else draft.transitions.push(transition);
      invalidateOperations(
        draft,
        { occurrenceIds: [from.id, to.id] },
        "Directional preparation or crew-capacity requirements changed.",
      );
      summary = `Recorded ${performer.name}'s exact directional change requirement; no reverse duration was inferred.`;
      break;
    }
    default: {
      const exhaustive: never = command;
      throw new DomainError(
        "UNKNOWN_COMMAND",
        `Unsupported production command ${(exhaustive as { type?: string }).type ?? "unknown"}.`,
        400,
      );
    }
  }
  for (const proposal of draft.proposals)
    if (proposal.status === "proposed" && proposal.id !== newProposalId)
      proposal.status = "stale";
  draft.events.push({
    id: makeId("event"),
    type: command.type,
    actor: context.actor.trim(),
    at: now,
    revision: draft.revision,
    summary,
    provenance:
      command.type === "add_preview" ||
      command.type === "add_beauty_preview" ||
      command.type === "add_candidate_preview" ||
      command.type === "add_detail_preview"
        ? command.preview.provenance
        : command.type === "adopt_script"
          ? command.script.provenance
          : command.type === "update_sourcing"
            ? command.provenance
            : draft.fixture
              ? "synthetic"
              : "manual",
  });
  return draft;
}
