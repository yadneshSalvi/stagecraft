import { requireOwner } from "@/lib/server/auth";
import { assetResponse } from "@/lib/server/assets";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/limits";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`asset-read:${ownerId}`, 180, 300);
    return assetResponse(ownerId, (await context.params).id);
  });
}
