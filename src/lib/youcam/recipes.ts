import type { GarmentCategory } from "@/lib/types";
import { ClothesInputSchema } from "./schemas";

export const garmentCategory = (category: GarmentCategory) =>
  category === "outerwear" ? ("outer" as const) : category;
export function clothesPayload(
  sourceFileId: string,
  garmentFileId: string,
  category: GarmentCategory,
) {
  return ClothesInputSchema.parse({
    src_file_id: sourceFileId,
    ref_file_id: garmentFileId,
    garment_category: garmentCategory(category),
    change_shoes: false,
    filter_multi_person: "strict",
  });
}

/** This is a separate detail view; Clothes V4 does not render makeup notes. */
export function unretouchedMakeupEffects() {
  return [
    {
      category: "skin_smooth" as const,
      skinSmoothStrength: 0,
      skinSmoothColorIntensity: 0,
    },
  ];
}
