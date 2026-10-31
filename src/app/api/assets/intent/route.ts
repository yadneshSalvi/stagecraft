import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { createUploadIntent } from "@/lib/server/assets";
import { handle, json, readJson } from "@/lib/server/http";
import { uploadIntentSchema } from "@/lib/server/validation";
import { rateLimit } from "@/lib/server/limits";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    await rateLimit(
      `upload-ip:${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}`,
      32,
      3600,
    );
    await rateLimit("upload-global", 200, 86400);
    return json(
      await createUploadIntent(
        ownerId,
        uploadIntentSchema.parse(await readJson(request)),
      ),
      201,
    );
  });
}
