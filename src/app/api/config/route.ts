import type { AppConfig } from "@/lib/types";
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
    const config: AppConfig = {
      database: databaseConfigured(),
      storage: storageConfigured(),
      youcam: youcamConfigured(),
      extraction: Boolean(
        (process.env.GEMINI_API_KEY && process.env.AI_MODEL_GEMINI) ||
        (process.env.OPENAI_API_KEY && process.env.AI_MODEL_OPENAI),
      ),
      generationPaused: generationPaused(),
      dailyJobLimit: dailyJobLimit(),
      ownerDailyJobLimit: ownerDailyJobLimit(),
      recordedPreviews: (await recordedPreviews()).length,
      recordedBeautyPreviews: (await recordedBeautyPreviews()).length,
    };
    return json(config);
  });
}
