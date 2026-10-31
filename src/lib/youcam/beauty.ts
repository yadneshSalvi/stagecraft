import { z } from "zod";
import type { BeautyRecipe } from "@/lib/types";

const percent = z.number().int().min(0).max(100);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const BeautyRecipeSchema = z
  .object({
    lipColor: color,
    lipIntensity: percent,
    blushColor: color,
    blushIntensity: percent,
  })
  .strict();
export const MakeupEffectSchema = z.discriminatedUnion("category", [
  z
    .object({
      category: z.literal("skin_smooth"),
      skinSmoothStrength: z.literal(0),
      skinSmoothColorIntensity: z.literal(0),
    })
    .strict(),
  z
    .object({
      category: z.literal("blush"),
      pattern: z.object({ name: z.literal("1color1") }).strict(),
      palettes: z
        .array(
          z
            .object({
              color,
              texture: z.literal("matte"),
              colorIntensity: percent,
            })
            .strict(),
        )
        .length(1),
    })
    .strict(),
  z
    .object({
      category: z.literal("lip_color"),
      shape: z.object({ name: z.literal("original") }).strict(),
      morphology: z
        .object({ fullness: z.literal(0), wrinkless: z.literal(0) })
        .strict(),
      style: z.object({ type: z.literal("full") }).strict(),
      palettes: z
        .array(
          z
            .object({
              color,
              texture: z.literal("matte"),
              colorIntensity: percent,
            })
            .strict(),
        )
        .length(1),
    })
    .strict(),
]);
export const MakeupEffectsSchema = z
  .array(MakeupEffectSchema)
  .length(3)
  .superRefine((effects, context) => {
    for (const category of ["skin_smooth", "blush", "lip_color"] as const)
      if (effects.filter((effect) => effect.category === category).length !== 1)
        context.addIssue({
          code: "custom",
          message: `Exactly one ${category} effect is required.`,
        });
  });
export type MakeupEffect = z.infer<typeof MakeupEffectSchema>;

/** Supported official V1.0 subset: no skin smoothing or lip morphology changes. */
export function makeBeautyEffects(input: BeautyRecipe): MakeupEffect[] {
  const recipe = BeautyRecipeSchema.parse(input);
  return MakeupEffectsSchema.parse([
    {
      category: "skin_smooth",
      skinSmoothStrength: 0,
      skinSmoothColorIntensity: 0,
    },
    {
      category: "blush",
      pattern: { name: "1color1" },
      palettes: [
        {
          color: recipe.blushColor.toUpperCase(),
          texture: "matte",
          colorIntensity: recipe.blushIntensity,
        },
      ],
    },
    {
      category: "lip_color",
      shape: { name: "original" },
      morphology: { fullness: 0, wrinkless: 0 },
      style: { type: "full" },
      palettes: [
        {
          color: recipe.lipColor.toUpperCase(),
          texture: "matte",
          colorIntensity: recipe.lipIntensity,
        },
      ],
    },
  ]);
}

export const MakeupInputSchema = z
  .object({
    src_file_id: z.string().min(1).max(2048),
    version: z.literal("1.0"),
    effects: MakeupEffectsSchema,
  })
  .strict();
export function makeupPayload(sourceFileId: string, recipe: BeautyRecipe) {
  return MakeupInputSchema.parse({
    src_file_id: sourceFileId,
    version: "1.0",
    effects: makeBeautyEffects(recipe),
  });
}
