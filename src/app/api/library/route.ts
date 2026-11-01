import { requireOwner } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/limits";
import { handle, json } from "@/lib/server/http";
import { libraryCatalog, LibraryQuerySchema } from "@/lib/server/library";
import { ownedProject } from "@/lib/server/projects";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    const owner = await requireOwner(request);
    await rateLimit(`library:${owner}`, 120, 300);
    const query = LibraryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const project = query.projectId
      ? await ownedProject(owner, query.projectId)
      : undefined;
    return json(
      await libraryCatalog(
        project,
        query.performerId && query.unitId
          ? {
              performerId: query.performerId,
              unitId: query.unitId,
              category: query.category,
            }
          : undefined,
      ),
    );
  });
}
