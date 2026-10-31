import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { ownedJob, presentJob, cancelJob } from "@/lib/server/jobs";
import { dispatchPreview } from "@/lib/server/dispatch";
import { rateLimit } from "@/lib/server/limits";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`poll:${ownerId}`, 120, 300);
    const job = await ownedJob(ownerId, (await context.params).id);
    if (Date.now() - new Date(job.updated_at).getTime() > 90_000)
      await dispatchPreview(job.id, true);
    return json({ job: presentJob(await ownedJob(ownerId, job.id)) });
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const job = await ownedJob(ownerId, (await context.params).id);
    await cancelJob(job.id);
    return json({ job: presentJob(await ownedJob(ownerId, job.id)) });
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    await rateLimit(`resume:${ownerId}`, 8, 300);
    const job = await ownedJob(ownerId, (await context.params).id);
    await dispatchPreview(job.id, true);
    return json({ job: presentJob(await ownedJob(ownerId, job.id)) }, 202);
  });
}
