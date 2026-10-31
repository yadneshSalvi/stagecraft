import "server-only";
import type { BeautyRecipe, DetailRecipe, GarmentCategory } from "@/lib/types";
import { hairColorPayload, necklacePayload } from "./details";
import { clothesPayload } from "./recipes";
import { makeupPayload } from "./beauty";
import {
  CreditBalanceResponseSchema,
  ErrorResponseSchema,
  FileResponseSchema,
  SubmitResponseSchema,
  TaskResponseSchema,
  MakeupTaskResponseSchema,
  TransportUrlSchema,
} from "./schemas";
export {
  clothesPayload,
  garmentCategory,
  unretouchedMakeupEffects,
} from "./recipes";
export {
  makeupPayload,
  makeBeautyEffects,
  BeautyRecipeSchema,
  MakeupEffectsSchema,
} from "./beauty";

export interface YouCamOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}
export type YouCamErrorCode =
  | "not_configured"
  | "invalid_input"
  | "invalid_response"
  | "authentication_failed"
  | "insufficient_credits"
  | "rate_limited"
  | "unknown_submission"
  | "provider_unavailable"
  | "provider_error"
  | "task_expired"
  | "upload_failed";
export class YouCamError extends Error {
  readonly submissionUncertain: boolean;
  constructor(
    readonly code: YouCamErrorCode,
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "YouCamError";
    this.submissionUncertain = code === "unknown_submission";
  }
}
export interface RegisteredFile {
  fileId: string;
  request: {
    url: string;
    method: "PUT" | "POST";
    headers: Record<string, string>;
  };
}
export type ClothesTaskState =
  | { state: "running" }
  | { state: "success"; outputUrl: string }
  | { state: "error"; code: string; message: string };
export const youcamConfigured = () =>
  Boolean(process.env.YOUCAM_API_KEY && process.env.YOUCAM_API_BASE_URL);

function configuration(options: YouCamOptions) {
  const baseUrl = options.baseUrl || process.env.YOUCAM_API_BASE_URL;
  const apiKey = options.apiKey || process.env.YOUCAM_API_KEY;
  try {
    if (!baseUrl || !apiKey) throw new Error();
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".makeupar.com") ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new YouCamError(
      "not_configured",
      "Live costume previews are not configured on this server.",
    );
  }
  return {
    baseUrl: baseUrl!,
    apiKey: apiKey!,
    fetcher: options.fetch || globalThis.fetch,
    timeoutMs: options.timeoutMs || 30_000,
  };
}
const uncertain = (status?: number) =>
  new YouCamError(
    "unknown_submission",
    "The provider may have received this request. It will not be sent again automatically.",
    false,
    status,
  );

function providerError(status: number, body: unknown, paid: boolean) {
  const parsed = ErrorResponseSchema.safeParse(body);
  const code = parsed.success ? parsed.data.error_code : undefined;
  if (["CreditInsufficiency", "InsufficientCredit"].includes(code || ""))
    return new YouCamError(
      "insufficient_credits",
      "The shared provider account has insufficient units. Your production is saved.",
      false,
      status,
    );
  if (status === 401 || status === 403)
    return new YouCamError(
      "authentication_failed",
      "The preview provider could not authenticate this server.",
      false,
      status,
    );
  if (status === 429)
    return new YouCamError(
      "rate_limited",
      "The preview provider is busy. Wait before a deliberate retry.",
      true,
      status,
    );
  if (status === 404 || code === "TaskTimeout")
    return new YouCamError(
      "task_expired",
      "This provider task is no longer available. Your existing production is preserved.",
      false,
      status,
    );
  if (paid && (status >= 500 || status === 408)) return uncertain(status);
  return new YouCamError(
    status >= 500 ? "provider_unavailable" : "provider_error",
    status >= 500
      ? "The preview provider is temporarily unavailable."
      : "The preview provider could not use this request. Review the source and garment images.",
    status >= 500,
    status,
  );
}

async function transport(
  url: string,
  init: RequestInit,
  options: YouCamOptions,
  paid = false,
) {
  const config = configuration(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    return await config.fetcher(url, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (paid) throw uncertain();
    throw new YouCamError(
      "provider_unavailable",
      "The provider connection did not complete. Your saved production is preserved.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function request(
  path: string,
  method: "GET" | "POST",
  body: unknown,
  options: YouCamOptions,
  paid = false,
) {
  const config = configuration(options);
  const response = await transport(
    new URL(path, config.baseUrl).href,
    {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    options,
    paid,
  );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (paid && response.ok) throw uncertain(response.status);
    throw providerError(response.ok ? 502 : response.status, undefined, paid);
  }
  const status =
    data &&
    typeof data === "object" &&
    "status" in data &&
    typeof data.status === "number"
      ? data.status
      : response.status;
  if (!response.ok || status >= 400) throw providerError(status, data, paid);
  return data;
}

export async function registerFile(
  input: {
    contentType: "image/jpeg" | "image/png";
    byteLength: number;
    fileName: string;
  },
  options: YouCamOptions = {},
): Promise<RegisteredFile> {
  if (
    !["image/jpeg", "image/png"].includes(input.contentType) ||
    !Number.isInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength >= 10_000_000 ||
    !/^[a-zA-Z0-9_.-]{1,120}$/.test(input.fileName)
  )
    throw new YouCamError(
      "invalid_input",
      "Use a JPEG or PNG image smaller than 10 MB.",
    );
  const parsed = FileResponseSchema.safeParse(
    await request(
      "/s2s/v2.0/file",
      "POST",
      {
        files: [
          {
            content_type: input.contentType,
            file_name: input.fileName,
            file_size: input.byteLength,
          },
        ],
      },
      options,
    ),
  );
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unsupported upload contract.",
    );
  const file = parsed.data.data.files[0];
  const destination = file.requests[0];
  const headers = Object.fromEntries(
    Object.entries(destination.headers).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  if (
    Object.keys(headers).some((key) =>
      /^(authorization|cookie|host|proxy-authorization)$/i.test(key),
    )
  )
    throw new YouCamError(
      "invalid_response",
      "The provider returned unsupported upload headers.",
    );
  return {
    fileId: file.file_id,
    request: { url: destination.url, method: destination.method, headers },
  };
}

export async function uploadRegisteredFile(
  file: RegisteredFile,
  bytes: Uint8Array,
  options: YouCamOptions = {},
) {
  const url = TransportUrlSchema.safeParse(file.request.url);
  if (!url.success || !bytes.length || bytes.length >= 10_000_000)
    throw new YouCamError(
      "invalid_input",
      "This upload could not be prepared.",
    );
  const response = await transport(
    url.data,
    {
      method: file.request.method,
      headers: file.request.headers,
      body: Uint8Array.from(bytes).buffer,
    },
    options,
  );
  if (!response.ok)
    throw new YouCamError(
      "upload_failed",
      "This image could not be uploaded. No costume task was submitted.",
      response.status >= 500 || response.status === 429,
      response.status,
    );
}

export async function submitClothesTask(
  input: {
    sourceFileId: string;
    garmentFileId: string;
    category: GarmentCategory;
  },
  options: YouCamOptions = {},
) {
  const body = clothesPayload(
    input.sourceFileId,
    input.garmentFileId,
    input.category,
  );
  const parsed = SubmitResponseSchema.safeParse(
    await request("/s2s/v2.0/task/cloth-v4", "POST", body, options, true),
  );
  if (!parsed.success) throw uncertain();
  return { taskId: parsed.data.data.task_id };
}

export async function submitMakeupTask(
  input: { sourceFileId: string; recipe: BeautyRecipe },
  options: YouCamOptions = {},
) {
  const body = makeupPayload(input.sourceFileId, input.recipe);
  const parsed = SubmitResponseSchema.safeParse(
    await request("/s2s/v2.0/task/makeup-vto", "POST", body, options, true),
  );
  if (!parsed.success) throw uncertain();
  return { taskId: parsed.data.data.task_id };
}

export async function submitHairColorTask(
  input: { sourceFileId: string; recipe: DetailRecipe },
  options: YouCamOptions = {},
) {
  const body = hairColorPayload(input.sourceFileId, input.recipe);
  const parsed = SubmitResponseSchema.safeParse(
    await request("/s2s/v2.0/task/hair-color", "POST", body, options, true),
  );
  if (!parsed.success) throw uncertain();
  return { taskId: parsed.data.data.task_id };
}
export async function submitNecklaceTask(
  input: {
    sourceFileId: string;
    referenceFileId: string;
    recipe: DetailRecipe;
  },
  options: YouCamOptions = {},
) {
  const body = necklacePayload(
    input.sourceFileId,
    input.referenceFileId,
    input.recipe,
  );
  const parsed = SubmitResponseSchema.safeParse(
    await request(
      "/s2s/v2.0/task/2d-vto/necklace",
      "POST",
      body,
      options,
      true,
    ),
  );
  if (!parsed.success) throw uncertain();
  return { taskId: parsed.data.data.task_id };
}

const engineMessages: Record<string, string> = {
  error_pose: "The provider needs a clear, standing photograph of one person.",
  error_invalid_ref:
    "The garment reference does not show the intended garment clearly enough.",
  error_invalid_src:
    "Use a clear source photo that includes the person's face and body.",
  error_multi_person: "Use photographs showing only one person.",
  error_apply_region_mismatch:
    "The source photograph and garment reference do not cover the same body area.",
  exceed_max_filesize: "The provider could not use this image size.",
  error_decode_image:
    "The provider could not decode the source or garment image.",
  error_download_image: "The provider could not read the prepared images.",
  error_editing_failed:
    "The provider could not make a useful costume change from these images.",
  error_nsfw_content_detected:
    "The provider declined this image. Choose a different permitted source.",
  error_face_position_invalid:
    "Use a face capture showing the whole face clearly.",
  error_face_position_too_small:
    "The face is too small in the frame. Use a separate close-up capture.",
  error_face_position_out_of_boundary:
    "Use a separate capture with the whole face inside the frame.",
  error_face_angle_invalid: "Use a clear, front-facing face capture.",
  error_below_min_image_size:
    "Use a clearer face capture with sufficient resolution.",
  error_exceed_max_image_size:
    "The face capture exceeds the provider's supported image dimensions.",
};
export async function getClothesTask(
  taskId: string,
  options: YouCamOptions = {},
): Promise<ClothesTaskState> {
  if (!taskId || taskId.length > 2048)
    throw new YouCamError(
      "invalid_input",
      "A saved provider task is required.",
    );
  const parsed = TaskResponseSchema.safeParse(
    await request(
      `/s2s/v2.0/task/cloth-v4/${encodeURIComponent(taskId)}`,
      "GET",
      undefined,
      options,
    ),
  );
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unsupported task result.",
    );
  const task = parsed.data.data;
  if (task.task_status === "success")
    return { state: "success", outputUrl: task.results.url };
  if (task.task_status === "error") {
    const code =
      task.error && Object.hasOwn(engineMessages, task.error)
        ? task.error
        : "provider_engine_error";
    return {
      state: "error",
      code,
      message:
        engineMessages[code] ||
        "The provider could not generate this costume preview. Your saved production is preserved.",
    };
  }
  return { state: "running" };
}

export async function getMakeupTask(
  taskId: string,
  options: YouCamOptions = {},
): Promise<ClothesTaskState> {
  return getSingleImageDetailTask(taskId, "makeup-vto", options);
}
export async function getHairColorTask(
  taskId: string,
  options: YouCamOptions = {},
): Promise<ClothesTaskState> {
  return getSingleImageDetailTask(taskId, "hair-color", options);
}
export async function getNecklaceTask(
  taskId: string,
  options: YouCamOptions = {},
): Promise<ClothesTaskState> {
  return getSingleImageDetailTask(taskId, "2d-vto/necklace", options);
}
async function getSingleImageDetailTask(
  taskId: string,
  operation: "makeup-vto" | "hair-color" | "2d-vto/necklace",
  options: YouCamOptions,
): Promise<ClothesTaskState> {
  if (!taskId || taskId.length > 2048)
    throw new YouCamError(
      "invalid_input",
      "A saved provider task is required.",
    );
  const parsed = MakeupTaskResponseSchema.safeParse(
    await request(
      `/s2s/v2.0/task/${operation}/${encodeURIComponent(taskId)}`,
      "GET",
      undefined,
      options,
    ),
  );
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unsupported beauty task result.",
    );
  const task = parsed.data.data;
  if (task.task_status === "success")
    return {
      state: "success",
      outputUrl: Array.isArray(task.results)
        ? task.results[0].download_url
        : task.results.url,
    };
  if (task.task_status === "error") {
    const code =
      task.error && Object.hasOwn(engineMessages, task.error)
        ? task.error
        : "provider_engine_error";
    return {
      state: "error",
      code,
      message:
        engineMessages[code] ||
        "The provider could not generate this beauty detail. Your saved production is preserved.",
    };
  }
  return { state: "running" };
}

export async function downloadOutput(url: string, options: YouCamOptions = {}) {
  const parsed = TransportUrlSchema.safeParse(url);
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The provider returned an unsupported image destination.",
    );
  const response = await transport(
    parsed.data,
    { method: "GET", headers: { Accept: "image/*" } },
    options,
  );
  if (!response.ok || !response.body)
    throw new YouCamError(
      "provider_unavailable",
      "The finished preview could not be downloaded. It remains attached to its original provider task.",
      true,
    );
  return response.body;
}

export async function readUnitInfo(options: YouCamOptions = {}) {
  return request("/s2s/v1.0/client/credit", "GET", undefined, options);
}

/** Read-only shared account balance. Expired pools cannot fund a new task. */
export async function getCreditBalance(
  options: YouCamOptions = {},
): Promise<number> {
  const parsed = CreditBalanceResponseSchema.safeParse(
    await readUnitInfo(options),
  );
  if (!parsed.success)
    throw new YouCamError(
      "invalid_response",
      "The shared preview balance could not be verified.",
    );
  return parsed.data.results.reduce(
    (sum, pool) =>
      sum + (pool.expiry == null || pool.expiry > Date.now() ? pool.amount : 0),
    0,
  );
}

export async function readFeatureCosts(
  startingToken?: string,
  options: YouCamOptions = {},
) {
  const query = new URLSearchParams({
    page_size: "20",
    ...(startingToken ? { starting_token: startingToken } : {}),
  });
  return request(
    `/s2s/v2.0/credit/feature-cost?${query}`,
    "GET",
    undefined,
    options,
  );
}
