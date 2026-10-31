import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { BeautyRecipe } from "@/lib/types";
import {
  BeautyRecipeSchema,
  MakeupEffectsSchema,
  makeBeautyEffects,
} from "./beauty";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-z0-9_-]{1,120}$/);
export const BeautyRecordingSchema = z
  .object({
    id,
    lookId: id,
    performerId: id,
    faceCaptureVersion: z.number().int().positive(),
    beautyRevision: z.number().int().positive(),
    recipe: BeautyRecipeSchema,
    effects: MakeupEffectsSchema,
    imagePath: z.string().regex(/^\/examples\/beauty\/[a-z0-9-]+\.webp$/),
    sourceImagePath: z
      .string()
      .regex(/^\/assets\/cast\/(?:ada|celeste)-face\.webp$/),
    inputHash: sha,
    sourceSha256: sha,
    sourceUploadSha256: sha,
    outputSha256: sha,
    operation: z.literal("makeup_vto_v1"),
    provider: z.literal("YouCam"),
    recordedAt: z.string().datetime(),
    estimatedUnits: z.literal(1),
    inspectionNotes: z.string().max(4000),
    taskEvidence: z
      .object({ taskIdHash: sha, status: z.literal("success") })
      .strict(),
    outputTransformation: z.literal("webp-reencode/q92;no-retouch"),
  })
  .strict();
export const BeautyRecordingManifestSchema = z
  .object({
    version: z.literal(1),
    previews: z.array(BeautyRecordingSchema).max(20),
  })
  .strict();
export type BeautyRecording = z.infer<typeof BeautyRecordingSchema>;

export function beautyProviderInputHash(
  sourceSha256: string,
  recipe: BeautyRecipe,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        operation: "makeup_vto_v1",
        sourceSha256,
        version: "1.0",
        effects: makeBeautyEffects(recipe),
      }),
    )
    .digest("hex");
}
export async function recordedBeautyPreviews(): Promise<BeautyRecording[]> {
  try {
    const parsed = BeautyRecordingManifestSchema.safeParse(
      JSON.parse(
        await readFile(
          join(process.cwd(), "public/examples/recorded-beauty-previews.json"),
          "utf8",
        ),
      ),
    );
    return parsed.success ? parsed.data.previews : [];
  } catch {
    return [];
  }
}
export async function matchBeautyRecording(input: {
  lookId: string;
  performerId: string;
  sourceSha256: string;
  recipe: BeautyRecipe;
}): Promise<BeautyRecording | null> {
  const inputHash = beautyProviderInputHash(input.sourceSha256, input.recipe);
  for (const item of await recordedBeautyPreviews()) {
    if (
      item.lookId !== input.lookId ||
      item.performerId !== input.performerId ||
      item.sourceUploadSha256 !== input.sourceSha256 ||
      item.inputHash !== inputHash ||
      beautyProviderInputHash(item.sourceUploadSha256, item.recipe) !==
        item.inputHash ||
      JSON.stringify(item.effects) !==
        JSON.stringify(makeBeautyEffects(item.recipe))
    )
      continue;
    const bytes = await readFile(
      join(process.cwd(), "public", item.imagePath),
    ).catch(() => null);
    if (
      bytes &&
      createHash("sha256").update(bytes).digest("hex") === item.outputSha256
    )
      return item;
  }
  return null;
}
