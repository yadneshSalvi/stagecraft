import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { GarmentCategory } from "@/lib/types";
import { garmentCategory } from "./recipes";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-z0-9_-]{1,120}$/);
export const RecordingSchema = z
  .object({
    id,
    lookId: id,
    performerId: id,
    captureVersion: z.number().int().positive(),
    recipeRevision: z.number().int().positive(),
    unitIds: z.array(id).length(1),
    category: z.enum([
      "full_body",
      "upper_body",
      "lower_body",
      "shoes",
      "outerwear",
    ]),
    imagePath: z.string().regex(/^\/examples\/previews\/[a-z0-9-]+\.webp$/),
    sourceImagePath: z.string().regex(/^\/assets\/cast\/[a-z0-9-]+\.webp$/),
    garmentImagePath: z
      .string()
      .regex(/^\/assets\/garments\/[a-z0-9-]+\.webp$/),
    inputHash: sha,
    sourceSha256: sha,
    garmentSha256: sha,
    sourceUploadSha256: sha,
    garmentUploadSha256: sha,
    outputSha256: sha,
    operation: z.literal("ai_clothes_v4"),
    provider: z.literal("YouCam"),
    recordedAt: z.string().datetime(),
    estimatedUnits: z.literal(2),
    inspectionNotes: z.string().max(4000),
    taskEvidence: z
      .object({ taskIdHash: sha, status: z.literal("success") })
      .strict(),
    outputTransformation: z.literal("webp-reencode/q92;no-retouch"),
  })
  .strict();
export const RecordingManifestSchema = z
  .object({ version: z.literal(1), previews: z.array(RecordingSchema).max(50) })
  .strict();
export type Recording = z.infer<typeof RecordingSchema>;

export function clothesInputHash(
  sourceSha256: string,
  garmentSha256: string,
  category: GarmentCategory,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        operation: "ai_clothes_v4",
        sourceSha256,
        garmentSha256,
        garment_category: garmentCategory(category),
        change_shoes: false,
        filter_multi_person: "strict",
      }),
    )
    .digest("hex");
}

export async function recordedPreviews(): Promise<Recording[]> {
  try {
    const body = JSON.parse(
      await readFile(
        join(process.cwd(), "public/examples/recorded-previews.json"),
        "utf8",
      ),
    );
    const parsed = RecordingManifestSchema.safeParse(body);
    return parsed.success ? parsed.data.previews : [];
  } catch {
    return [];
  }
}

export async function matchRecording(input: {
  lookId: string;
  performerId: string;
  unitIds: string[];
  category: GarmentCategory;
  sourceSha256: string;
  garmentSha256: string;
}): Promise<Recording | null> {
  const inputHash = clothesInputHash(
    input.sourceSha256,
    input.garmentSha256,
    input.category,
  );
  for (const item of await recordedPreviews()) {
    if (
      item.lookId !== input.lookId ||
      item.performerId !== input.performerId ||
      item.unitIds.length !== input.unitIds.length ||
      item.unitIds.some((unit, index) => unit !== input.unitIds[index]) ||
      item.category !== input.category ||
      item.inputHash !== inputHash ||
      item.sourceUploadSha256 !== input.sourceSha256 ||
      item.garmentUploadSha256 !== input.garmentSha256
    )
      continue;
    const bytes = await readFile(
      join(process.cwd(), "public", item.imagePath),
    ).catch(() => null);
    if (
      !bytes ||
      createHash("sha256").update(bytes).digest("hex") !== item.outputSha256
    )
      continue;
    return item;
  }
  return null;
}
