import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Production, ProductionCommand } from "@/lib/types";
import {
  applyCommand,
  createBlankProduction,
  createExampleProduction,
} from "@/lib/domain";
import { getPool, transaction } from "./db";
import { ApiError, missingProject, revisionConflict } from "./errors";
import { rateLimit } from "./limits";
import { fixtureImageUrls } from "./media-policy";

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

export async function ownedProject(
  ownerId: string,
  projectId: string,
  client?: PoolClient,
  lock = false,
): Promise<Production> {
  if (!isUuid(projectId)) throw missingProject();
  const result = await (client || getPool()).query<{ snapshot: Production }>(
    `SELECT snapshot FROM sc_projects WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND expires_at>now()${lock ? " FOR UPDATE" : ""}`,
    [projectId, ownerId],
  );
  if (!result.rows[0]) throw missingProject();
  return result.rows[0].snapshot;
}

export async function persistProject(
  client: PoolClient,
  before: Production | null,
  after: Production,
  commandId: string,
  commandHash: string,
) {
  if (
    after.revision > 500 ||
    Buffer.byteLength(JSON.stringify(after), "utf8") > 1_500_000
  )
    throw new ApiError(
      413,
      "PRODUCTION_CAPACITY",
      "This production has reached its working-copy limit. Export it before starting a new copy.",
    );
  if (before)
    await client.query(
      "UPDATE sc_projects SET snapshot=$2,revision=$3,updated_at=now() WHERE id=$1",
      [after.id, after, after.revision],
    );
  await client.query(
    "INSERT INTO sc_revisions(project_id,revision,snapshot,command_id) VALUES($1,$2,$3,$4)",
    [after.id, after.revision, after, commandId],
  );
  await client.query(
    "INSERT INTO sc_commands(project_id,command_id,command_hash,result_revision) VALUES($1,$2,$3,$4)",
    [after.id, commandId, commandHash, after.revision],
  );
  const known = new Set(before?.events.map((event) => event.id) || []);
  for (const event of after.events)
    if (!known.has(event.id))
      await client.query(
        "INSERT INTO sc_events(project_id,id,revision,event) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [after.id, event.id, event.revision, event],
      );
}

export async function replayCommand(
  client: PoolClient,
  projectId: string,
  commandId: string,
  commandHash: string,
): Promise<Production | null> {
  const previous = await client.query<{
    command_hash: string;
    snapshot: Production;
  }>(
    "SELECT c.command_hash,r.snapshot FROM sc_commands c JOIN sc_revisions r ON r.project_id=c.project_id AND r.revision=c.result_revision WHERE c.project_id=$1 AND c.command_id=$2",
    [projectId, commandId],
  );
  if (!previous.rows[0]) return null;
  if (previous.rows[0].command_hash !== commandHash)
    throw new ApiError(
      409,
      "COMMAND_REUSED",
      "This request identifier was already used for another change. Try again with a new request.",
    );
  return previous.rows[0].snapshot;
}

export async function createProject(
  ownerId: string,
  mode: "blank" | "example",
  title?: string,
): Promise<Production> {
  await rateLimit(`create:${ownerId}`, 8, 3600);
  const created = await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `projects:${ownerId}`,
    ]);
    const count = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM sc_projects WHERE owner_id=$1 AND deleted_at IS NULL",
      [ownerId],
    );
    if (Number(count.rows[0].n) >= 12)
      throw new ApiError(
        429,
        "PROJECT_LIMIT",
        "This browser has twelve productions. Export or delete one before creating another.",
      );
    const id = randomUUID();
    const now = new Date().toISOString();
    const project =
      mode === "example"
        ? createExampleProduction(id, now)
        : createBlankProduction(id, title || "Untitled production", now);
    await client.query(
      "INSERT INTO sc_projects(id,owner_id,revision,snapshot) VALUES($1,$2,$3,$4)",
      [id, ownerId, project.revision, project],
    );
    await persistProject(
      client,
      null,
      project,
      "create",
      hash({ mode, title: title || "" }),
    );
    return project;
  });
  if (mode === "example") {
    const { attachExampleRecordings } = await import("./jobs");
    return attachExampleRecordings(ownerId, created);
  }
  return created;
}

export interface ProductionSummary {
  id: string;
  title: string;
  fixture: boolean;
  revision: number;
  updatedAt: string;
  timeZone: string;
  characterCount: number;
  sceneCount: number;
}
export async function listProjects(
  ownerId: string,
): Promise<ProductionSummary[]> {
  const result = await getPool().query<{ summary: ProductionSummary }>(
    `SELECT jsonb_build_object('id',id,'title',snapshot->'title','fixture',snapshot->'fixture','revision',revision,'updatedAt',snapshot->'updatedAt','timeZone',snapshot->'timeZone','characterCount',jsonb_array_length(snapshot->'characters'),'sceneCount',jsonb_array_length(snapshot->'scenes')) AS summary FROM sc_projects WHERE owner_id=$1 AND deleted_at IS NULL AND expires_at>now() ORDER BY updated_at DESC LIMIT 12`,
    [ownerId],
  );
  return result.rows.map((row) => row.summary);
}

async function validateAssetReference(
  client: PoolClient,
  ownerId: string,
  projectId: string,
  purpose: string,
  subjectId: string,
  assetId?: string | null,
  imageUrl?: string | null,
) {
  if (assetId) {
    if (imageUrl !== `/api/assets/${assetId}`)
      throw new ApiError(
        422,
        "INVALID_ASSET",
        "Choose a photo uploaded for this subject.",
      );
    const asset = await client.query(
      "SELECT id FROM sc_assets WHERE id=$1 AND owner_id=$2 AND project_id=$3 AND purpose=$4 AND subject_id=$5 AND deleted_at IS NULL AND expires_at>now()",
      [assetId, ownerId, projectId, purpose, subjectId],
    );
    if (!asset.rowCount)
      throw new ApiError(
        404,
        "ASSET_NOT_FOUND",
        "Choose a photo uploaded for this subject.",
      );
  } else if (
    imageUrl &&
    (!fixtureImageUrls.has(imageUrl) ||
      (purpose === "face"
        ? !/^\/assets\/cast\/(ada|celeste)-face\.webp$/.test(imageUrl)
        : purpose === "performer"
          ? !imageUrl.startsWith("/assets/cast/")
          : !imageUrl.startsWith("/assets/garments/")))
  )
    throw new ApiError(
      422,
      "INVALID_ASSET",
      "Choose a photo uploaded for this subject or an identified example source.",
    );
}

export async function validateCommandAssets(
  client: PoolClient,
  ownerId: string,
  project: Production,
  command: ProductionCommand,
) {
  if (command.type === "add_performer" && command.performer.faceCapture)
    throw new ApiError(
      403,
      "INTERNAL_FACE_CAPTURE",
      "Add a separate face capture through the permitted upload workflow.",
    );
  if (command.type === "update_face_capture")
    await validateAssetReference(
      client,
      ownerId,
      project.id,
      "face",
      command.performerId,
      command.faceCapture.assetId,
      command.faceCapture.imageUrl,
    );
  if (
    command.type === "add_performer" &&
    command.performer.imageUrl?.startsWith("/assets/") &&
    !command.performer.synthetic
  )
    throw new ApiError(
      422,
      "SYNTHETIC_SOURCE",
      "Example cast artwork must be identified as synthetic.",
    );
  if (command.type === "add_performer")
    await validateAssetReference(
      client,
      ownerId,
      project.id,
      "performer",
      command.performer.id,
      command.performer.assetId,
      command.performer.imageUrl,
    );
  if (command.type === "add_unit")
    await validateAssetReference(
      client,
      ownerId,
      project.id,
      "garment",
      command.unit.id,
      command.unit.assetId,
      command.unit.imageUrl,
    );
  if (
    command.type === "update_performer" &&
    (command.assetId || command.imageUrl)
  ) {
    const performer = project.performers.find(
      (item) => item.id === command.performerId,
    );
    await validateAssetReference(
      client,
      ownerId,
      project.id,
      "performer",
      command.performerId,
      command.assetId || performer?.assetId,
      command.imageUrl || performer?.imageUrl,
    );
  }
  if (
    command.type === "update_unit" &&
    ("assetId" in command || "imageUrl" in command)
  ) {
    const unit = project.units.find((item) => item.id === command.unitId);
    const update = command as ProductionCommand & {
      assetId?: string;
      imageUrl?: string;
    };
    await validateAssetReference(
      client,
      ownerId,
      project.id,
      "garment",
      command.unitId,
      update.assetId || unit?.assetId,
      update.imageUrl || unit?.imageUrl,
    );
  }
}

export async function runCommand(
  ownerId: string,
  projectId: string,
  expectedRevision: number,
  commandId: string,
  command: ProductionCommand,
  trusted = false,
): Promise<Production> {
  if (
    !trusted &&
    [
      "add_preview",
      "adopt_script",
      "add_beauty_preview",
      "update_face_capture",
    ].includes(command.type)
  )
    throw new ApiError(
      403,
      "INTERNAL_COMMAND",
      "This change must be produced by the application.",
    );
  return transaction(async (client) => {
    const before = await ownedProject(ownerId, projectId, client, true);
    const commandHash = hash({ command });
    const replay = await replayCommand(
      client,
      projectId,
      commandId,
      commandHash,
    );
    if (replay) return replay;
    if (before.revision !== expectedRevision) throw revisionConflict();
    if (before.revision >= 500)
      throw new ApiError(
        422,
        "REVISION_LIMIT",
        "Export this production before starting a fresh working copy; its 500-revision history is full.",
      );
    await validateCommandAssets(client, ownerId, before, command);
    const after = applyCommand(before, command, {
      actor: ownerId,
      now: new Date().toISOString(),
      id: randomUUID(),
    });
    await persistProject(client, before, after, commandId, commandHash);
    if (command.type === "withdraw_consent") {
      await client.query(
        "UPDATE sc_assets SET deleted_at=COALESCE(deleted_at,now()) WHERE project_id=$1 AND subject_id=$2 AND purpose IN ('performer','preview','face','beauty_preview')",
        [projectId, command.performerId],
      );
      await client.query(
        "UPDATE sc_upload_intents SET revoked_at=COALESCE(revoked_at,now()) WHERE project_id=$1 AND subject_id=$2 AND purpose IN ('performer','face')",
        [projectId, command.performerId],
      );
      await client.query(
        "UPDATE sc_jobs SET cancel_requested=true,state=CASE WHEN state='succeeded' THEN state ELSE 'cancelled' END,updated_at=now() WHERE project_id=$1 AND input->>'performerId'=$2",
        [projectId, command.performerId],
      );
    }
    if (command.type === "withdraw_face_consent") {
      await client.query(
        "UPDATE sc_assets SET deleted_at=COALESCE(deleted_at,now()) WHERE project_id=$1 AND subject_id=$2 AND purpose IN ('face','beauty_preview')",
        [projectId, command.performerId],
      );
      await client.query(
        "UPDATE sc_upload_intents SET revoked_at=COALESCE(revoked_at,now()) WHERE project_id=$1 AND subject_id=$2 AND purpose='face'",
        [projectId, command.performerId],
      );
      await client.query(
        "UPDATE sc_jobs SET cancel_requested=true,state=CASE WHEN state='succeeded' THEN state ELSE 'cancelled' END,updated_at=now() WHERE project_id=$1 AND input->>'performerId'=$2 AND kind='beauty'",
        [projectId, command.performerId],
      );
    }
    return after;
  });
}

export async function deleteProject(ownerId: string, projectId: string) {
  await transaction(async (client) => {
    await ownedProject(ownerId, projectId, client, true);
    await client.query("UPDATE sc_projects SET deleted_at=now() WHERE id=$1", [
      projectId,
    ]);
    await client.query(
      "UPDATE sc_assets SET deleted_at=COALESCE(deleted_at,now()) WHERE project_id=$1",
      [projectId],
    );
    await client.query(
      "UPDATE sc_jobs SET cancel_requested=true,state=CASE WHEN state='succeeded' THEN state ELSE 'cancelled' END,updated_at=now() WHERE project_id=$1",
      [projectId],
    );
    await client.query(
      "UPDATE sc_upload_intents SET revoked_at=COALESCE(revoked_at,now()) WHERE project_id=$1",
      [projectId],
    );
  });
}

export async function exportProject(
  ownerId: string,
  projectId: string,
  exportedBy: string,
) {
  return transaction(async (client) => {
    const project = await ownedProject(ownerId, projectId, client, true);
    const revisions = await client.query<{
      revision: number;
      snapshot_sha256: string;
      command_id: string;
      created_at: Date;
    }>(
      "SELECT revision,command_id,created_at,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') AS snapshot_sha256 FROM sc_revisions WHERE project_id=$1 ORDER BY revision LIMIT 500",
      [projectId],
    );
    return {
      format: "stagecraft.production/v1",
      exportedBy,
      exportedAt: new Date().toISOString(),
      currentRevision: project.revision,
      project,
      hashEncoding: "sha256/utf8/postgresql-jsonb-text",
      revisions: revisions.rows.map((row) => ({
        revision: row.revision,
        savedAt: new Date(row.created_at).toISOString(),
        commandId: row.command_id,
        snapshotSha256: row.snapshot_sha256,
        snapshotUrl: `/api/projects/${projectId}/revisions/${row.revision}?download=1`,
      })),
      notice:
        "Generated appearance previews do not establish physical fit, availability, supplier confirmation, or participant outcomes. Private images require the owning browser session and expire after 30 days.",
    };
  });
}

export async function ownedRevision(
  ownerId: string,
  projectId: string,
  revision: number,
) {
  const project = await ownedProject(ownerId, projectId);
  if (!Number.isInteger(revision) || revision < 1 || revision > 500)
    throw new ApiError(
      404,
      "REVISION_NOT_FOUND",
      "This saved revision could not be found.",
    );
  const result = await getPool().query<{
    snapshot_text: string;
    snapshot_sha256: string;
  }>(
    "SELECT snapshot::text AS snapshot_text,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') AS snapshot_sha256 FROM sc_revisions WHERE project_id=$1 AND revision=$2",
    [projectId, revision],
  );
  if (!result.rows[0])
    throw new ApiError(
      404,
      "REVISION_NOT_FOUND",
      "This saved revision could not be found.",
    );
  return {
    currentRevision: project.revision,
    text: result.rows[0].snapshot_text,
    sha256: result.rows[0].snapshot_sha256,
  };
}
