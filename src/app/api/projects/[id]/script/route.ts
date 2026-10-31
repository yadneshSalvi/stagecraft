import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { createScriptDraft } from "@/lib/server/script-extraction";
import { handle, json, readJson } from "@/lib/server/http";
import { scriptRequestSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const input = scriptRequestSchema.parse(await readJson(request, 262144));
    return json(
      {
        draft: await createScriptDraft(
          ownerId,
          (await context.params).id,
          input,
        ),
      },
      201,
    );
  });
}
