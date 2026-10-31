import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  makeBeautyEffects,
  MakeupEffectsSchema,
  makeupPayload,
} from "@/lib/youcam/beauty";
import { submitMakeupTask, getMakeupTask } from "@/lib/youcam";
import {
  recordedBeautyPreviews,
  matchBeautyRecording,
} from "@/lib/youcam/recorded-beauty";
import { normalizeFacePhoto, sha256Bytes } from "@/lib/server/images";

const recipe = {
  lipColor: "#853E5D",
  lipIntensity: 40,
  blushColor: "#9D526C",
  blushIntensity: 30,
};
const options = {
  baseUrl: "https://yce-api-01.makeupar.com",
  apiKey: "test-key",
};
describe("independent Makeup VTO detail transport", () => {
  it("builds the exact supported effects with both smoothing and morphology zeros", () => {
    const effects = makeBeautyEffects(recipe);
    expect(effects[0]).toEqual({
      category: "skin_smooth",
      skinSmoothStrength: 0,
      skinSmoothColorIntensity: 0,
    });
    expect(
      effects.find((effect) => effect.category === "lip_color"),
    ).toMatchObject({
      morphology: { fullness: 0, wrinkless: 0 },
      shape: { name: "original" },
      palettes: [{ color: "#853E5D", texture: "matte", colorIntensity: 40 }],
    });
    const smoothed = structuredClone(effects) as unknown as Record<
      string,
      unknown
    >[];
    smoothed[0].skinSmoothStrength = 50;
    expect(MakeupEffectsSchema.safeParse(smoothed).success).toBe(false);
    expect(() => makeBeautyEffects({ ...recipe, lipIntensity: 101 })).toThrow();
    expect(() =>
      makeBeautyEffects({ ...recipe, blushIntensity: 1.5 }),
    ).toThrow();
  });
  it("submits one validated makeup task using one uploaded source", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ status: 200, data: { task_id: "beauty-task" } }),
      );
    await expect(
      submitMakeupTask(
        { sourceFileId: "face-file", recipe },
        { ...options, fetch: fetcher },
      ),
    ).resolves.toEqual({ taskId: "beauty-task" });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://yce-api-01.makeupar.com/s2s/v2.0/task/makeup-vto",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(
      makeupPayload("face-file", recipe),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not retry a lost paid makeup response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private transport details"));
    await expect(
      submitMakeupTask(
        { sourceFileId: "face-file", recipe },
        { ...options, fetch: fetcher },
      ),
    ).rejects.toMatchObject({
      code: "unknown_submission",
      submissionUncertain: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("accepts documented result forms and maps face errors to safe capture guidance", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          status: 200,
          data: {
            task_status: "success",
            results: [
              {
                download_url: "https://yce-us.s3-accelerate.amazonaws.com/face",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: 200,
          data: {
            task_status: "error",
            error: "error_face_position_too_small",
            error_message: "private details",
          },
        }),
      );
    expect(
      await getMakeupTask("beauty-task", { ...options, fetch: fetcher }),
    ).toMatchObject({ state: "success" });
    expect(
      await getMakeupTask("beauty-task", { ...options, fetch: fetcher }),
    ).toMatchObject({
      state: "error",
      message: expect.stringContaining("separate close-up"),
    });
  });
  it("verifies both actual recordings and rejects a different face or effect recipe", async () => {
    const records = await recordedBeautyPreviews();
    expect(records).toHaveLength(2);
    for (const item of records) {
      const source = await readFile(
        join(process.cwd(), "public", item.sourceImagePath),
      );
      const output = await readFile(
        join(process.cwd(), "public", item.imagePath),
      );
      expect(sha256Bytes(source)).toBe(item.sourceSha256);
      expect(sha256Bytes(output)).toBe(item.outputSha256);
      const face = await normalizeFacePhoto(source);
      expect(face.sha256).toBe(item.sourceUploadSha256);
      expect(face.width).toBeLessThan(1920);
      expect(face.height).toBeLessThan(1080);
      const input = {
        lookId: item.lookId,
        performerId: item.performerId,
        sourceSha256: face.sha256,
        recipe: item.recipe,
      };
      expect((await matchBeautyRecording(input))?.id).toBe(item.id);
      expect(
        await matchBeautyRecording({ ...input, sourceSha256: "0".repeat(64) }),
      ).toBeNull();
      expect(
        await matchBeautyRecording({
          ...input,
          recipe: { ...recipe, lipIntensity: 41 },
        }),
      ).toBeNull();
    }
  }, 20000);
});
