import "server-only";
import { start, getRun } from "workflow/api";
import { previewWorkflow } from "@/workflows/preview";
import { eraseProjectWorkflow } from "@/workflows/erase-project";
import { getPool } from "./db";
import { getInternalJob, terminalJob, failJob } from "./jobs";

export async function dispatchPreview(jobId: string, recover = false) {
  let job = await getInternalJob(jobId);
  if (!job || job.mode !== "live" || terminalJob(job)) return;
  if (recover && job.workflow_run_id) {
    try {
      const run = getRun(job.workflow_run_id);
      if (await run.exists) {
        const status = await run.status;
        if (!["failed", "cancelled", "completed"].includes(status)) return;
      }
      if (job.submission_started_at && !job.provider_task_id) {
        await failJob(
          jobId,
          "unknown_submission",
          "The provider may have received this request. No second task will be sent automatically.",
          true,
        );
        return;
      }
      await getPool().query(
        "UPDATE sc_jobs SET workflow_run_id=NULL,dispatch_started_at=NULL WHERE id=$1 AND workflow_run_id=$2",
        [jobId, job.workflow_run_id],
      );
      job = (await getInternalJob(jobId))!;
    } catch {
      return;
    }
  }
  if (job.workflow_run_id) return;
  const claim = await getPool().query(
    "UPDATE sc_jobs SET dispatch_started_at=now() WHERE id=$1 AND workflow_run_id IS NULL AND (dispatch_started_at IS NULL OR dispatch_started_at<now()-interval '90 seconds') AND NOT cancel_requested AND state NOT IN ('succeeded','failed','cancelled','ambiguous') RETURNING id",
    [jobId],
  );
  if (!claim.rowCount) return;
  try {
    const run = await start(previewWorkflow, [jobId]);
    await getPool().query(
      "UPDATE sc_jobs SET workflow_run_id=COALESCE(workflow_run_id,$2) WHERE id=$1",
      [jobId, run.runId],
    );
  } catch {
    // A duplicate run competes for DB ownership; the paid POST has its own guard.
    await getPool().query(
      "UPDATE sc_jobs SET message='The preview worker could not connect. This saved attempt can be resumed safely.',updated_at=now() WHERE id=$1 AND workflow_run_id IS NULL AND state='queued'",
      [jobId],
    );
  }
}

export async function dispatchErasure(projectId: string, subjectId?: string) {
  try {
    await start(eraseProjectWorkflow, [projectId, subjectId]);
  } catch {
    console.error("[cleanup] dispatch_deferred");
  }
}
