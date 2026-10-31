import { requireOwner } from "@/lib/server/auth";
import { ownedScriptDraft } from "@/lib/server/script-extraction";
import { handle, json } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/limits";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; draftId: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`read:${ownerId}`, 180, 300);
    const { id, draftId } = await context.params;
    return json({ draft: await ownedScriptDraft(ownerId, id, draftId) });
  });
}
