import "server-only";
import { createExampleProduction } from "@/lib/domain";
import type { Production } from "@/lib/types";
export interface VerifiedRecordingAssociation {
  canonicalPerformerId: string;
  sourceImagePath: string;
  referenceImagePath?: string;
}
let catalog: Production | undefined;
/** Only explicit library lineage or the canonical fixture entity can alias IDs.
 * Callers additionally verify frozen transport hashes before matching a task. */
export function recordingAssociation(
  production: Production,
  performer: Production["performers"][number],
  profile: "garment" | "face",
  unit?: Production["units"][number],
): VerifiedRecordingAssociation | undefined {
  catalog ||= createExampleProduction("recording-library");
  const importedSource =
    profile === "face"
      ? performer.faceCapture?.librarySourceId || performer.librarySourceId
      : performer.librarySourceId;
  if (!production.fixture && !importedSource) return undefined;
  const sourceKey = importedSource || performer.id;
  const original = catalog.performers.find(
    (item) =>
      item.id === sourceKey ||
      (profile === "face" && item.faceCapture?.librarySourceId === sourceKey),
  );
  const source = profile === "face" ? performer.faceCapture : performer;
  const originalSource = profile === "face" ? original?.faceCapture : original;
  if (
    !original ||
    !source?.synthetic ||
    source.assetId ||
    !source.imageUrl ||
    source.imageUrl !== originalSource?.imageUrl
  )
    return undefined;
  let referenceImagePath: string | undefined;
  if (profile === "garment") {
    if (!production.fixture && !unit?.librarySourceId) return undefined;
    const originalUnit =
      unit &&
      catalog.units.find(
        (item) => item.id === (unit.librarySourceId || unit.id),
      );
    if (
      !unit ||
      !originalUnit ||
      unit.assetId ||
      !unit.imageUrl ||
      unit.imageUrl !== originalUnit.imageUrl ||
      unit.category !== originalUnit.category
    )
      return undefined;
    referenceImagePath = unit.imageUrl;
  }
  return {
    canonicalPerformerId: original.id,
    sourceImagePath: source.imageUrl,
    ...(referenceImagePath ? { referenceImagePath } : {}),
  };
}
