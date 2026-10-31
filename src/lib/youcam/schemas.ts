import { z } from "zod";

export const TransportUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.hash &&
        [
          "makeupar.com",
          "perfectcorp.com",
          "amazonaws.com",
          "googleapis.com",
          "blob.core.windows.net",
        ].some((domain) => host === domain || host.endsWith(`.${domain}`))
      );
    } catch {
      return false;
    }
  }, "The provider must return a supported secure transport destination.");

export const FileResponseSchema = z.object({
  status: z.literal(200),
  data: z.object({
    files: z
      .array(
        z.object({
          file_id: z.string().min(1).max(2048),
          file_name: z.string().optional(),
          content_type: z.string().optional(),
          requests: z
            .array(
              z.object({
                url: TransportUrlSchema,
                method: z.enum(["PUT", "POST"]),
                headers: z.record(
                  z.string().max(200),
                  z.union([z.string().max(4096), z.number().finite()]),
                ),
              }),
            )
            .length(1),
        }),
      )
      .length(1),
  }),
});
export const SubmitResponseSchema = z.object({
  status: z.literal(200),
  data: z.object({ task_id: z.string().min(1).max(2048) }),
});
export const TaskResponseSchema = z.object({
  status: z.literal(200),
  data: z.union([
    z.object({ task_status: z.enum(["running", "queued", "processing"]) }),
    z.object({
      task_status: z.literal("success"),
      results: z.object({ url: TransportUrlSchema }),
      error: z.string().nullable().optional(),
    }),
    z.object({
      task_status: z.literal("error"),
      error: z.string().nullable().optional(),
      error_message: z.string().optional(),
    }),
  ]),
});
export const ErrorResponseSchema = z.object({
  status: z.number().optional(),
  error_code: z.string().optional(),
  error: z.string().optional(),
});
export const ClothesInputSchema = z
  .object({
    src_file_id: z.string().min(1).max(2048),
    ref_file_id: z.string().min(1).max(2048),
    garment_category: z.enum([
      "full_body",
      "upper_body",
      "lower_body",
      "shoes",
      "outer",
    ]),
    change_shoes: z.literal(false),
    filter_multi_person: z.literal("strict"),
  })
  .strict();

export const MakeupTaskResponseSchema = z.object({
  status: z.literal(200),
  data: z.union([
    z.object({ task_status: z.enum(["running", "queued", "processing"]) }),
    z.object({
      task_status: z.literal("success"),
      results: z.union([
        z.object({ url: TransportUrlSchema }),
        z.array(z.object({ download_url: TransportUrlSchema })).length(1),
      ]),
      error: z.string().nullable().optional(),
    }),
    z.object({
      task_status: z.literal("error"),
      error: z.string().nullable().optional(),
      error_message: z.string().optional(),
    }),
  ]),
});
