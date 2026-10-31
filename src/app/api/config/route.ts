import type { AppConfig } from "@/lib/types";
import { recordedDetailPreviews } from "@/lib/youcam/recorded-details";
import { freshPreviewAvailability } from "@/lib/server/preview-budget";
import { databaseConfigured } from "@/lib/server/db";
import { storageConfigured } from "@/lib/server/assets";
import { youcamConfigured } from "@/lib/youcam";
import { recordedPreviews } from "@/lib/youcam/recorded";
import { recordedBeautyPreviews } from "@/lib/youcam/recorded-beauty";
import {
  dailyJobLimit,
  ownerDailyJobLimit,
  generationPaused,
  rateLimit,
} from "@/lib/server/limits";
import { handle, json } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    if (databaseConfigured())
      await rateLimit(
        `config:${request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"}`,
        120,
        300,
      );
    const details = await recordedDetailPreviews();
    const config: AppConfig = {
      database: databaseConfigured(),
      storage: storageConfigured(),
      youcam: youcamConfigured(),
      extraction: Boolean(
        (process.env.GEMINI_API_KEY && process.env.AI_MODEL_GEMINI) ||
        (process.env.OPENAI_API_KEY && process.env.AI_MODEL_OPENAI),
      ),
      generationPaused: generationPaused(),
      freshPreviewAvailability: await freshPreviewAvailability(),
      dailyJobLimit: dailyJobLimit(),
      ownerDailyJobLimit: ownerDailyJobLimit(),
      recordedPreviews: (await recordedPreviews()).length,
      recordedBeautyPreviews: (await recordedBeautyPreviews()).length,
      recordedDetailPreviews: {
        hair_color: details.filter((item) => item.kind === "hair_color").length,
        necklace: details.filter((item) => item.kind === "necklace").length,
      },
    };
    return json(config);
  });
}
