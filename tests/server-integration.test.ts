import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPool, transaction } from "@/lib/server/db";
import {
  createProject,
  ownedProject,
  runCommand,
  listProjects,
  deleteProject,
  exportProject,
  hash,
  ownedRevision,
} from "@/lib/server/projects";
import {
  createPreviewJob,
  getInternalJob,
  ownedJob,
  presentJob,
  interruptedJob,
  failJob,
  cancelJob,
} from "@/lib/server/jobs";
import {
  createUploadIntent,
  authorizeUpload,
  ownedAsset,
  insertAsset,
  finalizeUpload,
} from "@/lib/server/assets";
import { adoptScriptDraft } from "@/lib/server/script-extraction";
import { candidateInputHash } from "@/lib/domain";
import {
  submitPreviewStep,
  prepareFilesStep,
  pollPreviewStep,
  bindRunStep,
} from "@/workflows/preview-steps";
import {
  registerFile,
  uploadRegisteredFile,
  submitClothesTask,
  getClothesTask,
  downloadOutput,
  YouCamError,
} from "@/lib/youcam";
import { put, head, get, type HeadBlobResult } from "@vercel/blob";
import sharp from "sharp";

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
  submitClothesTask: vi.fn(),
  getClothesTask: vi.fn(),
  downloadOutput: vi.fn(),
}));
vi.mock("@/lib/server/limits", async (original) => ({
  ...(await original<typeof import("@/lib/server/limits")>()),
  takeProviderRequest: vi.fn().mockResolvedValue(true),
}));

// Fixture cleanup is permitted only on this project's isolated local database.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
const local = Boolean(
  databaseUrl &&
  ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) &&
  /stagecraft_(?:dev|test)/.test(databaseUrl.pathname),
);
let owner: string;
let other: string;

describe.runIf(local)(
  "PostgreSQL ownership, revisions and provider recovery",
  () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-private-token");
      vi.stubEnv("YOUCAM_DAILY_JOB_LIMIT", "100");
      vi.stubEnv("YOUCAM_OWNER_DAILY_JOB_LIMIT", "4");
      vi.stubEnv("YOUCAM_API_KEY", "test-server-integration-key");
      vi.stubEnv("GENERATION_PAUSED", "false");
      owner = `server-test-${randomUUID()}`;
      other = `server-test-${randomUUID()}`;
      await getPool().query(
        "INSERT INTO \"user\"(id,name,email,\"isAnonymous\") VALUES($1,'Test owner',$2,true),($3,'Other owner',$4,true)",
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

    it("releases pre-submission failures while preserving ambiguous spend", async () => {
      const project = await createProject(owner, "example");
      vi.stubEnv("YOUCAM_OWNER_DAILY_JOB_LIMIT", "1");
      const first = await createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        mode: "live",
        commandId: randomUUID(),
      });
      await failJob(
        first.id,
        "upload_failed",
        "The input upload failed before submission.",
      );
      expect(
        (
          await getPool().query(
            "SELECT released FROM sc_quota_reservations WHERE id=$1",
            [first.id],
          )
        ).rows[0].released,
      ).toBe(true);
      const second = await createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        mode: "live",
        commandId: randomUUID(),
      });
      await getPool().query(
        "UPDATE sc_jobs SET submission_started_at=now(),state='ambiguous' WHERE id=$1",
        [second.id],
      );
      await cancelJob(second.id);
      expect(
        (
          await getPool().query(
            "SELECT released FROM sc_quota_reservations WHERE id=$1",
            [second.id],
          )
        ).rows[0].released,
      ).toBe(false);
      await getPool().query(
        "UPDATE sc_jobs SET submission_started_at=NULL,provider_task_id='reconciled-task',state='failed' WHERE id=$1",
        [second.id],
      );
      expect(
        (
          await getPool().query(
            "SELECT released FROM sc_quota_reservations WHERE id=$1",
            [second.id],
          )
        ).rows[0].released,
      ).toBe(false);
      await expect(
        createPreviewJob(owner, project.id, {
          lookId: "look-nora",
          mode: "live",
          commandId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "DAILY_PREVIEW_LIMIT" });
    }, 20000);

    it("rests fresh previews above balance while recordings still work", async () => {
      vi.stubEnv("YOUCAM_BALANCE_FLOOR", "1000000");
      const project = await createProject(owner, "example");
      await expect(
        createPreviewJob(owner, project.id, {
          lookId: "look-nora",
          mode: "recorded",
          commandId: randomUUID(),
        }),
      ).resolves.toMatchObject({ state: "succeeded" });
      await expect(
        createPreviewJob(owner, project.id, {
          lookId: "look-nora",
          mode: "live",
          commandId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "LIVE_PREVIEWS_RESTING" });
      expect(
        Number(
          (
            await getPool().query(
              "SELECT count(*) AS n FROM sc_jobs WHERE project_id=$1 AND mode='live'",
              [project.id],
            )
          ).rows[0].n,
        ),
      ).toBe(0);
      expect(submitClothesTask).not.toHaveBeenCalled();
    }, 20000);

    it("loads recorded results without approvals and isolates another browser", async () => {
      const project = await createProject(owner, "example");
      expect(project.looks).toHaveLength(8);
      expect(
        project.looks.every(
          (look) =>
            look.previews.length === 1 &&
            look.previews[0].provenance === "recorded_provider" &&
            look.approvals.length === 0,
        ),
      ).toBe(true);
      await expect(ownedProject(other, project.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        exportProject(other, project.id, "Other reviewer"),
      ).rejects.toMatchObject({ status: 404 });
      expect(await listProjects(other)).toEqual([]);
      const job = await getPool().query<{ id: string }>(
        "SELECT id FROM sc_jobs WHERE project_id=$1 LIMIT 1",
        [project.id],
      );
      await expect(ownedJob(other, job.rows[0].id)).rejects.toMatchObject({
        status: 404,
      });
    }, 20000);

    it("commits simultaneous duplicates once with one immutable revision", async () => {
      const project = await createProject(owner, "blank", "Before");
      const input = { type: "update_production" as const, title: "After" };
      const results = await Promise.all([
        runCommand(
          owner,
          project.id,
          project.revision,
          "duplicate-request",
          input,
        ),
        runCommand(
          owner,
          project.id,
          project.revision,
          "duplicate-request",
          input,
        ),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(results[0].revision).toBe(project.revision + 1);
      expect(
        (
          await getPool().query(
            "SELECT revision FROM sc_revisions WHERE project_id=$1",
            [project.id],
          )
        ).rows,
      ).toHaveLength(2);
      await expect(
        runCommand(
          owner,
          project.id,
          results[0].revision,
          "duplicate-request",
          { type: "update_production", title: "Different" },
        ),
      ).rejects.toMatchObject({ code: "COMMAND_REUSED" });
    });

    it("preserves the winner and rejects a different concurrent stale edit", async () => {
      const project = await createProject(owner, "blank", "Baseline");
      const result = await Promise.allSettled([
        runCommand(owner, project.id, project.revision, "edit-one", {
          type: "update_production",
          title: "One",
        }),
        runCommand(owner, project.id, project.revision, "edit-two", {
          type: "update_production",
          title: "Two",
        }),
      ]);
      expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
        1,
      );
      const failed = result.find(
        (item) => item.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failed.reason).toMatchObject({
        status: 409,
        code: "REVISION_CONFLICT",
      });
      expect((await ownedProject(owner, project.id)).revision).toBe(
        project.revision + 1,
      );
    });

    it("exports bounded current data and a verifiable manifest of owner-readable frozen revisions", async () => {
      const project = await createProject(owner, "blank", "Frozen title");
      const after = await runCommand(
        owner,
        project.id,
        project.revision,
        "export-edit",
        { type: "update_production", title: "Current title" },
      );
      const exported = await exportProject(owner, project.id, "Named operator");
      expect(exported.project.title).toBe("Current title");
      expect(exported.revisions).toHaveLength(2);
      expect(exported.revisions[0]).not.toHaveProperty("project");
      const frozen = await ownedRevision(owner, project.id, project.revision);
      expect(JSON.parse(frozen.text).title).toBe("Frozen title");
      expect(frozen.currentRevision).toBe(after.revision);
      const { createHash } = await import("node:crypto");
      expect(createHash("sha256").update(frozen.text).digest("hex")).toBe(
        exported.revisions[0].snapshotSha256,
      );
      await expect(
        ownedRevision(other, project.id, project.revision),
      ).rejects.toMatchObject({ status: 404 });
      const summaries = await listProjects(owner);
      expect(summaries[0]).toMatchObject({
        title: "Current title",
        characterCount: 0,
        sceneCount: 0,
      });
      expect(summaries[0]).not.toHaveProperty("script");
    });

    it("blocks proposal adoption after an intervening production mutation", async () => {
      let project = await createProject(owner, "example");
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "propose-coat",
        {
          type: "propose_change",
          kind: "garment_unavailable",
          subjectId: "unit-coat-oxblood",
          replacementId: "unit-coat-charcoal",
          seeded: true,
        },
      );
      const proposal = project.proposals.at(-1)!;
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "other-edit",
        { type: "update_production", subtitle: "A concurrent edit" },
      );
      await expect(
        runCommand(owner, project.id, project.revision, "stale-adoption", {
          type: "adopt_repair",
          proposalId: proposal.id,
          optionId: proposal.options.find(
            (option) => option.replacementUnitId === "unit-coat-charcoal",
          )!.id,
        }),
      ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
      expect((await ownedProject(owner, project.id)).revision).toBe(
        project.revision,
      );
    }, 20000);

    it("binds a charcoal recording to an unapproved candidate while preserving baseline review", async () => {
      let project = await createProject(owner, "example");
      const initial = project.looks.find((look) => look.id === "look-nora")!;
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "approve-baseline",
        {
          type: "approve_look",
          lookId: initial.id,
          previewId: initial.previews[0].id,
          approvedBy: "Synthetic scenario operator",
          rationale: "Appearance exercise only; physical fit remains unknown.",
        },
      );
      const candidateId = "candidate-nora-charcoal";
      const job = await createPreviewJob(owner, project.id, {
        lookId: initial.id,
        candidateId,
        mode: "recorded",
        commandId: "recorded-repair",
        expectedRevision: project.revision,
      });
      expect(presentJob(job)).toMatchObject({
        state: "succeeded",
        estimatedUnits: 0,
      });
      project = await ownedProject(owner, project.id);
      const look = project.looks.find((item) => item.id === initial.id)!;
      const candidate = project.appearanceCandidates!.find(
        (item) => item.id === candidateId,
      )!;
      expect(candidate.previews.at(-1)).toMatchObject({
        recipeRevision: 1,
        candidateId,
        inputHash: candidateInputHash(project, candidate),
        imageUrl: "/examples/previews/nora-charcoal.webp",
      });
      expect(candidate.approvals).toHaveLength(0);
      expect(look.unitIds).toEqual(["unit-coat-oxblood"]);
      expect(
        look.approvals.some((approval) => approval.state === "current"),
      ).toBe(true);
    }, 30000);

    it("reuses an exact prospective recast recording without adopting or approving it", async () => {
      let project = await createProject(owner, "example");
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "create-recast-study",
        {
          type: "create_candidate",
          lookId: "look-nora",
          unitIds: ["unit-coat-oxblood"],
          performerId: "performer-celeste",
        },
      );
      const candidateId = project.appearanceCandidates!.at(-1)!.id;
      const job = await createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        candidateId,
        mode: "recorded",
        commandId: "recorded-recast",
      });
      expect(job.state).toBe("succeeded");
      project = await ownedProject(owner, project.id);
      const look = project.looks.find((item) => item.id === "look-nora")!;
      const candidate = project.appearanceCandidates!.find(
        (item) => item.id === candidateId,
      )!;
      expect(candidate.previews.at(-1)).toMatchObject({
        performerId: "performer-celeste",
        recipeRevision: 1,
        candidateId,
        captureVersion: project.performers.find(
          (item) => item.id === "performer-celeste",
        )!.captureVersion,
        imageUrl: "/examples/previews/nora-celeste.webp",
      });
      expect(look.performerId).toBe("performer-ada");
      expect(candidate.approvals).toHaveLength(0);
      expect(look.approvals).toHaveLength(0);
    }, 30000);

    it("revokes pending uploads but retains their token deadline for late-arrival cleanup", async () => {
      let project = await createProject(owner, "example");
      const intent = await createUploadIntent(owner, {
        projectId: project.id,
        purpose: "performer",
        subjectId: "performer-ada",
        contentType: "image/jpeg",
        bytes: 5000,
        consent: true,
        rightsConfirmed: true,
      });
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "withdraw",
        { type: "withdraw_consent", performerId: "performer-ada" },
      );
      await expect(
        authorizeUpload(owner, intent.pathname),
      ).rejects.toMatchObject({ status: 404 });
      const row = (
        await getPool().query<{ expires_at: Date; revoked_at: Date }>(
          "SELECT expires_at,revoked_at FROM sc_upload_intents WHERE pathname=$1",
          [intent.pathname],
        )
      ).rows[0];
      expect(new Date(row.expires_at).toISOString()).toBe(intent.expiresAt);
      expect(row.revoked_at).not.toBeNull();
      expect(
        project.performers.find((item) => item.id === "performer-ada")!.consent
          .granted,
      ).toBe(false);
    }, 20000);

    it("does not let another browser read or attach a validated private source", async () => {
      let project = await createProject(owner, "example");
      const asset = await transaction((client) =>
        insertAsset(client, {
          id: randomUUID(),
          projectId: project.id,
          ownerId: owner,
          subjectId: "performer-ada",
          purpose: "performer",
          pathname: `stagecraft/test/${randomUUID()}.jpg`,
          photo: {
            bytes: Buffer.from("placeholder"),
            width: 512,
            height: 768,
            sha256: "0".repeat(64),
          },
          provenance: "manual",
        }),
      );
      await expect(ownedAsset(other, asset.id)).rejects.toMatchObject({
        status: 404,
      });
      const otherProject = await createProject(other, "example");
      await expect(
        runCommand(
          other,
          otherProject.id,
          otherProject.revision,
          "cross-owner-asset",
          {
            type: "update_performer",
            performerId: "performer-ada",
            assetId: asset.id,
            imageUrl: `/api/assets/${asset.id}`,
          },
        ),
      ).rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "withdraw-private",
        { type: "withdraw_consent", performerId: "performer-ada" },
      );
      await expect(ownedAsset(owner, asset.id)).rejects.toMatchObject({
        status: 404,
      });
    }, 30000);

    it("rejects an uploaded object whose metadata exceeds its scoped byte permission", async () => {
      const project = await createProject(owner, "example");
      const intent = await createUploadIntent(owner, {
        projectId: project.id,
        purpose: "performer",
        subjectId: "performer-ada",
        contentType: "image/jpeg",
        bytes: 5000,
        consent: true,
        rightsConfirmed: true,
      });
      const input = {
        pathname: intent.pathname,
        projectId: project.id,
        purpose: "performer" as const,
        subjectId: "performer-ada",
      };
      await expect(finalizeUpload(other, input)).rejects.toMatchObject({
        status: 404,
      });
      expect(head).not.toHaveBeenCalled();
      vi.mocked(head).mockResolvedValue({
        pathname: intent.pathname,
        size: 6000,
        contentType: "image/jpeg",
      } as HeadBlobResult);
      await expect(finalizeUpload(owner, input)).rejects.toMatchObject({
        code: "UPLOAD_MISMATCH",
      });
      expect(get).not.toHaveBeenCalled();
      expect((await ownedProject(owner, project.id)).revision).toBe(
        project.revision,
      );
    }, 20000);

    it("does not refill a paid daily allowance after its project is deleted", async () => {
      vi.stubEnv("YOUCAM_OWNER_DAILY_JOB_LIMIT", "1");
      const project = await createProject(owner, "example");
      const reserved = await createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        mode: "live",
        commandId: "paid-intent",
      });
      await getPool().query(
        "UPDATE sc_jobs SET submission_started_at=now(),state='submitting' WHERE id=$1",
        [reserved.id],
      );
      await deleteProject(owner, project.id);
      await getPool().query(
        "DELETE FROM sc_projects WHERE id=$1 AND deleted_at IS NOT NULL",
        [project.id],
      );
      const next = await createProject(owner, "example");
      await expect(
        createPreviewJob(owner, next.id, {
          lookId: "look-nora",
          mode: "live",
          commandId: "cannot-refill",
        }),
      ).rejects.toMatchObject({ code: "DAILY_PREVIEW_LIMIT" });
      expect(vi.mocked(submitClothesTask)).not.toHaveBeenCalled();
    }, 30000);

    async function preparedLiveJob() {
      const project = await createProject(owner, "example");
      const job = await createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        mode: "live",
        commandId: `live-${randomUUID()}`,
        expectedRevision: project.revision,
      });
      await getPool().query(
        "INSERT INTO sc_provider_files(job_id,role,state,file_id) VALUES($1,'source','uploaded','saved-source'),($1,'garment','uploaded','saved-garment')",
        [job.id],
      );
      return { project, job };
    }

    it("stops a lost paid response and never submits a second time", async () => {
      const { job } = await preparedLiveJob();
      vi.mocked(submitClothesTask).mockRejectedValue(
        new YouCamError("unknown_submission", "Submission uncertain"),
      );
      expect(await submitPreviewStep(job.id)).toBe(false);
      expect((await getInternalJob(job.id))?.state).toBe("ambiguous");
      expect(await submitPreviewStep(job.id)).toBe(false);
      expect(submitClothesTask).toHaveBeenCalledOnce();
      const saved = await getInternalJob(job.id);
      expect(saved?.submission_started_at).not.toBeNull();
      expect(JSON.stringify(presentJob(saved!))).not.toMatch(
        /provider_task_id|workflow_run_id|saved-source|saved-garment/,
      );
    }, 20000);

    it("turns an interrupted submission intent into ambiguity after a restart", async () => {
      const { job } = await preparedLiveJob();
      await getPool().query(
        "UPDATE sc_jobs SET workflow_run_id='run-interrupted',submission_started_at=now(),state='submitting' WHERE id=$1",
        [job.id],
      );
      await interruptedJob(job.id, "run-interrupted");
      expect((await getInternalJob(job.id))?.state).toBe("ambiguous");
      expect(await bindRunStep(job.id, "another-run")).toBe(false);
      expect(submitClothesTask).not.toHaveBeenCalled();
    }, 20000);

    it("resumes saved file registrations and a known task without a second paid submission", async () => {
      const project = await createProject(owner, "example");
      const job = await createPreviewJob(owner, project.id, {
        lookId: "look-nora",
        mode: "live",
        commandId: "restart-files",
      });
      const request = {
        method: "PUT" as const,
        url: "https://yce-us.s3-accelerate.amazonaws.com/file?signature=private",
        headers: { "Content-Type": "image/jpeg" },
      };
      vi.mocked(registerFile)
        .mockResolvedValueOnce({ fileId: "source-file", request })
        .mockResolvedValueOnce({ fileId: "garment-file", request });
      vi.mocked(uploadRegisteredFile)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new YouCamError(
            "upload_failed",
            "Transient file upload failure",
            true,
          ),
        )
        .mockResolvedValue(undefined);
      await expect(prepareFilesStep(job.id)).rejects.toThrow();
      expect(await prepareFilesStep(job.id)).toBe(true);
      expect(registerFile).toHaveBeenCalledTimes(2);
      expect(uploadRegisteredFile).toHaveBeenCalledTimes(3);
      vi.mocked(submitClothesTask).mockResolvedValue({
        taskId: "known-provider-task",
      });
      expect(await submitPreviewStep(job.id)).toBe(true);
      await getPool().query(
        "UPDATE sc_jobs SET workflow_run_id='stopped-run' WHERE id=$1",
        [job.id],
      );
      await interruptedJob(job.id, "stopped-run");
      expect(await bindRunStep(job.id, "resumed-run")).toBe(true);
      expect(await prepareFilesStep(job.id)).toBe(true);
      expect(await submitPreviewStep(job.id)).toBe(true);
      expect(submitClothesTask).toHaveBeenCalledOnce();
      expect((await getInternalJob(job.id))?.provider_task_id).toBe(
        "known-provider-task",
      );
    }, 30000);

    it("stores a completed task atomically as one private preview", async () => {
      const { project, job } = await preparedLiveJob();
      await getPool().query(
        "UPDATE sc_jobs SET provider_task_id='completed-task',submission_started_at=now(),state='polling' WHERE id=$1",
        [job.id],
      );
      const output = await sharp({
        create: { width: 512, height: 768, channels: 3, background: "#777777" },
      })
        .jpeg()
        .toBuffer();
      vi.mocked(getClothesTask).mockResolvedValue({
        state: "success",
        outputUrl:
          "https://yce-us.s3-accelerate.amazonaws.com/result?signature=private",
      });
      vi.mocked(downloadOutput).mockResolvedValue(
        new Response(Uint8Array.from(output)).body!,
      );
      expect(await pollPreviewStep(job.id)).toBe("finished");
      expect(await pollPreviewStep(job.id)).toBe("finished");
      expect(put).toHaveBeenCalledOnce();
      expect(getClothesTask).toHaveBeenCalledOnce();
      const after = await ownedProject(owner, project.id);
      const look = after.looks.find((look) => look.id === "look-nora")!;
      expect(
        look.previews.filter(
          (preview) => preview.provenance === "live_provider",
        ),
      ).toHaveLength(1);
      expect(look.previews.at(-1)?.imageUrl).toMatch(/^\/api\/assets\//);
      expect(look.approvals).toHaveLength(0);
      expect((await getInternalJob(job.id))?.state).toBe("succeeded");
    }, 20000);

    it("does not poll or attach an output after its performer capture changes", async () => {
      const { project, job } = await preparedLiveJob();
      await getPool().query(
        "UPDATE sc_jobs SET provider_task_id='outdated-task',submission_started_at=now(),state='polling' WHERE id=$1",
        [job.id],
      );
      await runCommand(owner, project.id, project.revision, "new-source", {
        type: "update_performer",
        performerId: "performer-ada",
        imageUrl: "/assets/cast/celeste.webp",
      });
      expect(await pollPreviewStep(job.id)).toBe("finished");
      expect((await getInternalJob(job.id))?.state).toBe("cancelled");
      expect(getClothesTask).not.toHaveBeenCalled();
    }, 20000);

    it("ends a malformed provider result without retrying generation or attaching fake evidence", async () => {
      const { project, job } = await preparedLiveJob();
      await getPool().query(
        "UPDATE sc_jobs SET provider_task_id='malformed-result',submission_started_at=now(),state='polling' WHERE id=$1",
        [job.id],
      );
      vi.mocked(getClothesTask).mockResolvedValue({
        state: "success",
        outputUrl: "https://yce-us.s3-accelerate.amazonaws.com/result",
      });
      vi.mocked(downloadOutput).mockResolvedValue(
        new Response("not an image").body!,
      );
      expect(await pollPreviewStep(job.id)).toBe("finished");
      expect((await getInternalJob(job.id))?.state).toBe("failed");
      expect((await getInternalJob(job.id))?.error_code).toBe(
        "result_unusable",
      );
      expect((await ownedProject(owner, project.id)).revision).toBe(
        project.revision,
      );
      expect(submitClothesTask).not.toHaveBeenCalled();
    }, 20000);

    it("requires the current production revision before reserving a new preview", async () => {
      const project = await createProject(owner, "example");
      await runCommand(owner, project.id, project.revision, "new-title", {
        type: "update_production",
        title: "Updated production",
      });
      await expect(
        createPreviewJob(owner, project.id, {
          lookId: "look-nora",
          mode: "live",
          commandId: "stale-preview",
          expectedRevision: project.revision,
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    }, 20000);

    it("rejects extraction adoption after a newer human edit", async () => {
      let project = await createProject(owner, "example");
      const id = randomUUID();
      await getPool().query(
        "INSERT INTO sc_script_drafts(id,project_id,owner_id,command_id,base_revision,input_hash,status,draft) VALUES($1,$2,$3,'script-draft',$4,$5,'review',$6)",
        [
          id,
          project.id,
          owner,
          project.revision,
          hash({ text: project.script!.text }),
          {
            script: project.script,
            scenes: project.scenes,
            characters: project.characters,
            notices: [],
          },
        ],
      );
      project = await runCommand(
        owner,
        project.id,
        project.revision,
        "human-edit",
        { type: "update_production", subtitle: "A reviewed human change" },
      );
      await expect(
        adoptScriptDraft(owner, project.id, {
          draftId: id,
          expectedRevision: project.revision,
          commandId: "stale-script-adopt",
        }),
      ).rejects.toMatchObject({ code: "SCRIPT_DRAFT_STALE" });
      expect((await ownedProject(owner, project.id)).revision).toBe(
        project.revision,
      );
    }, 20000);
  },
);
