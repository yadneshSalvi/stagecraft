import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { del, get, head, put } from "@vercel/blob";
import type { PoolClient } from "pg";
import type { Production, ProductionCommand } from "@/lib/types";
import { applyCommand } from "@/lib/domain";
import { ApiError } from "./errors";
import { getPool, transaction } from "./db";
import { hash, isUuid, ownedProject, persistProject } from "./projects";
import { rateLimit } from "./limits";
import type { finalizeSchema, uploadIntentSchema } from "./validation";
import type { z } from "zod";
import { MAX_UPLOAD_BYTES, normalizePhoto, sha256Bytes } from "./images";
import { fixtureImageUrls } from "./media-policy";
export { MAX_UPLOAD_BYTES, normalizePhoto, sha256Bytes } from "./images";

export const storageConfigured = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export const storagePrefix = () =>
  `stagecraft/${process.env.VERCEL_ENV || "development"}`;

export interface AssetRow {
  id: string;
  project_id: string;
  owner_id: string;
  subject_id: string;
  purpose: "performer" | "garment" | "preview" | "face" | "beauty_preview";
  pathname: string;
  content_type: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  provenance: string;
  created_at: Date;
  expires_at: Date;
  deleted_at: Date | null;
}
interface UploadIntent {
  pathname: string;
  owner_id: string;
  project_id: string;
  subject_id: string;
  purpose: "performer" | "garment" | "face";
  content_type: string;
  bytes: number;
  expires_at: Date;
  finalized_asset_id: string | null;
  revoked_at: Date | null;
}
export const presentAsset = (asset: AssetRow) => ({
  id: asset.id,
  url: `/api/assets/${asset.id}`,
  width: asset.width,
  height: asset.height,
  sha256: asset.sha256,
  expiresAt: new Date(asset.expires_at).toISOString(),
});
export const normalizedUploadPath = (pathname: string) =>
  pathname.replace("/incoming/", "/normalized/").replace(/\.[a-z]+$/, ".jpg");

export async function readLimited(
  stream: ReadableStream<Uint8Array>,
  limit = MAX_UPLOAD_BYTES,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(
          413,
          "IMAGE_TOO_LARGE",
          "Choose a photo smaller than 10 MB.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function assertSubject(
  project: Production,
  purpose: "performer" | "garment" | "face",
  subjectId: string,
) {
  if (purpose !== "garment") {
    const performer = project.performers.find((item) => item.id === subjectId);
    if (!performer)
      throw new ApiError(
        404,
        "SUBJECT_NOT_FOUND",
        "Add this performer before uploading a photograph.",
      );
  } else if (!project.units.some((item) => item.id === subjectId))
    throw new ApiError(
      404,
      "SUBJECT_NOT_FOUND",
      "Add this physical unit before uploading a photograph.",
    );
}

export async function createUploadIntent(
  ownerId: string,
  input: z.infer<typeof uploadIntentSchema>,
) {
  if (!storageConfigured())
    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "Private image storage is temporarily unavailable.",
      true,
    );
  const project = await ownedProject(ownerId, input.projectId);
  assertSubject(project, input.purpose, input.subjectId);
  await rateLimit(`upload:${ownerId}`, 12, 3600);
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[input.contentType];
  const pathname = `${storagePrefix()}/incoming/${project.id}/${randomUUID()}.${extension}`;
  const result = await getPool().query<{ expires_at: Date }>(
    "INSERT INTO sc_upload_intents(pathname,owner_id,project_id,purpose,subject_id,content_type,bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING expires_at",
    [
      pathname,
      ownerId,
      project.id,
      input.purpose,
      input.subjectId,
      input.contentType,
      input.bytes,
    ],
  );
  return {
    pathname,
    projectId: project.id,
    purpose: input.purpose,
    subjectId: input.subjectId,
    expiresAt: new Date(result.rows[0].expires_at).toISOString(),
    maxBytes: MAX_UPLOAD_BYTES,
  };
}

export async function authorizeUpload(
  ownerId: string,
  pathname: string,
): Promise<UploadIntent> {
  const row = await getPool().query<UploadIntent>(
    "SELECT i.* FROM sc_upload_intents i JOIN sc_projects p ON p.id=i.project_id WHERE i.pathname=$1 AND i.owner_id=$2 AND i.expires_at>now() AND i.revoked_at IS NULL AND i.finalized_asset_id IS NULL AND p.deleted_at IS NULL AND p.expires_at>now()",
    [pathname, ownerId],
  );
  const intent = row.rows[0];
  if (!intent)
    throw new ApiError(
      404,
      "UPLOAD_EXPIRED",
      "This upload permission expired. Choose the photo again.",
    );
  await rateLimit(`upload-token:${ownerId}`, 20, 3600);
  return intent;
}

export async function finalizeUpload(
  ownerId: string,
  input: z.infer<typeof finalizeSchema>,
) {
  const project = await ownedProject(ownerId, input.projectId);
  assertSubject(project, input.purpose, input.subjectId);
  const result = await getPool().query<UploadIntent>(
    "SELECT * FROM sc_upload_intents WHERE pathname=$1 AND owner_id=$2 AND project_id=$3 AND purpose=$4 AND subject_id=$5",
    [input.pathname, ownerId, input.projectId, input.purpose, input.subjectId],
  );
  const intent = result.rows[0];
  if (!intent)
    throw new ApiError(
      404,
      "UPLOAD_NOT_FOUND",
      "Choose a photo uploaded for this subject.",
    );
  if (intent.revoked_at)
    throw new ApiError(
      410,
      "UPLOAD_REVOKED",
      "This photo permission was withdrawn. Choose a new source and record fresh permission.",
    );
  if (intent.finalized_asset_id)
    return {
      asset: presentAsset(await ownedAsset(ownerId, intent.finalized_asset_id)),
      project,
    };
  if (new Date(intent.expires_at).getTime() <= Date.now())
    throw new ApiError(
      410,
      "UPLOAD_EXPIRED",
      "This upload permission expired. Choose the photo again.",
    );
  const metadata = await head(intent.pathname);
  if (
    metadata.pathname !== intent.pathname ||
    metadata.contentType !== intent.content_type ||
    metadata.size !== intent.bytes ||
    metadata.size > MAX_UPLOAD_BYTES
  )
    throw new ApiError(
      422,
      "UPLOAD_MISMATCH",
      "The uploaded file did not match its permission. Choose it again.",
    );
  const object = await get(intent.pathname, {
    access: "private",
    useCache: false,
  });
  if (!object || object.statusCode !== 200)
    throw new ApiError(
      404,
      "UPLOAD_NOT_FOUND",
      "The uploaded photo could not be read. Choose it again.",
    );
  const bytes = await readLimited(object.stream);
  if (bytes.length !== intent.bytes)
    throw new ApiError(
      422,
      "UPLOAD_MISMATCH",
      "The uploaded file did not match its permission. Choose it again.",
    );
  const photo = await normalizePhoto(
    bytes,
    intent.content_type,
    input.purpose === "face" ? "face" : "garment",
  );
  return transaction(async (client) => {
    const before = await ownedProject(ownerId, input.projectId, client, true);
    const locked = await client.query<UploadIntent>(
      "SELECT * FROM sc_upload_intents WHERE pathname=$1 FOR UPDATE",
      [input.pathname],
    );
    const current = locked.rows[0];
    if (current.revoked_at)
      throw new ApiError(
        410,
        "UPLOAD_REVOKED",
        "This photo permission was withdrawn. Choose a new source and record fresh permission.",
      );
    if (current.finalized_asset_id)
      return {
        asset: presentAsset(
          await ownedAsset(ownerId, current.finalized_asset_id, client),
        ),
        project: before,
      };
    if (new Date(current.expires_at).getTime() <= Date.now())
      throw new ApiError(
        410,
        "UPLOAD_EXPIRED",
        "This upload permission expired. Choose the photo again.",
      );
    assertSubject(before, input.purpose, input.subjectId);
    const id = randomUUID();
    const pathname = normalizedUploadPath(input.pathname);
    // This deterministic private destination is derivable from the persisted
    // upload intent, so a crash before commit leaves a discoverable orphan.
    await put(pathname, photo.bytes, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const asset = await insertAsset(client, {
      id,
      projectId: input.projectId,
      ownerId,
      subjectId: input.subjectId,
      purpose: input.purpose,
      pathname,
      photo,
      provenance: "manual",
    });
    const command: ProductionCommand =
      input.purpose === "face"
        ? {
            type: "update_face_capture",
            performerId: input.subjectId,
            faceCapture: {
              imageUrl: `/api/assets/${id}`,
              assetId: id,
              version:
                (before.performers.find(
                  (performer) => performer.id === input.subjectId,
                )?.faceCapture?.version || 0) + 1,
              synthetic: false,
              consent: {
                granted: true,
                purpose:
                  "Separate beauty detail previews for this private production",
                publicDemo: false,
                recordedAt: new Date().toISOString(),
              },
            },
          }
        : input.purpose === "performer"
          ? {
              type: "update_performer",
              performerId: input.subjectId,
              imageUrl: `/api/assets/${id}`,
              assetId: id,
              consent: {
                granted: true,
                purpose:
                  "Costume appearance previews for this private production",
                publicDemo: false,
                recordedAt: new Date().toISOString(),
              },
            }
          : {
              type: "update_unit",
              unitId: input.subjectId,
              imageUrl: `/api/assets/${id}`,
              assetId: id,
            };
    const after = applyCommand(before, command, {
      actor: ownerId,
      now: new Date().toISOString(),
      id: randomUUID(),
    });
    await persistProject(
      client,
      before,
      after,
      `upload-${id}`,
      hash({ command }),
    );
    await client.query(
      "UPDATE sc_upload_intents SET finalized_asset_id=$2 WHERE pathname=$1",
      [input.pathname, id],
    );
    return { asset: presentAsset(asset), project: after };
  });
}

export async function insertAsset(
  client: PoolClient,
  input: {
    id: string;
    projectId: string;
    ownerId: string;
    subjectId: string;
    purpose: AssetRow["purpose"];
    pathname: string;
    photo: { bytes: Buffer; width: number; height: number; sha256: string };
    provenance: string;
  },
): Promise<AssetRow> {
  const result = await client.query<AssetRow>(
    "INSERT INTO sc_assets(id,project_id,owner_id,subject_id,purpose,pathname,content_type,bytes,sha256,width,height,provenance) VALUES($1,$2,$3,$4,$5,$6,'image/jpeg',$7,$8,$9,$10,$11) RETURNING *",
    [
      input.id,
      input.projectId,
      input.ownerId,
      input.subjectId,
      input.purpose,
      input.pathname,
      input.photo.bytes.length,
      input.photo.sha256,
      input.photo.width,
      input.photo.height,
      input.provenance,
    ],
  );
  return result.rows[0];
}

export async function ownedAsset(
  ownerId: string,
  assetId: string,
  client?: PoolClient,
): Promise<AssetRow> {
  if (!isUuid(assetId))
    throw new ApiError(
      404,
      "IMAGE_NOT_FOUND",
      "This image could not be found.",
    );
  const result = await (client || getPool()).query<AssetRow>(
    "SELECT a.* FROM sc_assets a JOIN sc_projects p ON p.id=a.project_id WHERE a.id=$1 AND a.owner_id=$2 AND a.deleted_at IS NULL AND a.expires_at>now() AND p.deleted_at IS NULL AND p.expires_at>now()",
    [assetId, ownerId],
  );
  const asset = result.rows[0];
  if (!asset)
    throw new ApiError(
      404,
      "IMAGE_NOT_FOUND",
      "This image could not be found.",
    );
  if (asset.purpose !== "garment") {
    const project = await ownedProject(ownerId, asset.project_id, client);
    const performer = project.performers.find(
      (item) => item.id === asset.subject_id,
    );
    const granted =
      asset.purpose === "face" || asset.purpose === "beauty_preview"
        ? performer?.faceCapture?.consent.granted
        : performer?.consent.granted;
    if (!granted)
      throw new ApiError(
        410,
        "CONSENT_WITHDRAWN",
        "Permission to use this performer's image has been withdrawn.",
      );
  }
  return asset;
}

export async function readAssetBytes(
  ownerId: string,
  assetId: string,
): Promise<Buffer> {
  const asset = await ownedAsset(ownerId, assetId);
  const object = await get(asset.pathname, {
    access: "private",
    useCache: false,
  });
  if (!object || object.statusCode !== 200)
    throw new ApiError(
      404,
      "IMAGE_NOT_FOUND",
      "This image is temporarily unavailable.",
      true,
    );
  const bytes = await readLimited(object.stream);
  if (sha256Bytes(bytes) !== asset.sha256)
    throw new ApiError(
      503,
      "IMAGE_INTEGRITY",
      "This image needs to be checked before use.",
      true,
    );
  return bytes;
}

export async function assetResponse(ownerId: string, assetId: string) {
  const bytes = await readAssetBytes(ownerId, assetId);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function publicImagePath(pathname: string) {
  if (!fixtureImageUrls.has(pathname))
    throw new ApiError(
      422,
      "IMAGE_NOT_ALLOWED",
      "Choose a permitted image from this production.",
    );
  return join(process.cwd(), "public", pathname);
}

// Licensed public fixture bytes only. Private performer captures are never
// retained in this module cache. Hash each file read so asset changes invalidate it.
const publicInputCache = new Map<
  string,
  Awaited<ReturnType<typeof normalizePhoto>> & { originalSha256: string }
>();
export async function readInputImage(
  ownerId: string,
  input: { imageUrl: string | null; assetId: string | null },
  profile: "garment" | "face" = "garment",
) {
  let bytes: Buffer;
  if (input.assetId) {
    const asset = await ownedAsset(ownerId, input.assetId);
    if (profile === "face" && asset.purpose !== "face")
      throw new ApiError(
        422,
        "FACE_CAPTURE_REQUIRED",
        "Upload a separate permitted face capture for beauty details.",
      );
    bytes = await readAssetBytes(ownerId, input.assetId);
    return {
      bytes,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      originalSha256: asset.sha256,
    };
  } else if (input.imageUrl)
    bytes = await readFile(publicImagePath(input.imageUrl));
  else
    throw new ApiError(
      422,
      "IMAGE_REQUIRED",
      "Add a permitted source image before generating a preview.",
    );
  const originalSha256 = sha256Bytes(bytes);
  const cacheKey = `${profile}:${input.imageUrl}`;
  const cached = publicInputCache.get(cacheKey);
  if (cached?.originalSha256 === originalSha256) return cached;
  const photo = await normalizePhoto(bytes, undefined, profile);
  const result = { ...photo, originalSha256 };
  publicInputCache.set(cacheKey, result);
  return result;
}

export async function eraseAssetObjects(projectId: string, subjectId?: string) {
  const assets = await getPool().query<{ id: string; pathname: string }>(
    `SELECT id,pathname FROM sc_assets WHERE project_id=$1 AND storage_deleted_at IS NULL AND deleted_at IS NOT NULL${subjectId ? " AND subject_id=$2" : ""}`,
    subjectId ? [projectId, subjectId] : [projectId],
  );
  const uploads = await getPool().query<{ pathname: string }>(
    `SELECT pathname FROM sc_upload_intents WHERE project_id=$1 AND storage_deleted_at IS NULL AND revoked_at IS NOT NULL${subjectId ? " AND subject_id=$2" : ""}`,
    subjectId ? [projectId, subjectId] : [projectId],
  );
  const jobs = await getPool().query<{ id: string }>(
    `SELECT id FROM sc_jobs WHERE project_id=$1 AND cancel_requested${subjectId ? " AND input->>'performerId'=$2" : ""}`,
    subjectId ? [projectId, subjectId] : [projectId],
  );
  const paths = [
    ...assets.rows.map((row) => row.pathname),
    ...uploads.rows.flatMap((row) => [
      row.pathname,
      normalizedUploadPath(row.pathname),
    ]),
    ...jobs.rows.map(
      (row) => `${storagePrefix()}/results/${projectId}/${row.id}.jpg`,
    ),
  ];
  if (paths.length) await del([...new Set(paths)]);
  if (assets.rows.length)
    await getPool().query(
      "UPDATE sc_assets SET storage_deleted_at=now() WHERE id=ANY($1::uuid[])",
      [assets.rows.map((row) => row.id)],
    );
  if (uploads.rows.length)
    await getPool().query(
      "UPDATE sc_upload_intents SET storage_deleted_at=now() WHERE pathname=ANY($1::text[]) AND expires_at<now()",
      [uploads.rows.map((row) => row.pathname)],
    );
}
