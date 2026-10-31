import { eraseAssetObjects } from "@/lib/server/assets";
import { getPool } from "@/lib/server/db";
import { sleep } from "workflow";

async function eraseStep(projectId: string, subjectId?: string) {
  "use step";
  await eraseAssetObjects(projectId, subjectId);
}
eraseStep.maxRetries = 5;

async function finishErasureStep(projectId: string, subjectId?: string) {
  "use step";
  await eraseAssetObjects(projectId, subjectId);
  if (!subjectId)
    await getPool().query(
      "DELETE FROM sc_projects p WHERE p.id=$1 AND p.deleted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sc_upload_intents i WHERE i.project_id=p.id AND i.expires_at>now())",
      [projectId],
    );
}
finishErasureStep.maxRetries = 5;

export async function eraseProjectWorkflow(
  projectId: string,
  subjectId?: string,
) {
  "use workflow";
  await eraseStep(projectId, subjectId);
  // Existing scoped client tokens cannot be revoked at Blob. Remove any late
  // arrival after their original 15-minute deadline before dropping the ledger.
  await sleep("16m");
  await finishErasureStep(projectId, subjectId);
}
