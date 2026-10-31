import { createHash } from "node:crypto";
import { z } from "zod";
import type { DetailRecipe } from "@/lib/types";
const file = z.string().min(1).max(2048);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const HairColorRecipeSchema = z
  .object({
    kind: z.literal("hair_color"),
    preset: z.enum([
      "Jet Black",
      "Chocolate Brown",
      "Honey Blonde",
      "Platinum Blonde",
      "Ash Gray",
      "Rose Gold",
      "Burgundy",
      "Copper Red",
      "Lavender",
      "Teal Blue",
    ]),
  })
  .strict();
export const NecklaceRecipeSchema = z
  .object({
    kind: z.literal("necklace"),
    referenceId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9_-]+$/),
    removeBackground: z.boolean(),
  })
  .strict();
export const DetailRecipeSchema = z.discriminatedUnion("kind", [
  HairColorRecipeSchema,
  NecklaceRecipeSchema,
]);
export const HairColorInputSchema = z
  .object({ src_file_id: file, preset: HairColorRecipeSchema.shape.preset })
  .strict();
export function hairColorPayload(sourceFileId: string, recipe: DetailRecipe) {
  const validated = HairColorRecipeSchema.parse(recipe);
  return HairColorInputSchema.parse({
    src_file_id: sourceFileId,
    preset: validated.preset,
  });
}
const necklaceParameter = z
  .object({
    necklace_need_remove_background: z.boolean(),
    necklace_shadow_intensity: z.literal(0.15),
    necklace_ambient_light_intensity: z.literal(1),
  })
  .strict();
export const NecklaceInputSchema = z
  .object({
    src_file_id: file,
    ref_file_ids: z.array(file).length(1),
    source_info: z.object({ name: file }).strict(),
    object_infos: z
      .array(z.object({ name: file, parameter: necklaceParameter }).strict())
      .length(1),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.src_file_id !== input.source_info.name ||
      input.ref_file_ids[0] !== input.object_infos[0].name
    )
      context.addIssue({
        code: "custom",
        message: "Necklace file identities must match.",
      });
  });
export function necklacePayload(
  sourceFileId: string,
  referenceFileId: string,
  recipe: DetailRecipe,
) {
  const validated = NecklaceRecipeSchema.parse(recipe);
  return NecklaceInputSchema.parse({
    src_file_id: sourceFileId,
    ref_file_ids: [referenceFileId],
    source_info: { name: sourceFileId },
    object_infos: [
      {
        name: referenceFileId,
        parameter: {
          necklace_need_remove_background: validated.removeBackground,
          necklace_shadow_intensity: 0.15,
          necklace_ambient_light_intensity: 1,
        },
      },
    ],
  });
}
/** Physical reference IDs and working revisions do not change provider pixels. */
export function detailProviderInputHash(
  sourceSha256: string,
  recipe: DetailRecipe,
  referenceSha256?: string,
) {
  const validated = DetailRecipeSchema.parse(recipe);
  const input =
    validated.kind === "hair_color"
      ? {
          operation: "hair-color",
          sourceSha256: sha.parse(sourceSha256),
          preset: validated.preset,
        }
      : {
          operation: "necklace",
          sourceSha256: sha.parse(sourceSha256),
          referenceSha256: sha.parse(referenceSha256),
          removeBackground: validated.removeBackground,
          shadowIntensity: 0.15,
          ambientLightIntensity: 1,
        };
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
