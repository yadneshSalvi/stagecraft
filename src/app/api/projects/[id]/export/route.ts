import { z } from "zod";
import { requireOwner } from "@/lib/server/auth";
import { exportProject } from "@/lib/server/projects";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/limits";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`export:${ownerId}`, 8, 3600);
    const exportedBy = z
      .string()
      .trim()
      .min(1)
      .max(120)
      .parse(new URL(request.url).searchParams.get("owner"));
    const data = await exportProject(
      ownerId,
      (await context.params).id,
      exportedBy,
    );
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="stagecraft-production-r${data.currentRevision}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
