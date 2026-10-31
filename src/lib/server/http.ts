import "server-only";
import { ZodError } from "zod";
import { ApiError } from "./errors";

/** Bound the stream before reading JSON, including requests with no Content-Length. */
export async function readJson(
  request: Request,
  limit = 131_072,
): Promise<unknown> {
  const size = request.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > limit))
    throw new ApiError(413, "REQUEST_TOO_LARGE", "This request is too large.");
  if (!request.body)
    throw new ApiError(400, "INVALID_JSON", "This request could not be read.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ApiError(
          413,
          "REQUEST_TOO_LARGE",
          "This request is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "This request could not be read.");
  }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function failure(error: unknown): Response {
  if (error instanceof ApiError)
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      error.status,
    );
  if (error instanceof ZodError)
    return json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Please check the fields and try again.",
          retryable: false,
        },
      },
      400,
    );
  // Domain errors are deliberately mapped to fixed user messages, never arbitrary
  // thrown text, which might contain script content or private transport URLs.
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    SCRIPT_SCENE_REMOVED:
      "This draft omits scenes still used by the production. Keep all scheduled scenes in the revised script, or import the shorter script into a new production.",
    SCRIPT_CHARACTER_REMOVED:
      "This draft omits a character still used by the production. Keep that character in the revised breakdown, or resolve their existing looks and schedule before extracting a new draft.",
    STALE_PROPOSAL:
      "The production changed after this proposal. Recompute it before adopting.",
    stale_proposal:
      "The production changed after this proposal. Recompute it before adopting.",
    STALE_ALLOCATION:
      "The production changed after this allocation. Solve it again before adopting.",
    stale_allocation:
      "The production changed after this allocation. Solve it again before adopting.",
    CONSENT_REQUIRED:
      "This performer needs to grant photo permission before continuing.",
    consent_required:
      "This performer needs to grant photo permission before continuing.",
  };
  if (error instanceof Error && error.name === "DomainError")
    return json(
      {
        error: {
          code: /^[a-zA-Z_]{1,80}$/.test(code)
            ? code.toUpperCase()
            : "INVALID_TRANSITION",
          message:
            messages[code] ||
            "This change is not valid for the current production. Refresh and review the related evidence.",
          retryable: false,
        },
      },
      /stale/i.test(code) ? 409 : 422,
    );
  console.error("[api] request_unavailable");
  return json(
    {
      error: {
        code: "TEMPORARILY_UNAVAILABLE",
        message:
          "The production workspace could not connect just now. Your saved work is preserved. Please try again.",
        retryable: true,
      },
    },
    503,
  );
}

export async function handle(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    return failure(error);
  }
}
