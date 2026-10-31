import { requireOwner } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { ownedProject } from "@/lib/server/projects";
import { getPool } from "@/lib/server/db";
import { presentJob, type ProviderJob } from "@/lib/server/jobs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    await ownedProject(ownerId, id);
    const result = await getPool().query<ProviderJob>(
      "SELECT * FROM sc_jobs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20",
      [id],
    );
    return json({ jobs: result.rows.map(presentJob) });
  });
}
