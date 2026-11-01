import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createExampleProduction } from "@/lib/domain";
import type {
  GarmentCategory,
  Performer,
  PhysicalUnit,
  Production,
} from "@/lib/types";
import type {
  LibraryCatalog,
  LibraryPairSuggestion,
  LibraryProjectBindings,
  LibraryReadyPair,
  LibrarySelection,
  LibrarySelectionReason,
} from "@/lib/library-types";
import { matchRecording } from "@/lib/youcam/recorded";
import { ApiError } from "./errors";
import { readFixtureTransport } from "./fixture-transports";
import { sha256Bytes } from "./images";
import { fixtureImageUrls } from "./media-policy";
import {
  recordingAssociation,
  recordingSourceAssociation,
} from "./recording-associations";

const entityId = z.string().min(1).max(120);
export const LibraryQuerySchema = z
  .object({
    projectId: z.uuid().optional(),
    performerId: entityId.optional(),
    unitId: entityId.optional(),
    category: z
      .enum(["full_body", "upper_body", "lower_body", "shoes", "outerwear"])
      .optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      Boolean(query.performerId) !== Boolean(query.unitId) ||
      (query.performerId && !query.projectId) ||
      (query.category && !query.performerId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a project-scoped performer and unit together.",
      });
    }
  });

interface VerifiedImage {
  originalSha256: string;
  sha256: string;
}
interface SelectionInput {
  performerId: string;
  unitId: string;
  category?: GarmentCategory;
}

/** The caller owns authorization. Only allowlisted public fixture bytes are read. */
export async function libraryCatalog(
  project?: Production,
  selected?: SelectionInput,
): Promise<LibraryCatalog> {
  const example = createExampleProduction("example-library");
  const images = new Map<string, Promise<VerifiedImage | null>>();
  function image(path: string | null) {
    if (!path || !fixtureImageUrls.has(path)) return Promise.resolve(null);
    let pending = images.get(path);
    if (!pending) {
      pending = (async () => {
        try {
          const raw = await readFile(join(process.cwd(), "public", path));
          // Recheck frozen bytes on every response; no encoder/private-photo cache.
          const transport = await readFixtureTransport(path, raw, "garment");
          return { originalSha256: sha256Bytes(raw), sha256: transport.sha256 };
        } catch {
          return null;
        }
      })();
      images.set(path, pending);
    }
    return pending;
  }
  async function pair(
    production: Production,
    performer: Performer,
    unit: PhysicalUnit,
    category = unit.category,
  ) {
    if (!performer.consent.granted) return null;
    const association = recordingAssociation(
      production,
      performer,
      "garment",
      unit,
    );
    if (!association) return null;
    const [source, reference] = await Promise.all([
      image(association.sourceImagePath),
      image(association.referenceImagePath || null),
    ]);
    if (!source || !reference) return null;
    const recording = await matchRecording({
      lookId: "library-pair-check",
      performerId: performer.id,
      unitIds: [unit.id],
      category,
      sourceSha256: source.sha256,
      garmentSha256: reference.sha256,
      association,
    });
    // The task matcher checks transport/effects/output identity; also bind the
    // manifest's raw sources to the registered, unchanged artwork.
    if (
      !recording ||
      recording.sourceSha256 !== source.originalSha256 ||
      recording.garmentSha256 !== reference.originalSha256
    )
      return null;
    return recording;
  }
  const matches = await Promise.all(
    example.performers.flatMap((performer) =>
      example.units.map(async (unit) => {
        const recording = await pair(example, performer, unit);
        return recording
          ? ({
              performerId: performer.id,
              unitId: unit.id,
              category: unit.category,
              previewImageUrl: recording.imagePath,
            } satisfies LibraryReadyPair)
          : null;
      }),
    ),
  );
  const readyPairs = matches.filter(
    (item): item is LibraryReadyPair => item !== null,
  );
  const catalog: LibraryCatalog = {
    performers: example.performers.map(
      ({ id, name, imageUrl, synthetic, faceCapture }) => ({
        id,
        name,
        imageUrl,
        synthetic,
        ...(faceCapture
          ? {
              faceCapture: {
                imageUrl: faceCapture.imageUrl,
                synthetic: faceCapture.synthetic,
              },
            }
          : {}),
      }),
    ),
    units: example.units.map(
      ({
        id,
        code,
        name,
        category,
        imageUrl,
        material,
        color,
        priceCents,
      }) => ({
        id,
        code,
        name,
        category,
        imageUrl,
        material,
        color,
        priceCents,
      }),
    ),
    readyPairs,
  };
  if (!project) return catalog;

  // Canonical fallback is reserved for old fixture productions. A custom record
  // needs server-issued import lineage, matching source path and exact bytes.
  async function performerBinding(performer: Performer) {
    if (!performer.consent.granted) return null;
    const association = recordingSourceAssociation(
      project!,
      performer,
      "garment",
    );
    if (!association || !(await image(association.sourceImagePath)))
      return null;
    return {
      performerId: performer.id,
      libraryPerformerId: association.canonicalPerformerId,
    };
  }
  async function unitBinding(unit: PhysicalUnit) {
    if (!project!.fixture && !unit.librarySourceId) return null;
    const original = example.units.find(
      (item) => item.id === (unit.librarySourceId || unit.id),
    );
    if (
      !original ||
      unit.assetId ||
      unit.imageUrl !== original.imageUrl ||
      unit.category !== original.category ||
      !(await image(unit.imageUrl))
    )
      return null;
    return { unitId: unit.id, libraryUnitId: original.id };
  }
  const [performers, units] = await Promise.all([
    Promise.all(project.performers.map(performerBinding)),
    Promise.all(project.units.map(unitBinding)),
  ]);
  const bindings: LibraryProjectBindings = {
    revision: project.revision,
    performerBindings: performers.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    ),
    unitBindings: units.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    ),
  };
  catalog.project = bindings;
  if (!selected) return catalog;
  const performer = project.performers.find(
    (item) => item.id === selected.performerId,
  );
  const unit = project.units.find((item) => item.id === selected.unitId);
  if (!performer || !unit)
    throw new ApiError(
      404,
      "LIBRARY_SELECTION_NOT_FOUND",
      "Choose a performer and physical unit from this production.",
    );
  const category = selected.category || unit.category;
  const performerSource = bindings.performerBindings.find(
    (item) => item.performerId === performer.id,
  )?.libraryPerformerId;
  const unitSource = bindings.unitBindings.find(
    (item) => item.unitId === unit.id,
  )?.libraryUnitId;
  const recording =
    performerSource && unitSource
      ? await pair(project, performer, unit, category)
      : null;
  let reason: LibrarySelectionReason;
  let message: string;
  if (recording) {
    reason = "ready";
    message =
      "The selected current capture and garment reference have a verified recorded preview. Reuse it without a fresh generation.";
  } else if (!performer.consent.granted) {
    reason = "permission_required";
    message =
      "The selected current capture is not permitted for preview generation. Choose a permitted library pair below.";
  } else if (!recordingAssociation(project, performer, "garment", unit)) {
    reason = "unverified_lineage";
    message =
      "The selected current capture or garment reference is not bound to a verified library import. Choose a recorded-ready pair below.";
  } else if (!performerSource || !unitSource) {
    reason = "source_unavailable";
    message =
      "The selected current capture or garment reference could not be verified. Choose another recorded-ready pair below.";
  } else {
    reason = "no_recording";
    message =
      "There is no verified recording for the selected current capture, garment reference and category. Choose one of these recorded alternatives to continue without a fresh generation.";
  }
  const rank = (ready: LibraryReadyPair) =>
    ready.performerId === performerSource
      ? ready.category === category
        ? 0
        : 1
      : ready.unitId === unitSource
        ? 2
        : ready.category === category
          ? 3
          : 4;
  const suggestions: LibraryPairSuggestion[] = recording
    ? []
    : readyPairs
        .map((ready, index) => ({ ready, index }))
        .sort((a, b) => rank(a.ready) - rank(b.ready) || a.index - b.index)
        .slice(0, 4)
        .map(({ ready }) => {
          const samePerformer = ready.performerId === performerSource;
          const sameUnit = ready.unitId === unitSource;
          const projectPerformerId = samePerformer
            ? performer.id
            : bindings.performerBindings.find(
                (item) => item.libraryPerformerId === ready.performerId,
              )?.performerId;
          const projectUnitId = sameUnit
            ? unit.id
            : bindings.unitBindings.find(
                (item) => item.libraryUnitId === ready.unitId,
              )?.unitId;
          return {
            ...ready,
            change: samePerformer ? "garment" : sameUnit ? "performer" : "both",
            ...(projectPerformerId ? { projectPerformerId } : {}),
            ...(projectUnitId ? { projectUnitId } : {}),
          } satisfies LibraryPairSuggestion;
        });
  const selection: LibrarySelection = {
    ...selected,
    category,
    ready: Boolean(recording),
    reason,
    message,
    ...(recording ? { previewImageUrl: recording.imagePath } : {}),
    suggestions,
  };
  catalog.selection = selection;
  return catalog;
}
