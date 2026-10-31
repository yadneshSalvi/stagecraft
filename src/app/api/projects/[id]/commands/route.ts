import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { runCommand } from "@/lib/server/projects";
import { commandEnvelopeSchema } from "@/lib/server/validation";
import { dispatchErasure } from "@/lib/server/dispatch";
import { rateLimit } from "@/lib/server/limits";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    await rateLimit(`command:${ownerId}`, 120, 300);
    const { id } = await context.params;
    const input = commandEnvelopeSchema.parse(await readJson(request));
    const project = await runCommand(
      ownerId,
      id,
      input.expectedRevision,
      input.commandId,
      input.command,
    );
    if (
      input.command.type === "withdraw_consent" ||
      input.command.type === "withdraw_face_consent"
    )
      await dispatchErasure(id, input.command.performerId);
    return json({ project });
  });
}
