import { describe, expect, it, vi } from "vitest";
import {
  getClothesTask,
  registerFile,
  submitClothesTask,
  uploadRegisteredFile,
  YouCamError,
  unretouchedMakeupEffects,
} from "@/lib/youcam";
import { ClothesInputSchema, TransportUrlSchema } from "@/lib/youcam/schemas";

const options = {
  baseUrl: "https://yce-api-01.makeupar.com",
  apiKey: "test-key",
};
describe("YouCam Clothes V4 transport", () => {
  it("uses the verified cloth-v4 endpoint and explicit one-person outerwear settings", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ status: 200, data: { task_id: "task-one" } }),
      );
    await expect(
      submitClothesTask(
        {
          sourceFileId: "source-one",
          garmentFileId: "garment-one",
          category: "outerwear",
        },
        { ...options, fetch: fetcher },
      ),
    ).resolves.toEqual({ taskId: "task-one" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v4",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      src_file_id: "source-one",
      ref_file_id: "garment-one",
      garment_category: "outer",
      change_shoes: false,
      filter_multi_person: "strict",
    });
  });
  it("honors returned file upload headers without forwarding the provider bearer", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          status: 200,
          data: {
            files: [
              {
                file_id: "file-one",
                requests: [
                  {
                    method: "PUT",
                    url: "https://yce-us.s3-accelerate.amazonaws.com/private?signature=secret",
                    headers: {
                      "Content-Type": "image/jpeg",
                      "Content-Length": 3,
                    },
                  },
                ],
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const file = await registerFile(
      { contentType: "image/jpeg", byteLength: 3, fileName: "source.jpg" },
      { ...options, fetch: fetcher },
    );
    await uploadRegisteredFile(file, new Uint8Array([255, 216, 255]), {
      ...options,
      fetch: fetcher,
    });
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({
      "Content-Type": "image/jpeg",
      "Content-Length": "3",
    });
    expect(fetcher.mock.calls[1][1]?.redirect).toBe("error");
  });
  it.each(["network", "invalid_json", "missing_id", "server_error"])(
    "treats %s after a paid submission as uncertain without an automatic repeat",
    async (kind) => {
      const fetcher = vi.fn<typeof fetch>();
      if (kind === "network")
        fetcher.mockRejectedValue(
          new Error("https://private.invalid/?signature=secret"),
        );
      else if (kind === "invalid_json")
        fetcher.mockResolvedValue(new Response("unreadable", { status: 200 }));
      else if (kind === "missing_id")
        fetcher.mockResolvedValue(Response.json({ status: 200, data: {} }));
      else
        fetcher.mockResolvedValue(
          Response.json({ status: 500, error: "secret-url" }, { status: 500 }),
        );
      const error = await submitClothesTask(
        {
          sourceFileId: "source",
          garmentFileId: "garment",
          category: "upper_body",
        },
        { ...options, fetch: fetcher },
      ).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(YouCamError);
      expect(error).toMatchObject({
        code: "unknown_submission",
        submissionUncertain: true,
      });
      expect(String(error)).not.toMatch(
        /signature|private\.invalid|secret-url/,
      );
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("does not call a malformed success body a completed preview", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 200,
        data: { task_status: "success", results: {} },
      }),
    );
    await expect(
      getClothesTask("known-task", { ...options, fetch: fetcher }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("maps provider engine errors to safe, known text", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 200,
        data: {
          task_status: "error",
          error: "https://private.invalid/?signature=secret",
          error_message: "Bearer secret",
        },
      }),
    );
    const result = await getClothesTask("known-task", {
      ...options,
      fetch: fetcher,
    });
    expect(result).toMatchObject({
      state: "error",
      code: "provider_engine_error",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private\.invalid|signature|Bearer/,
    );
  });
  it("rejects arbitrary/private transport URLs and unrecognized task fields", () => {
    for (const url of [
      "http://yce-us.s3.amazonaws.com/image",
      "https://127.0.0.1/image",
      "https://s3.amazonaws.com.attacker.test/image",
      "https://user:pass@yce-us.s3.amazonaws.com/image",
      "https://yce-us.s3.amazonaws.com:444/image",
    ])
      expect(TransportUrlSchema.safeParse(url).success).toBe(false);
    expect(
      ClothesInputSchema.safeParse({
        src_file_id: "s",
        ref_file_id: "g",
        garment_category: "outerwear",
        change_shoes: false,
        filter_multi_person: "strict",
      }).success,
    ).toBe(false);
    expect(
      ClothesInputSchema.safeParse({
        src_file_id: "s",
        ref_file_id: "g",
        garment_category: "outer",
        change_shoes: false,
        filter_multi_person: "strict",
        approval: true,
      }).success,
    ).toBe(false);
  });
  it("keeps both ordinary makeup smoothing parameters explicitly at zero", () => {
    expect(unretouchedMakeupEffects()).toEqual([
      {
        category: "skin_smooth",
        skinSmoothStrength: 0,
        skinSmoothColorIntensity: 0,
      },
    ]);
  });
});
