import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { createPreviewJob, presentJob } from "@/lib/server/jobs";
import { dispatchPreview } from "@/lib/server/dispatch";
import { previewRequestSchema } from "@/lib/server/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const input = previewRequestSchema.parse(await readJson(request));
    const job = await createPreviewJob(
      ownerId,
      (await context.params).id,
      input,
    );
    if (job.mode === "live") await dispatchPreview(job.id);
    return json(
      { job: presentJob(job) },
      job.state === "succeeded" ? 200 : 202,
    );
  });
}
