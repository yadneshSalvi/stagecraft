import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { adoptScriptDraft } from "@/lib/server/script-extraction";
import { handle, json, readJson } from "@/lib/server/http";
import { scriptAdoptSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const input = scriptAdoptSchema.parse(await readJson(request));
    return json({
      project: await adoptScriptDraft(
        ownerId,
        (await context.params).id,
        input,
      ),
    });
  });
}
