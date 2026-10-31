import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  GarmentCategory,
  Preview,
  PreviewJob,
  Production,
  BeautyRecipe,
  BeautyPreview,
} from "@/lib/types";
import { applyCommand, previewInputHash, beautyInputHash } from "@/lib/domain";
import {
  recordedPreviews,
  matchRecording,
  type Recording,
} from "@/lib/youcam/recorded";
import {
  recordedBeautyPreviews,
  matchBeautyRecording,
  type BeautyRecording,
} from "@/lib/youcam/recorded-beauty";
import { youcamConfigured } from "@/lib/youcam";
import { readInputImage, storageConfigured, insertAsset } from "./assets";
import { getPool, transaction } from "./db";
import { ApiError, revisionConflict } from "./errors";
import { hash, isUuid, ownedProject, persistProject } from "./projects";
import {
  dailyJobLimit,
  generationPaused,
  ownerDailyJobLimit,
  rateLimit,
} from "./limits";

export interface GarmentJobInput {
  kind?: "garment";
  performerId: string;
  captureVersion: number;
  recipeRevision: number;
  unitIds: string[];
  category: GarmentCategory;
  source: { assetId: string | null; imageUrl: string | null; sha256: string };
  garment: { assetId: string | null; imageUrl: string | null; sha256: string };
  recordingId: string | null;
}
export interface BeautyJobInput {
  kind: "beauty";
  performerId: string;
  faceCaptureVersion: number;
  beautyRevision: number;
  recipe: BeautyRecipe;
  source: { assetId: string | null; imageUrl: string | null; sha256: string };
  recordingId: string | null;
}
export type JobInput = GarmentJobInput | BeautyJobInput;
export interface ProviderJob {
  id: string;
  project_id: string;
  owner_id: string;
  look_id: string;
  mode: "live" | "recorded";
  kind?: "garment" | "beauty";
  command_id: string;
  request_hash: string;
  input_hash: string;
  input: JobInput;
  state: PreviewJob["state"];
  message: string;
  estimated_units: number;
  provider_task_id: string | null;
  workflow_run_id: string | null;
  submission_started_at: Date | null;
  dispatch_started_at: Date | null;
  cancel_requested: boolean;
  output_asset_id: string | null;
  result_preview_id: string | null;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
}
export const presentJob = (job: ProviderJob): PreviewJob => ({
  id: job.id,
  projectId: job.project_id,
  lookId: job.look_id,
  kind: job.kind || "garment",
  state: job.state,
  createdAt: new Date(job.created_at).toISOString(),
  updatedAt: new Date(job.updated_at).toISOString(),
  message: job.message,
  estimatedUnits: job.estimated_units,
  resultPreviewId: job.result_preview_id,
  errorCode: job.error_code,
});
export const terminalJob = (job: ProviderJob) =>
  ["succeeded", "failed", "cancelled", "ambiguous"].includes(job.state);

export function jobMatchesProject(project: Production, job: ProviderJob) {
  const performer = project.performers.find(
    (item) => item.id === job.input.performerId,
  );
  const look = project.looks.find((item) => item.id === job.look_id);
  if (job.kind === "beauty") {
    if (job.input.kind !== "beauty") return false;
    const face = performer?.faceCapture;
    return Boolean(
      face?.consent.granted &&
      look?.beauty &&
      look.performerId === performer?.id &&
      face.version === job.input.faceCaptureVersion &&
      look.beauty.revision === job.input.beautyRevision &&
      beautyInputHash(project, look) === job.input_hash,
    );
  }
  if (job.input.kind === "beauty") return false;
  return Boolean(
    performer?.consent.granted &&
    look &&
    look.performerId === performer.id &&
    look.revision === job.input.recipeRevision &&
    performer.captureVersion === job.input.captureVersion &&
    previewInputHash(project, look) === job.input_hash,
  );
}

export async function getInternalJob(
  id: string,
  client?: PoolClient,
  lock = false,
): Promise<ProviderJob | null> {
  if (!isUuid(id)) return null;
  const result = await (client || getPool()).query<ProviderJob>(
    `SELECT * FROM sc_jobs WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  return result.rows[0] || null;
}
export async function ownedJob(
  ownerId: string,
  id: string,
): Promise<ProviderJob> {
  const job = await getInternalJob(id);
  if (!job || job.owner_id !== ownerId)
    throw new ApiError(
      404,
      "JOB_NOT_FOUND",
      "This preview attempt could not be found.",
    );
  await ownedProject(ownerId, job.project_id);
  return job;
}

function renderSubjects(project: Production, lookId: string) {
  const look = project.looks.find((item) => item.id === lookId);
  if (!look)
    throw new ApiError(
      404,
      "LOOK_NOT_FOUND",
      "Choose a look from this production.",
    );
  const performer = project.performers.find(
    (item) => item.id === look.performerId,
  );
  if (!performer?.consent.granted)
    throw new ApiError(
      422,
      "CONSENT_REQUIRED",
      "This performer needs to grant photo permission before a preview can be prepared.",
    );
  if (look.unitIds.length !== 1)
    throw new ApiError(
      422,
      "ONE_GARMENT_REQUIRED",
      "Clothes V4 uses one reference garment per preview. Choose one physical unit.",
    );
  const unit = project.units.find((item) => item.id === look.unitIds[0]);
  if (!unit)
    throw new ApiError(
      422,
      "GARMENT_REQUIRED",
      "Choose a physical garment from this production.",
    );
  return { look, performer, unit };
}

function renderBeautySubjects(project: Production, lookId: string) {
  const look = project.looks.find((item) => item.id === lookId);
  if (!look?.beauty)
    throw new ApiError(
      422,
      "BEAUTY_RECIPE_REQUIRED",
      "Choose and save a beauty recipe for this look before generating a detail.",
    );
  const performer = project.performers.find(
    (item) => item.id === look.performerId,
  );
  const face = performer?.faceCapture;
  if (!performer || !face?.consent.granted || !face.imageUrl)
    throw new ApiError(
      422,
      "FACE_CONSENT_REQUIRED",
      "Add a separate permitted face capture for this performer before generating a beauty detail.",
    );
  return { look, performer, face };
}

export async function createPreviewJob(
  ownerId: string,
  projectId: string,
  request: {
    lookId: string;
    mode: "live" | "recorded";
    commandId: string;
    expectedRevision?: number;
    kind?: "garment" | "beauty";
  },
  seedExample = false,
): Promise<ProviderJob> {
  const project = await ownedProject(ownerId, projectId);
  const kind = request.kind || "garment";
  const estimatedUnits = kind === "beauty" ? 1 : 2;
  const requestHash = hash({
    lookId: request.lookId,
    mode: request.mode,
    ...(kind === "beauty" ? { kind } : {}),
  });
  const previous = await getPool().query<ProviderJob>(
    "SELECT * FROM sc_jobs WHERE project_id=$1 AND command_id=$2",
    [projectId, request.commandId],
  );
  if (previous.rows[0]) {
    if (previous.rows[0].request_hash !== requestHash)
      throw new ApiError(
        409,
        "COMMAND_REUSED",
        "This request identifier was already used for another preview.",
      );
    return previous.rows[0];
  }
  if (
    request.expectedRevision !== undefined &&
    project.revision !== request.expectedRevision
  )
    throw revisionConflict();
  const garmentSubjects =
    kind === "garment" ? renderSubjects(project, request.lookId) : null;
  const beautySubjects =
    kind === "beauty" ? renderBeautySubjects(project, request.lookId) : null;
  const look = garmentSubjects?.look || beautySubjects!.look;
  const performer = garmentSubjects?.performer || beautySubjects!.performer;
  if (request.mode === "live") {
    if (generationPaused())
      throw new ApiError(
        503,
        "GENERATION_PAUSED",
        "New live generations are paused. Recorded examples remain available.",
      );
    if (!youcamConfigured() || !storageConfigured())
      throw new ApiError(
        503,
        "GENERATION_UNAVAILABLE",
        "Live previews are temporarily unavailable. Your production remains editable.",
        true,
      );
  }
  if (!seedExample || request.mode !== "recorded")
    await rateLimit(`preview:${ownerId}`, 12, 300);
  let recording: Recording | BeautyRecording | null = null;
  let inputHash: string;
  let input: JobInput;
  if (beautySubjects) {
    const sourceImage = await readInputImage(
      ownerId,
      beautySubjects.face,
      "face",
    );
    const recipe = beautySubjects.look.beauty!.recipe;
    if (request.mode === "recorded")
      recording = await matchBeautyRecording({
        lookId: look.id,
        performerId: performer.id,
        sourceSha256: sourceImage.sha256,
        recipe,
      });
    inputHash = beautyInputHash(project, look);
    input = {
      kind: "beauty",
      performerId: performer.id,
      faceCaptureVersion: beautySubjects.face.version,
      beautyRevision: look.beauty!.revision,
      recipe: structuredClone(recipe),
      source: {
        assetId: beautySubjects.face.assetId,
        imageUrl: beautySubjects.face.imageUrl,
        sha256: sourceImage.sha256,
      },
      recordingId: recording?.id || null,
    };
  } else {
    const unit = garmentSubjects!.unit;
    const [sourceImage, garmentImage] = await Promise.all([
      readInputImage(ownerId, performer),
      readInputImage(ownerId, unit),
    ]);
    if (request.mode === "recorded")
      recording = await matchRecording({
        lookId: look.id,
        performerId: performer.id,
        unitIds: look.unitIds,
        category: look.category,
        sourceSha256: sourceImage.sha256,
        garmentSha256: garmentImage.sha256,
      });
    inputHash = previewInputHash(project, look);
    input = {
      performerId: performer.id,
      captureVersion: performer.captureVersion,
      recipeRevision: look.revision,
      unitIds: [...look.unitIds],
      category: look.category,
      source: {
        assetId: performer.assetId,
        imageUrl: performer.imageUrl,
        sha256: sourceImage.sha256,
      },
      garment: {
        assetId: unit.assetId,
        imageUrl: unit.imageUrl,
        sha256: garmentImage.sha256,
      },
      recordingId: recording?.id || null,
    };
  }
  if (request.mode === "recorded" && !recording)
    throw new ApiError(
      422,
      "RECORDING_NOT_AVAILABLE",
      kind === "beauty"
        ? "No recorded beauty detail matches this performer, face capture and exact effect recipe. Choose a matching example or request a live detail."
        : "No recorded preview matches this performer image, garment and category. Choose a matching example or request a live preview.",
    );
  const job = await transaction(async (client) => {
    const latest = await ownedProject(ownerId, projectId, client, true);
    const duplicate = await client.query<ProviderJob>(
      "SELECT * FROM sc_jobs WHERE project_id=$1 AND command_id=$2",
      [projectId, request.commandId],
    );
    if (duplicate.rows[0]) {
      if (duplicate.rows[0].request_hash !== requestHash)
        throw new ApiError(
          409,
          "COMMAND_REUSED",
          "This request identifier was already used for another preview.",
        );
      return duplicate.rows[0];
    }
    if (
      request.expectedRevision !== undefined &&
      latest.revision !== request.expectedRevision
    )
      throw revisionConflict();
    if (
      (kind === "beauty"
        ? beautyInputHash(latest, request.lookId)
        : previewInputHash(latest, request.lookId)) !== inputHash
    )
      throw new ApiError(
        409,
        "LOOK_CHANGED",
        "This look changed while its inputs were being prepared. Review the current recipe and try again.",
      );
    if (kind === "beauty") renderBeautySubjects(latest, request.lookId);
    else renderSubjects(latest, request.lookId);
    if (request.mode === "live") {
      await client.query("SELECT pg_advisory_xact_lock(7140323)");
      const quota = await client.query<{ total: string; owner: string }>(
        "SELECT count(*) AS total,count(*) FILTER(WHERE owner_id=$1) AS owner FROM sc_quota_reservations WHERE day=(now() AT TIME ZONE 'UTC')::date",
        [ownerId],
      );
      if (
        Number(quota.rows[0].total) >= dailyJobLimit() ||
        Number(quota.rows[0].owner) >= ownerDailyJobLimit()
      )
        throw new ApiError(
          429,
          "DAILY_PREVIEW_LIMIT",
          "Today's live preview allowance is used. Recorded examples and saved work remain available.",
        );
      const active = await client.query<{ n: string }>(
        "SELECT count(*) AS n FROM sc_jobs WHERE mode='live' AND state IN ('queued','preparing','submitting','polling','storing')",
      );
      if (Number(active.rows[0].n) >= 3)
        throw new ApiError(
          429,
          "PREVIEW_QUEUE_FULL",
          "Three live previews are already in progress. Wait for one to finish before starting another.",
          true,
        );
    }
    const id = randomUUID();
    if (request.mode === "live")
      await client.query(
        "INSERT INTO sc_quota_reservations(id,owner_id,project_id,estimated_units) VALUES($1,$2,$3,$4)",
        [id, ownerId, projectId, estimatedUnits],
      );
    const inserted = await client.query<ProviderJob>(
      "INSERT INTO sc_jobs(id,project_id,owner_id,look_id,mode,command_id,request_hash,input_hash,input,state,message,estimated_units,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',$10,$11,$12) RETURNING *",
      [
        id,
        projectId,
        ownerId,
        look.id,
        request.mode,
        request.commandId,
        requestHash,
        inputHash,
        input,
        request.mode === "live"
          ? kind === "beauty"
            ? "Queued to prepare the permitted separate face capture."
            : "Queued to prepare the permitted performer and garment images."
          : "Loading the matching recorded provider result.",
        request.mode === "live" ? estimatedUnits : 0,
        kind,
      ],
    );
    return inserted.rows[0];
  });
  if (recording && job.state === "queued")
    await completeRecordedJob(job.id, recording);
  return (await getInternalJob(job.id))!;
}

async function addPreview(
  client: PoolClient,
  project: Production,
  job: ProviderJob,
  preview: Preview | BeautyPreview,
) {
  const after = applyCommand(
    project,
    "beautyRevision" in preview
      ? { type: "add_beauty_preview", lookId: job.look_id, preview }
      : { type: "add_preview", lookId: job.look_id, preview },
    { actor: job.owner_id, now: new Date().toISOString(), id: randomUUID() },
  );
  await persistProject(
    client,
    project,
    after,
    `preview-${job.id}`,
    hash({ previewId: preview.id, inputHash: job.input_hash }),
  );
  await client.query(
    "UPDATE sc_jobs SET state='succeeded',result_preview_id=$2,error_code=NULL,message='Preview ready for inspection. Appearance approval is a separate decision.',updated_at=now() WHERE id=$1",
    [job.id, preview.id],
  );
}
export async function completeRecordedJob(
  jobId: string,
  recording: Recording | BeautyRecording,
) {
  const initial = await getInternalJob(jobId);
  if (!initial) return;
  await transaction(async (client) => {
    const project = await ownedProject(
      initial.owner_id,
      initial.project_id,
      client,
      true,
    );
    const job = await getInternalJob(jobId, client, true);
    if (!job || terminalJob(job)) return;
    if (job.cancel_requested || !jobMatchesProject(project, job)) {
      await cancelJob(jobId, client);
      return;
    }
    if (job.input.kind === "beauty") {
      if (recording.operation !== "makeup_vto_v1")
        throw new ApiError(
          422,
          "RECORDING_KIND_MISMATCH",
          "This provider result is not a beauty detail.",
        );
      const preview: BeautyPreview = {
        id: `preview-${job.id}`,
        lookId: job.look_id,
        beautyRevision: job.input.beautyRevision,
        performerId: job.input.performerId,
        faceCaptureVersion: job.input.faceCaptureVersion,
        imageUrl: recording.imagePath,
        assetId: null,
        sourceImageUrl: job.input.source.imageUrl!,
        operation: "YouCam Makeup VTO · recorded separate beauty detail",
        provenance: "recorded_provider",
        createdAt: recording.recordedAt,
        inputHash: job.input_hash,
        estimatedUnits: recording.estimatedUnits,
        inspectionNotes: recording.inspectionNotes,
      };
      await addPreview(client, project, job, preview);
      return;
    }
    if (recording.operation !== "ai_clothes_v4")
      throw new ApiError(
        422,
        "RECORDING_KIND_MISMATCH",
        "This provider result is not a garment preview.",
      );
    const preview: Preview = {
      id: `preview-${job.id}`,
      lookId: job.look_id,
      recipeRevision: job.input.recipeRevision,
      performerId: job.input.performerId,
      captureVersion: job.input.captureVersion,
      imageUrl: recording.imagePath,
      assetId: null,
      sourceImageUrl: job.input.source.imageUrl!,
      unitIds: job.input.unitIds,
      operation: "YouCam Clothes V4 · recorded garment preview",
      provenance: "recorded_provider",
      createdAt: recording.recordedAt,
      inputHash: job.input_hash,
      estimatedUnits: recording.estimatedUnits,
      inspectionNotes: recording.inspectionNotes,
    };
    await addPreview(client, project, job, preview);
  });
}

export async function completeLiveJob(
  jobId: string,
  pathname: string,
  photo: { bytes: Buffer; sha256: string; width: number; height: number },
) {
  const initial = await getInternalJob(jobId);
  if (!initial) return false;
  return transaction(async (client) => {
    const project = await ownedProject(
      initial.owner_id,
      initial.project_id,
      client,
      true,
    );
    const job = await getInternalJob(jobId, client, true);
    if (!job) return false;
    if (job.state === "succeeded") return true;
    if (
      job.cancel_requested ||
      terminalJob(job) ||
      !jobMatchesProject(project, job)
    ) {
      await cancelJob(jobId, client);
      return false;
    }
    const id = randomUUID();
    const asset = await insertAsset(client, {
      id,
      projectId: job.project_id,
      ownerId: job.owner_id,
      subjectId: job.input.performerId,
      purpose: job.input.kind === "beauty" ? "beauty_preview" : "preview",
      pathname,
      photo,
      provenance: "live_provider",
    });
    await client.query("UPDATE sc_jobs SET output_asset_id=$2 WHERE id=$1", [
      jobId,
      asset.id,
    ]);
    if (job.input.kind === "beauty") {
      const preview: BeautyPreview = {
        id: `preview-${job.id}`,
        lookId: job.look_id,
        beautyRevision: job.input.beautyRevision,
        performerId: job.input.performerId,
        faceCaptureVersion: job.input.faceCaptureVersion,
        imageUrl: `/api/assets/${id}`,
        assetId: id,
        sourceImageUrl: job.input.source.imageUrl!,
        operation: "YouCam Makeup VTO · live separate beauty detail",
        provenance: "live_provider",
        createdAt: new Date().toISOString(),
        inputHash: job.input_hash,
        estimatedUnits: job.estimated_units,
        inspectionNotes:
          "Actual YouCam Makeup VTO detail from a separate face capture. Both skin smoothing fields and lip morphology are set to zero; this is a payload setting, not a guarantee about texture or identity. Inspect lips, blush, facial features and texture before explicit beauty approval. This detail is not composited into the garment image and does not establish real makeup application or product matching.",
      };
      await addPreview(client, project, job, preview);
      return true;
    }
    const preview: Preview = {
      id: `preview-${job.id}`,
      lookId: job.look_id,
      recipeRevision: job.input.recipeRevision,
      performerId: job.input.performerId,
      captureVersion: job.input.captureVersion,
      imageUrl: `/api/assets/${id}`,
      assetId: id,
      sourceImageUrl: job.input.source.imageUrl!,
      unitIds: job.input.unitIds,
      operation: "YouCam Clothes V4 · live garment preview",
      provenance: "live_provider",
      createdAt: new Date().toISOString(),
      inputHash: job.input_hash,
      estimatedUnits: job.estimated_units,
      inspectionNotes:
        "Actual YouCam Clothes V4 result. Inspect identity, pose, garment detail and continuity before approving. Hair and makeup notes, physical fit, measurements and supplier availability are not established by this garment preview.",
    };
    await addPreview(client, project, job, preview);
    return true;
  });
}

export async function cancelJob(jobId: string, client?: PoolClient) {
  await (client || getPool()).query(
    "UPDATE sc_jobs SET cancel_requested=true,state=CASE WHEN state='succeeded' THEN state ELSE 'cancelled' END,message='Preview cancelled locally. A task already received by the provider may still consume its reserved units.',updated_at=now() WHERE id=$1",
    [jobId],
  );
}
export async function failJob(
  jobId: string,
  code: string,
  message: string,
  ambiguous = false,
) {
  await getPool().query(
    "UPDATE sc_jobs SET state=$2,error_code=$3,message=$4,updated_at=now() WHERE id=$1 AND state NOT IN ('succeeded','cancelled')",
    [jobId, ambiguous ? "ambiguous" : "failed", code, message],
  );
}
export async function interruptedJob(jobId: string, runId: string) {
  const job = await getInternalJob(jobId);
  if (!job || job.workflow_run_id !== runId || terminalJob(job)) return;
  if (job.submission_started_at && !job.provider_task_id)
    await failJob(
      jobId,
      "unknown_submission",
      "The provider may have received this request. No repeat task will be submitted automatically.",
      true,
    );
  else
    await getPool().query(
      "UPDATE sc_jobs SET workflow_run_id=NULL,dispatch_started_at=NULL,message='The preview worker was interrupted. Resume this saved attempt to continue without submitting a second paid task.',updated_at=now() WHERE id=$1 AND workflow_run_id=$2",
      [jobId, runId],
    );
}

export async function attachExampleRecordings(
  ownerId: string,
  project: Production,
): Promise<Production> {
  const haveGarmentRecordings = (await recordedPreviews()).length > 0;
  const haveBeautyRecordings = (await recordedBeautyPreviews()).length > 0;
  if (!haveGarmentRecordings && !haveBeautyRecordings) return project;
  for (const look of project.looks) {
    try {
      if (haveGarmentRecordings)
        await createPreviewJob(
          ownerId,
          project.id,
          {
            lookId: look.id,
            mode: "recorded",
            commandId: `example-${look.id}`,
          },
          true,
        );
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.code !== "RECORDING_NOT_AVAILABLE"
      )
        throw error;
    }
    if (haveBeautyRecordings && look.beauty) {
      try {
        await createPreviewJob(
          ownerId,
          project.id,
          {
            lookId: look.id,
            mode: "recorded",
            kind: "beauty",
            commandId: `example-beauty-${look.id}`,
          },
          true,
        );
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          !["RECORDING_NOT_AVAILABLE", "FACE_CONSENT_REQUIRED"].includes(
            error.code,
          )
        )
          throw error;
      }
    }
  }
  return ownedProject(ownerId, project.id);
}
