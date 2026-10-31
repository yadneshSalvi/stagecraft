import "server-only";
import { timingSafeEqual } from "node:crypto";
import { del } from "@vercel/blob";
import { eraseAssetObjects, normalizedUploadPath } from "./assets";
import { getPool, transaction } from "./db";
import { dispatchPreview } from "./dispatch";
import { ApiError } from "./errors";

export function requireCron(request: Request) {
  if (!process.env.CRON_SECRET)
    throw new ApiError(
      503,
      "CLEANUP_UNAVAILABLE",
      "Scheduled cleanup is not configured.",
    );
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "This operation requires scheduled maintenance authorization.",
    );
}

export async function cleanup() {
  await transaction(async (client) => {
    await client.query(
      "UPDATE sc_projects SET deleted_at=COALESCE(deleted_at,now()) WHERE expires_at<=now()",
    );
    await client.query(
      "UPDATE sc_assets a SET deleted_at=COALESCE(a.deleted_at,now()) FROM sc_projects p WHERE a.project_id=p.id AND (p.deleted_at IS NOT NULL OR a.expires_at<=now())",
    );
    await client.query(
      "UPDATE sc_upload_intents i SET revoked_at=COALESCE(i.revoked_at,now()) FROM sc_projects p WHERE i.project_id=p.id AND p.deleted_at IS NOT NULL",
    );
    await client.query(
      "UPDATE sc_jobs j SET cancel_requested=true,state=CASE WHEN j.state='succeeded' THEN j.state ELSE 'cancelled' END FROM sc_projects p WHERE j.project_id=p.id AND p.deleted_at IS NOT NULL",
    );
    await client.query(
      "UPDATE sc_script_drafts SET status='failed',error_code='EXTRACTION_INTERRUPTED' WHERE status='extracting' AND created_at<now()-interval '2 minutes'",
    );
  });
  const deleted = await getPool().query<{ id: string }>(
    "SELECT id FROM sc_projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at LIMIT 20",
  );
  let erased = 0;
  for (const project of deleted.rows) {
    await eraseAssetObjects(project.id);
    const removed = await getPool().query(
      "DELETE FROM sc_projects p WHERE p.id=$1 AND p.deleted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sc_upload_intents i WHERE i.project_id=p.id AND i.expires_at>now())",
      [project.id],
    );
    erased += removed.rowCount || 0;
  }
  const revoked = await getPool().query<{
    project_id: string;
    subject_id: string;
  }>(
    "SELECT DISTINCT a.project_id,a.subject_id FROM sc_assets a JOIN sc_projects p ON p.id=a.project_id WHERE a.deleted_at IS NOT NULL AND a.storage_deleted_at IS NULL AND p.deleted_at IS NULL LIMIT 30",
  );
  for (const item of revoked.rows)
    await eraseAssetObjects(item.project_id, item.subject_id);
  const uploads = await getPool().query<{
    pathname: string;
    finalized_asset_id: string | null;
  }>(
    "SELECT pathname,finalized_asset_id FROM sc_upload_intents WHERE expires_at<=now() AND storage_deleted_at IS NULL LIMIT 80",
  );
  const paths = uploads.rows.flatMap((row) =>
    row.finalized_asset_id
      ? [row.pathname]
      : [row.pathname, normalizedUploadPath(row.pathname)],
  );
  if (paths.length) {
    await del([...new Set(paths)]);
    await getPool().query(
      "UPDATE sc_upload_intents SET storage_deleted_at=now() WHERE pathname=ANY($1::text[])",
      [uploads.rows.map((row) => row.pathname)],
    );
  }
  const jobs = await getPool().query<{ id: string }>(
    "SELECT id FROM sc_jobs WHERE mode='live' AND NOT cancel_requested AND state IN ('queued','preparing','submitting','polling','storing') AND updated_at<now()-interval '90 seconds' LIMIT 12",
  );
  for (const job of jobs.rows) await dispatchPreview(job.id, true);
  await getPool().query(
    "UPDATE sc_provider_files f SET upload_request=NULL FROM sc_jobs j WHERE f.job_id=j.id AND j.state IN ('succeeded','failed','cancelled') AND j.updated_at<now()-interval '2 hours'",
  );
  await getPool().query(
    "DELETE FROM sc_rate_windows WHERE window_start<now()-interval '2 days'",
  );
  await getPool().query(
    "DELETE FROM sc_quota_reservations WHERE day<(now() AT TIME ZONE 'UTC')::date-32",
  );
  await getPool().query(
    "DELETE FROM sc_provider_requests WHERE created_at<now()-interval '5 minutes'",
  );
  await getPool().query('DELETE FROM "session" WHERE "expiresAt"<now()');
  await getPool().query(
    'DELETE FROM "user" u WHERE u."createdAt"<now()-interval \'31 days\' AND NOT EXISTS(SELECT 1 FROM "session" s WHERE s."userId"=u.id) AND NOT EXISTS(SELECT 1 FROM sc_projects p WHERE p.owner_id=u.id)',
  );
  return {
    erasedProjects: erased,
    expiredUploads: uploads.rows.length,
    recoveredAttempts: jobs.rows.length,
  };
}
