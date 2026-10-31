import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { authorizeUpload } from "@/lib/server/assets";
import { handle, json, readJson } from "@/lib/server/http";
import { ApiError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await readJson(request, 16384)) as HandleUploadBody;
    if (
      !body ||
      !["blob.generate-client-token", "blob.upload-completed"].includes(
        body.type,
      )
    )
      throw new ApiError(
        400,
        "INVALID_UPLOAD",
        "This upload request could not be read.",
      );
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        assertSameOrigin(request);
        const ownerId = await requireOwner(request);
        if (multipart)
          throw new ApiError(
            422,
            "MULTIPART_NOT_NEEDED",
            "Use a single photo smaller than 10 MB.",
          );
        const intent = await authorizeUpload(ownerId, pathname);
        let payload: unknown;
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "This upload request could not be read.",
          );
        }
        if (
          !payload ||
          typeof payload !== "object" ||
          !("projectId" in payload) ||
          payload.projectId !== intent.project_id ||
          !("purpose" in payload) ||
          payload.purpose !== intent.purpose ||
          !("subjectId" in payload) ||
          payload.subjectId !== intent.subject_id
        )
          throw new ApiError(
            403,
            "UPLOAD_SCOPE",
            "This upload permission belongs to another subject.",
          );
        return {
          allowedContentTypes: [intent.content_type],
          maximumSizeInBytes: intent.bytes,
          validUntil: Math.min(
            Date.now() + 15 * 60_000,
            new Date(intent.expires_at).getTime(),
          ),
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return json(result);
  });
}
