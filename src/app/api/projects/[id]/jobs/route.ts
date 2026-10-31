import { requireOwner } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { ownedProject } from "@/lib/server/projects";
import { getPool } from "@/lib/server/db";
import { presentJob, type ProviderJob } from "@/lib/server/jobs";
import { ApiError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    await ownedProject(ownerId, id);
    const commandId = new URL(request.url).searchParams.get("commandId");
    if (commandId !== null) {
      if (!commandId || commandId.length > 128)
        throw new ApiError(
          400,
          "INVALID_INPUT",
          "Choose a valid saved preview request.",
        );
      const found = await getPool().query<ProviderJob>(
        "SELECT * FROM sc_jobs WHERE project_id=$1 AND owner_id=$2 AND command_id=$3",
        [id, ownerId, commandId],
      );
      return json({ job: found.rows[0] ? presentJob(found.rows[0]) : null });
    }
    const result = await getPool().query<ProviderJob>(
      "SELECT * FROM sc_jobs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20",
      [id],
    );
    return json({ jobs: result.rows.map(presentJob) });
  });
}
