import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { finalizeUpload } from "@/lib/server/assets";
import { handle, json, readJson } from "@/lib/server/http";
import { finalizeSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    return json(
      await finalizeUpload(
        ownerId,
        finalizeSchema.parse(await readJson(request)),
      ),
    );
  });
}
