import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPool, transaction } from "@/lib/server/db";
import {
  createProject,
  ownedProject,
  runCommand,
  hash,
} from "@/lib/server/projects";
import {
  createPreviewJob,
  getInternalJob,
  jobMatchesProject,
} from "@/lib/server/jobs";
import {
  createUploadIntent,
  finalizeUpload,
  insertAsset,
  ownedAsset,
} from "@/lib/server/assets";
import {
  prepareFilesStep,
  submitPreviewStep,
  pollPreviewStep,
} from "@/workflows/preview-steps";
import {
  getCurrentApproval,
  getCurrentBeautyApproval,
  beautyInputHash,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
  getCurrentDetailPreview,
} from "@/lib/domain";
import {
  registerFile,
  uploadRegisteredFile,
  submitMakeupTask,
  getMakeupTask,
  submitClothesTask,
  downloadOutput,
  YouCamError,
  submitHairColorTask,
  getHairColorTask,
  submitNecklaceTask,
  getNecklaceTask,
} from "@/lib/youcam";
import {
  head,
  get,
  put,
  type HeadBlobResult,
  type GetBlobResult,
} from "@vercel/blob";
import sharp from "sharp";
import * as imageNormalization from "@/lib/server/images";

vi.mock("@vercel/blob", () => ({
  head: vi.fn(),
  get: vi.fn(),
  put: vi.fn().mockResolvedValue({ pathname: "private-result" }),
  del: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/youcam", async (original) => ({
  ...(await original<typeof import("@/lib/youcam")>()),
  youcamConfigured: () => true,
  getCreditBalance: vi.fn().mockResolvedValue(1000),
  registerFile: vi.fn(),
  uploadRegisteredFile: vi.fn(),
  submitMakeupTask: vi.fn(),
  getMakeupTask: vi.fn(),
  submitClothesTask: vi.fn(),
  getClothesTask: vi.fn(),
  submitHairColorTask: vi.fn(),
  getHairColorTask: vi.fn(),
  submitNecklaceTask: vi.fn(),
  getNecklaceTask: vi.fn(),
  downloadOutput: vi.fn(),
}));
vi.mock("@/lib/server/limits", async (original) => ({
  ...(await original<typeof import("@/lib/server/limits")>()),
  takeProviderRequest: vi.fn().mockResolvedValue(true),
}));
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
const local = Boolean(
  databaseUrl &&
  ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) &&
  /stagecraft_(dev|test)/.test(databaseUrl.pathname),
);
let owner: string, other: string;
describe.runIf(local)("independent private beauty workflow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    vi.stubEnv("YOUCAM_DAILY_JOB_LIMIT", "100");
    vi.stubEnv("YOUCAM_OWNER_DAILY_JOB_LIMIT", "4");
    vi.stubEnv("YOUCAM_API_KEY", "test-server-beauty-key");
    vi.stubEnv("GENERATION_PAUSED", "false");
    owner = `beauty-test-${randomUUID()}`;
    other = `beauty-test-${randomUUID()}`;
    await getPool().query(
      "INSERT INTO \"user\"(id,name,email,\"isAnonymous\") VALUES($1,'Test',$2,true),($3,'Other',$4,true)",
      [owner, `${owner}@test.invalid`, other, `${other}@test.invalid`],
    );
  });
  afterEach(async () => {
    await getPool().query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
      [owner, other],
    ]);
    await getPool().query(
      "DELETE FROM sc_quota_reservations WHERE owner_id=ANY($1::text[])",
      [[owner, other]],
    );
    vi.unstubAllEnvs();
  });
  it("seeds eight garments, two makeup states, four details and two candidates without encoding or approvals", async () => {
    const encoder = vi
      .spyOn(imageNormalization, "normalizePhoto")
      .mockRejectedValue(new Error("Host encoding is unavailable."));
    try {
      const project = await createProject(owner, "example");
      expect(project.revision).toBe(17);
      expect(project.looks.map((item) => item.previews.length)).toEqual([
        1, 1, 1, 1, 1, 1, 1, 1,
      ]);
      expect(project.looks.flatMap((item) => item.approvals)).toHaveLength(0);
      expect(
        project.looks.flatMap((item) => item.beauty?.previews || []),
      ).toHaveLength(2);
      expect(
        project.looks.flatMap((item) => item.beauty?.approvals || []),
      ).toHaveLength(0);
      expect(
        project.looks
          .flatMap((item) => item.details || [])
          .flatMap((item) => item.previews),
      ).toHaveLength(4);
      expect(
        project.looks
          .flatMap((item) => item.details || [])
          .flatMap((item) => item.approvals),
      ).toHaveLength(0);
      expect(
        project.appearanceCandidates?.map((item) => item.previews.length),
      ).toEqual([1, 1]);
      expect(
        project.appearanceCandidates?.flatMap((item) => item.approvals),
      ).toHaveLength(0);
      const look = project.looks.find((look) => look.id === "look-nora")!;
      expect(look.previews).toHaveLength(1);
      expect(look.approvals).toHaveLength(0);
      expect(look.beauty?.previews).toHaveLength(1);
      expect(look.beauty?.approvals).toHaveLength(0);
      expect(look.beauty!.previews[0]).toMatchObject({
        beautyRevision: look.beauty!.revision,
        faceCaptureVersion: 1,
        sourceImageUrl: "/assets/cast/ada-face.webp",
        inputHash: beautyInputHash(project, look),
        estimatedUnits: 1,
        provenance: "recorded_provider",
      });
      expect(look.beauty!.previews[0].imageUrl).toMatch(
        /^\/examples\/beauty\//,
      );
      expect(encoder).not.toHaveBeenCalled();
    } finally {
      encoder.mockRestore();
    }
  }, 20000);
  it("finalizes a separate face capture without changing the garment capture", async () => {
    const project = await createProject(owner, "example");
    const performer = project.performers.find(
      (performer) => performer.id === "performer-ada",
    )!;
    const bytes = await readFile("public/assets/cast/ada-face.webp");
    const intent = await createUploadIntent(owner, {
      projectId: project.id,
      purpose: "face",
      subjectId: performer.id,
      contentType: "image/webp",
      bytes: bytes.length,
      consent: true,
      rightsConfirmed: true,
    });
    vi.mocked(head).mockResolvedValue({
      pathname: intent.pathname,
      size: bytes.length,
      contentType: "image/webp",
    } as HeadBlobResult);
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Response(Uint8Array.from(bytes)).body!,
    } as GetBlobResult);
    const result = await finalizeUpload(owner, {
      pathname: intent.pathname,
      projectId: project.id,
      purpose: "face",
      subjectId: performer.id,
    });
    const after = result.project.performers.find(
      (item) => item.id === performer.id,
    )!;
    expect(after.imageUrl).toBe(performer.imageUrl);
    expect(after.captureVersion).toBe(performer.captureVersion);
    expect(after.faceCapture).toMatchObject({
      version: 2,
      assetId: result.asset.id,
      imageUrl: result.asset.url,
      consent: { granted: true, publicDemo: false },
    });
    expect(result.asset).toMatchObject({ width: 800, height: 1000 });
    expect(put).toHaveBeenCalledOnce();
    await expect(ownedAsset(other, result.asset.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(submitMakeupTask).not.toHaveBeenCalled();
    expect(submitClothesTask).not.toHaveBeenCalled();
  }, 20000);
  it("withdraws face permission and private details while preserving garment evidence", async () => {
    let project = await createProject(owner, "example");
    let look = project.looks.find((look) => look.id === "look-nora")!;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      "approve-body",
      {
        type: "approve_look",
        lookId: look.id,
        previewId: look.previews[0].id,
        approvedBy: "Test reviewer",
        rationale: "Synthetic appearance exercise.",
      },
    );
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      "approve-face",
      {
        type: "approve_beauty",
        lookId: look.id,
        previewId: look.beauty!.previews[0].id,
        approvedBy: "Test reviewer",
        rationale: "Separate synthetic detail exercise.",
      },
    );
    look = project.looks.find((look) => look.id === "look-nora")!;
    const bodyApproval = getCurrentApproval(look)!.id;
    expect(getCurrentBeautyApproval(look)).toBeDefined();
    const photo = {
      bytes: Buffer.from("placeholder"),
      width: 800,
      height: 1000,
      sha256: "0".repeat(64),
    };
    const body = await transaction((client) =>
      insertAsset(client, {
        id: randomUUID(),
        projectId: project.id,
        ownerId: owner,
        subjectId: "performer-ada",
        purpose: "performer",
        pathname: `stagecraft/test/${randomUUID()}.jpg`,
        photo,
        provenance: "manual",
      }),
    );
    const face = await transaction((client) =>
      insertAsset(client, {
        id: randomUUID(),
        projectId: project.id,
        ownerId: owner,
        subjectId: "performer-ada",
        purpose: "face",
        pathname: `stagecraft/test/${randomUUID()}.jpg`,
        photo,
        provenance: "manual",
      }),
    );
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      "withdraw-face",
      { type: "withdraw_face_consent", performerId: "performer-ada" },
    );
    look = project.looks.find((look) => look.id === "look-nora")!;
    expect(getCurrentApproval(look)?.id).toBe(bodyApproval);
    expect(getCurrentBeautyApproval(look)).toBeUndefined();
    await expect(ownedAsset(owner, face.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await ownedAsset(owner, body.id)).id).toBe(body.id);
    await expect(
      createPreviewJob(owner, project.id, {
        lookId: look.id,
        mode: "live",
        kind: "beauty",
        commandId: "blocked-face",
      }),
    ).rejects.toMatchObject({ code: "FACE_CONSENT_REQUIRED" });
    const jobs = await getPool().query<{
      kind: string;
      cancel_requested: boolean;
    }>("SELECT kind,cancel_requested FROM sc_jobs WHERE project_id=$1", [
      project.id,
    ]);
    expect(
      jobs.rows
        .filter((job) => job.kind === "beauty")
        .every((job) => job.cancel_requested),
    ).toBe(true);
    expect(
      jobs.rows
        .filter((job) => job.kind === "garment")
        .every((job) => !job.cancel_requested),
    ).toBe(true);
  }, 20000);
  it("submits one source-only makeup task and stores a separate private detail exactly once", async () => {
    let project = await createProject(owner, "example");
    const look = project.looks.find((look) => look.id === "look-nora")!;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      "approve-body",
      {
        type: "approve_look",
        lookId: look.id,
        previewId: look.previews[0].id,
        approvedBy: "Test reviewer",
        rationale: "Synthetic appearance exercise.",
      },
    );
    const job = await createPreviewJob(owner, project.id, {
      lookId: look.id,
      kind: "beauty",
      mode: "live",
      commandId: "live-beauty",
      expectedRevision: project.revision,
    });
    expect(job.estimated_units).toBe(1);
    expect(job.kind).toBe("beauty");
    expect(jobMatchesProject(project, job)).toBe(true);
    vi.mocked(registerFile).mockResolvedValue({
      fileId: "face-file",
      request: {
        method: "PUT",
        url: "https://yce-us.s3-accelerate.amazonaws.com/face",
        headers: { "Content-Type": "image/jpeg" },
      },
    });
    vi.mocked(uploadRegisteredFile).mockResolvedValue(undefined);
    expect(await prepareFilesStep(job.id)).toBe(true);
    expect(registerFile).toHaveBeenCalledOnce();
    expect(uploadRegisteredFile).toHaveBeenCalledOnce();
    expect(
      (
        await getPool().query(
          "SELECT role FROM sc_provider_files WHERE job_id=$1",
          [job.id],
        )
      ).rows,
    ).toEqual([{ role: "source" }]);
    vi.mocked(submitMakeupTask).mockResolvedValue({
      taskId: "known-makeup-task",
    });
    expect(await submitPreviewStep(job.id)).toBe(true);
    expect(await submitPreviewStep(job.id)).toBe(true);
    expect(submitMakeupTask).toHaveBeenCalledOnce();
    expect(submitClothesTask).not.toHaveBeenCalled();
    vi.mocked(getMakeupTask).mockResolvedValue({
      state: "success",
      outputUrl: "https://yce-us.s3-accelerate.amazonaws.com/detail",
    });
    const output = await sharp({
      create: { width: 512, height: 768, channels: 3, background: "#777777" },
    })
      .jpeg()
      .toBuffer();
    vi.mocked(downloadOutput).mockResolvedValue(
      new Response(Uint8Array.from(output)).body!,
    );
    expect(await pollPreviewStep(job.id)).toBe("finished");
    expect(await pollPreviewStep(job.id)).toBe("finished");
    const after = await ownedProject(owner, project.id);
    const result = after.looks.find((look) => look.id === "look-nora")!;
    expect(result.previews).toHaveLength(1);
    expect(getCurrentApproval(result)).toBeDefined();
    expect(result.beauty!.approvals).toHaveLength(0);
    const preview = result.beauty!.previews.at(-1)!;
    expect(preview.provenance).toBe("live_provider");
    expect(preview.imageUrl).toMatch(/^\/api\/assets\//);
    expect((await ownedAsset(owner, preview.assetId!)).purpose).toBe(
      "beauty_preview",
    );
    expect(put).toHaveBeenCalledOnce();
    const ledger = await getPool().query<{ estimated_units: number }>(
      "SELECT estimated_units FROM sc_quota_reservations WHERE id=$1",
      [job.id],
    );
    expect(ledger.rows[0].estimated_units).toBe(1);
  }, 20000);
  it.each(["hair_color", "necklace"] as const)(
    "runs one durable private %s task with exact face permission and one-unit accounting",
    async (kind) => {
      const project = await createProject(owner, "example"),
        lookId = kind === "hair_color" ? "look-mae-rehearsal" : "look-nora";
      const baseline = project.looks.find((item) => item.id === lookId)!;
      const job = await createPreviewJob(owner, project.id, {
        lookId,
        kind,
        mode: "live",
        commandId: `live-${kind}`,
      });
      let registered = 0;
      vi.mocked(registerFile).mockImplementation(async () => ({
        fileId: `registered-${++registered}`,
        request: {
          url: "https://storage.googleapis.com/example/upload",
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
        },
      }));
      vi.mocked(uploadRegisteredFile).mockResolvedValue(undefined);
      const submit =
        kind === "hair_color" ? submitHairColorTask : submitNecklaceTask;
      vi.mocked(submit).mockResolvedValue({ taskId: `saved-${kind}` });
      expect(await prepareFilesStep(job.id)).toBe(true);
      expect(registerFile).toHaveBeenCalledTimes(kind === "hair_color" ? 1 : 2);
      expect(await submitPreviewStep(job.id)).toBe(true);
      expect(await submitPreviewStep(job.id)).toBe(true);
      expect(submit).toHaveBeenCalledOnce();
      expect(submitClothesTask).not.toHaveBeenCalled();
      expect(submitMakeupTask).not.toHaveBeenCalled();
      const status = kind === "hair_color" ? getHairColorTask : getNecklaceTask;
      vi.mocked(status).mockResolvedValue({
        state: "success",
        outputUrl: "https://storage.googleapis.com/example/output.jpg",
      });
      const bytes = await sharp({
        create: { width: 512, height: 768, channels: 3, background: "#9d6c52" },
      })
        .jpeg()
        .toBuffer();
      vi.mocked(downloadOutput).mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes));
            controller.close();
          },
        }),
      );
      expect(await pollPreviewStep(job.id)).toBe("finished");
      const current = await ownedProject(owner, project.id),
        look = current.looks.find((item) => item.id === lookId)!;
      const preview = getCurrentDetailPreview(look, kind, current)!;
      expect(preview.provenance).toBe("live_provider");
      expect(preview.assetId).toBeTruthy();
      expect(look.previews[0].id).toBe(baseline.previews[0].id);
      expect(
        look.details?.find((item) => item.kind === kind)?.approvals,
      ).toHaveLength(0);
      await expect(ownedAsset(other, preview.assetId!)).rejects.toMatchObject({
        status: 404,
      });
      const quota = await getPool().query(
        "SELECT estimated_units,released FROM sc_quota_reservations WHERE id=$1",
        [job.id],
      );
      expect(quota.rows[0]).toMatchObject({
        estimated_units: 1,
        released: false,
      });
      await runCommand(owner, project.id, current.revision, randomUUID(), {
        type: "withdraw_face_consent",
        performerId: look.performerId,
      });
      await expect(ownedAsset(owner, preview.assetId!)).rejects.toBeDefined();
      expect((await getInternalJob(job.id))?.cancel_requested).toBe(true);
    },
    20000,
  );

  it("preserves adopted candidate decisions, reuses pixels for new intent and projects secondary-look prospective studies", async () => {
    let project = await createProject(owner, "example");
    const id = "candidate-nora-burgundy",
      preview = getCurrentCandidatePreview(project, id)!;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "approve_candidate",
        candidateId: id,
        previewId: preview.id,
        approvedBy: "Synthetic QA reviewer",
        rationale: "Exact candidate output reviewed.",
      },
    );
    const approval = getCurrentCandidateApproval(project, id)!;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "adopt_candidate", candidateId: id },
    );
    for (const look of project.looks.filter((item) =>
      ["look-nora", "look-nora-finale"].includes(item.id),
    )) {
      expect(look.unitIds).toEqual(["unit-coat-burgundy"]);
      expect(getCurrentApproval(look, project)?.id).toBe(approval.id);
    }
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "edit_direction",
        characterId: "char-nora",
        text: "A revised evening direction.",
        essential: ["The coat carries the motif."],
      },
    );
    expect(getCurrentCandidatePreview(project, id)?.id).toBe(preview.id);
    expect(getCurrentCandidateApproval(project, id)).toBeUndefined();
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "approve_candidate",
        candidateId: id,
        previewId: preview.id,
        approvedBy: "Synthetic QA reviewer",
        rationale: "Same pixels reviewed for revised direction.",
      },
    );
    const current = getCurrentCandidateApproval(project, id)!;
    expect(current.id).not.toBe(approval.id);
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "revoke_candidate_approval",
        candidateId: id,
        approvalId: current.id,
      },
    );
    expect(getCurrentCandidateApproval(project, id)).toBeUndefined();
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "create_candidate",
        lookId: "look-nora-finale",
        unitIds: ["unit-coat-burgundy"],
        performerId: "performer-celeste",
      },
    );
    const study = project.appearanceCandidates!.at(-1)!;
    expect(
      (
        await createPreviewJob(owner, project.id, {
          lookId: "look-nora-finale",
          candidateId: study.id,
          mode: "recorded",
          commandId: "prospective-secondary",
        })
      ).state,
    ).toBe("succeeded");
    project = await ownedProject(owner, project.id);
    expect(getCurrentCandidatePreview(project, study.id)).toMatchObject({
      lookId: "look-nora",
      recipeRevision: 1,
      performerId: "performer-celeste",
    });
    const replay = await createPreviewJob(owner, project.id, {
      lookId: "look-nora-finale",
      mode: "recorded",
      commandId: "adopted-compatibility",
    });
    expect(replay.input).toMatchObject({ candidateId: id, recipeRevision: 1 });
    expect(replay.state).toBe("succeeded");
    expect(submitClothesTask).not.toHaveBeenCalled();
  }, 20000);

  it("binds exact recordings to explicit imported actor and physical-unit identities without old approvals", async () => {
    let project = await createProject(owner, "example");
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_performer", sourcePerformerId: "performer-ada" },
    );
    const performer = project.performers.find(
      (item) =>
        item.id !== "performer-ada" && item.librarySourceId === "performer-ada",
    )!;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_unit", sourceUnitId: "unit-coat-burgundy" },
    );
    const unit = project.units.find(
      (item) =>
        item.id !== "unit-coat-burgundy" &&
        item.librarySourceId === "unit-coat-burgundy",
    )!;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "create_candidate",
        lookId: "look-nora",
        unitIds: [unit.id],
        performerId: performer.id,
      },
    );
    const candidate = project.appearanceCandidates!.at(-1)!;
    const job = await createPreviewJob(owner, project.id, {
      lookId: "look-nora",
      candidateId: candidate.id,
      mode: "recorded",
      commandId: "library-association",
    });
    project = await ownedProject(owner, project.id);
    const preview = getCurrentCandidatePreview(project, candidate.id)!;
    expect(job.state).toBe("succeeded");
    expect(preview.performerId).toBe(performer.id);
    expect(preview.unitIds).toEqual([unit.id]);
    expect(preview.recordingEvidence).toMatchObject({
      originalPerformerId: "performer-ada",
      originalUnitIds: ["unit-coat-burgundy"],
      binding: "verified_library_inputs",
    });
    expect(getCurrentCandidateApproval(project, candidate.id)).toBeUndefined();
    expect(submitClothesTask).not.toHaveBeenCalled();
  }, 20000);

  it("refuses canonical-looking IDs without trusted library provenance in a nonfixture production", async () => {
    const project = await createProject(owner, "example");
    const untrusted = structuredClone(project);
    untrusted.fixture = false;
    for (const performer of untrusted.performers) {
      delete performer.librarySourceId;
      if (performer.faceCapture) delete performer.faceCapture.librarySourceId;
    }
    for (const unit of untrusted.units) delete unit.librarySourceId;
    await getPool().query("UPDATE sc_projects SET snapshot=$2 WHERE id=$1", [
      project.id,
      untrusted,
    ]);
    await expect(
      createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        mode: "recorded",
        commandId: "untrusted-canonical-alias",
      }),
    ).rejects.toMatchObject({ code: "RECORDING_NOT_AVAILABLE" });
    expect(submitClothesTask).not.toHaveBeenCalled();
  }, 20000);

  it("recovers a saved secondary-look recorded candidate intent without another task", async () => {
    const project = await createProject(owner, "example"),
      id = randomUUID(),
      commandId = "saved-recording-recovery";
    const template = (
      await getPool().query(
        "SELECT id FROM sc_jobs WHERE project_id=$1 AND command_id='example-candidate-nora-burgundy'",
        [project.id],
      )
    ).rows[0];
    const request = {
      lookId: "look-nora-finale",
      mode: "recorded" as const,
      candidateId: "candidate-nora-burgundy",
      commandId,
    };
    await getPool().query(
      "INSERT INTO sc_jobs(id,project_id,owner_id,look_id,mode,kind,command_id,request_hash,input_hash,input,state,message,estimated_units) SELECT $1,project_id,owner_id,$2,mode,kind,$3,$4,input_hash,input || '{\"recipeRevision\":7}'::jsonb,'queued','Saved recorded intent',0 FROM sc_jobs WHERE id=$5",
      [
        id,
        request.lookId,
        commandId,
        hash({
          lookId: request.lookId,
          mode: request.mode,
          candidateId: request.candidateId,
        }),
        template.id,
      ],
    );
    expect((await createPreviewJob(owner, project.id, request)).state).toBe(
      "succeeded",
    );
    const current = await ownedProject(owner, project.id),
      preview = getCurrentCandidatePreview(current, request.candidateId)!;
    expect(preview).toMatchObject({ lookId: "look-nora", recipeRevision: 1 });
    expect((await createPreviewJob(owner, project.id, request)).id).toBe(id);
    expect((await ownedProject(owner, project.id)).revision).toBe(
      current.revision,
    );
    expect(submitClothesTask).not.toHaveBeenCalled();
  }, 20000);

  it("never repeats an ambiguous paid makeup submission", async () => {
    const project = await createProject(owner, "example");
    const job = await createPreviewJob(owner, project.id, {
      lookId: "look-nora",
      kind: "beauty",
      mode: "live",
      commandId: "ambiguous-beauty",
    });
    await getPool().query(
      "INSERT INTO sc_provider_files(job_id,role,state,file_id) VALUES($1,'source','uploaded','face-file')",
      [job.id],
    );
    vi.mocked(submitMakeupTask).mockRejectedValue(
      new YouCamError("unknown_submission", "Submission uncertain"),
    );
    expect(await submitPreviewStep(job.id)).toBe(false);
    expect(await submitPreviewStep(job.id)).toBe(false);
    expect(submitMakeupTask).toHaveBeenCalledOnce();
    expect(submitClothesTask).not.toHaveBeenCalled();
    expect((await getInternalJob(job.id))?.state).toBe("ambiguous");
    expect(
      (
        await createPreviewJob(owner, project.id, {
          lookId: "look-nora",
          kind: "beauty",
          mode: "live",
          commandId: "ambiguous-beauty",
        })
      ).id,
    ).toBe(job.id);
  }, 20000);
});
