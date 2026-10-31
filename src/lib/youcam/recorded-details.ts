import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sha256Bytes } from "@/lib/server/images";
import type { DetailRecipe } from "@/lib/types";
import type { VerifiedRecordingAssociation } from "@/lib/server/recording-associations";
import { DetailRecipeSchema, detailProviderInputHash } from "./details";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-z0-9_-]{1,120}$/);
export const DetailRecordingSchema = z
  .object({
    id,
    lookId: id,
    performerId: id,
    kind: z.enum(["hair_color", "necklace"]),
    faceCaptureVersion: z.number().int().positive(),
    detailRevision: z.number().int().positive(),
    recipe: DetailRecipeSchema,
    imagePath: z.string().regex(/^\/examples\/details\/[a-z0-9-]+\.webp$/),
    sourceImagePath: z
      .string()
      .regex(/^\/assets\/cast\/(?:ada|celeste|mina)-face\.webp$/),
    referenceImagePath: z
      .string()
      .regex(/^\/assets\/accessories\/brass-pendant\.webp$/)
      .optional(),
    sourceSha256: sha,
    sourceUploadSha256: sha,
    referenceSha256: sha.optional(),
    referenceUploadSha256: sha.optional(),
    inputHash: sha,
    outputSha256: sha,
    operation: z.enum(["hair_color_v2", "necklace_v2"]),
    provider: z.literal("YouCam"),
    recordedAt: z.string().datetime(),
    estimatedUnits: z.literal(1),
    inspectionNotes: z.string().max(4000),
    taskEvidence: z
      .object({ taskIdHash: sha, status: z.literal("success") })
      .strict(),
    outputTransformation: z.literal("webp-reencode/q92;no-retouch"),
  })
  .strict()
  .superRefine((item, context) => {
    if (
      item.kind !== item.recipe.kind ||
      (item.kind === "necklace" &&
        (!item.referenceImagePath ||
          !item.referenceSha256 ||
          !item.referenceUploadSha256)) ||
      item.operation !==
        (item.kind === "hair_color" ? "hair_color_v2" : "necklace_v2")
    )
      context.addIssue({
        code: "custom",
        message: "Detail recording lineage is incomplete.",
      });
  });
export const DetailRecordingManifestSchema = z
  .object({
    version: z.literal(1),
    previews: z.array(DetailRecordingSchema).max(30),
  })
  .strict();
export type DetailRecording = z.infer<typeof DetailRecordingSchema>;
export async function recordedDetailPreviews(): Promise<DetailRecording[]> {
  try {
    return DetailRecordingManifestSchema.parse(
      JSON.parse(
        await readFile(
          join(process.cwd(), "public/examples/recorded-detail-previews.json"),
          "utf8",
        ),
      ),
    ).previews;
  } catch {
    return [];
  }
}
export async function matchDetailRecording(input: {
  kind: "hair_color" | "necklace";
  performerId: string;
  sourceSha256: string;
  recipe: DetailRecipe;
  referenceSha256?: string;
  association?: VerifiedRecordingAssociation;
}): Promise<DetailRecording | null> {
  const inputHash = detailProviderInputHash(
    input.sourceSha256,
    input.recipe,
    input.referenceSha256,
  );
  for (const item of await recordedDetailPreviews()) {
    const identity =
      item.performerId === input.performerId ||
      (input.association &&
        item.performerId === input.association.canonicalPerformerId &&
        item.sourceImagePath === input.association.sourceImagePath);
    if (
      item.kind !== input.kind ||
      !identity ||
      item.sourceUploadSha256 !== input.sourceSha256 ||
      item.inputHash !== inputHash ||
      detailProviderInputHash(
        item.sourceUploadSha256,
        item.recipe,
        item.referenceUploadSha256,
      ) !== inputHash
    )
      continue;
    const bytes = await readFile(
      join(process.cwd(), "public", item.imagePath),
    ).catch(() => null);
    if (bytes && sha256Bytes(bytes) === item.outputSha256) return item;
  }
  return null;
}
