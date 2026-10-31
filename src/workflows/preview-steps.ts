import { RetryableError } from "workflow";
import { del, put } from "@vercel/blob";
import {
  registerFile,
  uploadRegisteredFile,
  submitClothesTask,
  getClothesTask,
  submitMakeupTask,
  getMakeupTask,
  downloadOutput,
  YouCamError,
  type RegisteredFile,
} from "@/lib/youcam";
import { getPool, transaction } from "@/lib/server/db";
import {
  getInternalJob,
  terminalJob,
  jobMatchesProject,
  cancelJob,
  failJob,
  interruptedJob,
  completeLiveJob,
  type ProviderJob,
} from "@/lib/server/jobs";
import {
  readInputImage,
  normalizePhoto,
  readLimited,
  storagePrefix,
} from "@/lib/server/assets";
import { ownedProject } from "@/lib/server/projects";
import { takeProviderRequest, generationPaused } from "@/lib/server/limits";
import { ApiError } from "@/lib/server/errors";

async function usable(job: ProviderJob) {
  if (job.cancel_requested || terminalJob(job)) return false;
  try {
    return jobMatchesProject(
      await ownedProject(job.owner_id, job.project_id),
      job,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}
export async function bindRunStep(
  jobId: string,
  runId: string,
): Promise<boolean> {
  "use step";
  const result = await getPool().query(
    "UPDATE sc_jobs SET workflow_run_id=$2 WHERE id=$1 AND (workflow_run_id IS NULL OR workflow_run_id=$2) AND NOT cancel_requested AND state NOT IN ('succeeded','failed','cancelled','ambiguous') RETURNING id",
    [jobId, runId],
  );
  return Boolean(result.rowCount);
}

export async function prepareFilesStep(jobId: string): Promise<boolean> {
  "use step";
  const job = await getInternalJob(jobId);
  if (!job || !(await usable(job))) {
    if (job && !terminalJob(job)) await cancelJob(jobId);
    return false;
  }
  if (job.provider_task_id) return true;
  await getPool().query(
    "UPDATE sc_jobs SET state='preparing',message='Preparing the permitted source files.',updated_at=now() WHERE id=$1",
    [jobId],
  );
  try {
    const roles: ("source" | "garment")[] =
      job.input.kind === "beauty" ? ["source"] : ["source", "garment"];
    for (const role of roles) {
      await getPool().query(
        "INSERT INTO sc_provider_files(job_id,role,state) VALUES($1,$2,'intent') ON CONFLICT DO NOTHING",
        [jobId, role],
      );
      const rows = await getPool().query<{
        state: string;
        file_id: string | null;
        upload_request: RegisteredFile["request"] | null;
      }>("SELECT * FROM sc_provider_files WHERE job_id=$1 AND role=$2", [
        jobId,
        role,
      ]);
      let file = rows.rows[0];
      if (file.state === "uploaded" && file.file_id) continue;
      const reference =
        role === "source"
          ? job.input.source
          : job.input.kind !== "beauty"
            ? job.input.garment
            : null;
      if (!reference)
        throw new ApiError(
          422,
          "SOURCE_UNAVAILABLE",
          "This preview's source is unavailable.",
        );
      const input = await readInputImage(
        job.owner_id,
        reference,
        job.input.kind === "beauty" ? "face" : "garment",
      );
      const latest = await getInternalJob(jobId);
      if (
        input.sha256 !== reference.sha256 ||
        !latest ||
        !(await usable(latest))
      ) {
        await cancelJob(jobId);
        return false;
      }
      if (!file.file_id || !file.upload_request) {
        if (!(await takeProviderRequest()))
          throw new RetryableError("Provider request window is busy", {
            retryAfter: "1m",
          });
        await getPool().query(
          "UPDATE sc_provider_files SET registration_started_at=now(),updated_at=now() WHERE job_id=$1 AND role=$2",
          [jobId, role],
        );
        const registered = await registerFile({
          contentType: "image/jpeg",
          byteLength: input.bytes.length,
          fileName: `stagecraft-${role}.jpg`,
        });
        await getPool().query(
          "UPDATE sc_provider_files SET file_id=$3,upload_request=$4,state='registered',updated_at=now() WHERE job_id=$1 AND role=$2",
          [jobId, role, registered.fileId, registered.request],
        );
        file = {
          state: "registered",
          file_id: registered.fileId,
          upload_request: registered.request,
        };
      }
      await getPool().query(
        "UPDATE sc_provider_files SET state='uploading',updated_at=now() WHERE job_id=$1 AND role=$2",
        [jobId, role],
      );
      await uploadRegisteredFile(
        { fileId: file.file_id!, request: file.upload_request! },
        input.bytes,
      );
      await getPool().query(
        "UPDATE sc_provider_files SET state='uploaded',updated_at=now() WHERE job_id=$1 AND role=$2",
        [jobId, role],
      );
    }
    return true;
  } catch (error) {
    if (error instanceof RetryableError) throw error;
    if (error instanceof YouCamError && error.retryable)
      throw new RetryableError(error.message, { retryAfter: "30s" });
    await failJob(
      jobId,
      error instanceof YouCamError ? error.code : "source_unavailable",
      "The required source image could not be prepared. No paid preview task was submitted.",
    );
    return false;
  }
}
prepareFilesStep.maxRetries = 2;

export async function submitPreviewStep(jobId: string): Promise<boolean> {
  "use step";
  const initial = await getInternalJob(jobId);
  if (!initial) return false;
  if (generationPaused() && !initial.provider_task_id) {
    await failJob(
      jobId,
      "generation_paused",
      "New paid submissions are paused. Your production and prepared source files are saved.",
    );
    return false;
  }
  if (!(await takeProviderRequest()))
    throw new RetryableError("Provider request window is busy", {
      retryAfter: "1m",
    });
  const prepared = await transaction(async (client) => {
    let project;
    try {
      project = await ownedProject(
        initial.owner_id,
        initial.project_id,
        client,
        true,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        return { kind: "cancelled" as const };
      throw error;
    }
    const job = await getInternalJob(jobId, client, true);
    if (!job || job.cancel_requested || terminalJob(job))
      return { kind: "cancelled" as const };
    if (!jobMatchesProject(project, job)) {
      await cancelJob(jobId, client);
      return { kind: "cancelled" as const };
    }
    if (job.provider_task_id) return { kind: "submitted" as const };
    if (job.submission_started_at) return { kind: "ambiguous" as const };
    const files = await client.query<{ role: string; file_id: string }>(
      "SELECT role,file_id FROM sc_provider_files WHERE job_id=$1 AND state='uploaded'",
      [jobId],
    );
    if (files.rows.length !== (job.input.kind === "beauty" ? 1 : 2))
      return { kind: "missing" as const };
    await client.query(
      "UPDATE sc_jobs SET submission_started_at=now(),state='submitting',message=$2,updated_at=now() WHERE id=$1",
      [
        jobId,
        job.input.kind === "beauty"
          ? "Sending one reserved Makeup VTO task to YouCam."
          : "Sending one reserved Clothes V4 task to YouCam.",
      ],
    );
    if (job.input.kind === "beauty")
      return {
        kind: "ready" as const,
        operation: "beauty" as const,
        sourceFileId: files.rows[0].file_id,
        recipe: job.input.recipe,
      };
    return {
      kind: "ready" as const,
      operation: "garment" as const,
      sourceFileId: files.rows.find((file) => file.role === "source")!.file_id,
      garmentFileId: files.rows.find((file) => file.role === "garment")!
        .file_id,
      category: job.input.category,
    };
  });
  if (prepared.kind === "submitted") return true;
  if (prepared.kind === "cancelled") return false;
  if (prepared.kind === "ambiguous") {
    await failJob(
      jobId,
      "unknown_submission",
      "The provider may have received this request. No repeat task will be submitted automatically.",
      true,
    );
    return false;
  }
  if (prepared.kind === "missing") {
    await failJob(
      jobId,
      "files_unavailable",
      "The prepared source files are unavailable. No paid task was submitted.",
    );
    return false;
  }
  try {
    const task =
      prepared.operation === "beauty"
        ? await submitMakeupTask({
            sourceFileId: prepared.sourceFileId,
            recipe: prepared.recipe,
          })
        : await submitClothesTask(prepared);
    const result = await getPool().query<ProviderJob>(
      "UPDATE sc_jobs SET provider_task_id=COALESCE(provider_task_id,$2),state=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'polling' END,message='YouCam is rendering the selected preview. You can continue working.',updated_at=now() WHERE id=$1 RETURNING *",
      [jobId, task.taskId],
    );
    return result.rows[0]?.state === "polling";
  } catch (error) {
    const ambiguous =
      !(error instanceof YouCamError) || error.submissionUncertain;
    await failJob(
      jobId,
      error instanceof YouCamError ? error.code : "unknown_submission",
      ambiguous
        ? "The provider may have received this request. No repeat task will be submitted automatically."
        : (error as Error).message,
      ambiguous,
    );
    return false;
  }
}
// Paid POSTs are guarded by a database intent and never retried by Workflow.
submitPreviewStep.maxRetries = 0;

export async function pollPreviewStep(
  jobId: string,
): Promise<"waiting" | "finished"> {
  "use step";
  const job = await getInternalJob(jobId);
  if (!job || terminalJob(job)) return "finished";
  if (!(await usable(job))) {
    await cancelJob(jobId);
    return "finished";
  }
  if (!job.provider_task_id) {
    await failJob(
      jobId,
      "unknown_submission",
      "The provider task could not be confirmed. It will not be sent again automatically.",
      true,
    );
    return "finished";
  }
  if (!(await takeProviderRequest())) return "waiting";
  let storedPath: string | null = null;
  try {
    const task =
      job.input.kind === "beauty"
        ? await getMakeupTask(job.provider_task_id)
        : await getClothesTask(job.provider_task_id);
    if (task.state === "running") return "waiting";
    if (task.state === "error") {
      await failJob(jobId, task.code, task.message);
      return "finished";
    }
    await getPool().query(
      "UPDATE sc_jobs SET state='storing',message='Storing the completed preview privately for inspection.',updated_at=now() WHERE id=$1 AND NOT cancel_requested",
      [jobId],
    );
    const photo = await normalizePhoto(
      await readLimited(await downloadOutput(task.outputUrl)),
      undefined,
      job.input.kind === "beauty" ? "face" : "garment",
    );
    const pathname = `${storagePrefix()}/results/${job.project_id}/${job.id}.jpg`;
    storedPath = pathname;
    await put(pathname, photo.bytes, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    if (!(await completeLiveJob(jobId, pathname, photo))) await del(pathname);
    return "finished";
  } catch (error) {
    if (error instanceof YouCamError && error.retryable) return "waiting";
    if (error instanceof ApiError && error.status === 404) {
      if (storedPath) await del(storedPath);
      await cancelJob(jobId);
      return "finished";
    }
    if (error instanceof ApiError && [410, 413, 422].includes(error.status)) {
      if (storedPath) await del(storedPath);
      await failJob(
        jobId,
        "result_unusable",
        "The provider result could not be stored as a valid current preview. Review the image requirements and production capacity before another deliberate attempt.",
      );
      return "finished";
    }
    if (error instanceof YouCamError) {
      await failJob(jobId, error.code, error.message);
      return "finished";
    }
    throw new RetryableError("The finished preview needs to be stored", {
      retryAfter: "30s",
    });
  }
}
pollPreviewStep.maxRetries = 3;

export async function interruptedStep(jobId: string, runId: string) {
  "use step";
  await interruptedJob(jobId, runId);
}
interruptedStep.maxRetries = 3;
export async function timeoutStep(jobId: string) {
  "use step";
  await getPool().query(
    "UPDATE sc_jobs SET workflow_run_id=NULL,dispatch_started_at=NULL,message='This task is taking longer than expected. Resume the saved attempt to check the same provider task without another paid submission.',updated_at=now() WHERE id=$1 AND state IN ('polling','storing')",
    [jobId],
  );
}
