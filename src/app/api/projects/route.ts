import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/projects";
import { createProjectSchema } from "@/lib/server/validation";
import { rateLimit } from "@/lib/server/limits";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    await rateLimit(`read:${ownerId}`, 180, 300);
    return json({ projects: await listProjects(ownerId) });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const ownerId = await requireOwner(request);
    const input = createProjectSchema.parse(await readJson(request));
    return json(
      { project: await createProject(ownerId, input.mode, input.title) },
      201,
    );
  });
}
