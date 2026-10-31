import { requireOwner } from "@/lib/server/auth";
import { ownedRevision } from "@/lib/server/projects";
import { handle, json } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/limits";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; revision: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`revision-read:${ownerId}`, 120, 300);
    const { id, revision } = await context.params;
    const result = await ownedRevision(
      ownerId,
      id,
      /^\d{1,3}$/.test(revision) ? Number(revision) : NaN,
    );
    if (new URL(request.url).searchParams.get("download") === "1")
      return new Response(result.text, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="stagecraft-revision-${Number(revision)}.json"`,
          "X-Snapshot-SHA256": result.sha256,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return json({
      project: JSON.parse(result.text),
      currentRevision: result.currentRevision,
      historical: true,
      snapshotSha256: result.sha256,
    });
  });
}
