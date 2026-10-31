import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { deleteProject, ownedProject } from "@/lib/server/projects";
import { dispatchErasure } from "@/lib/server/dispatch";
import { rateLimit } from "@/lib/server/limits";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`read:${ownerId}`, 180, 300);
    return json({
      project: await ownedProject(ownerId, (await context.params).id),
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    await deleteProject(ownerId, id);
    await dispatchErasure(id);
    return json({ deleted: true }, 202);
  });
}
