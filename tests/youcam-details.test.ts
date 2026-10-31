import { describe, expect, it, vi } from "vitest";
import {
  hairColorPayload,
  necklacePayload,
  NecklaceInputSchema,
  detailProviderInputHash,
} from "@/lib/youcam/details";
import {
  submitHairColorTask,
  submitNecklaceTask,
  getHairColorTask,
  getNecklaceTask,
  getCreditBalance,
} from "@/lib/youcam";
import {
  parseRecordingLedger,
  maySubmitRecording,
} from "@/lib/youcam/recording-ledger";
const options = {
  baseUrl: "https://yce-api-01.makeupar.com",
  apiKey: "test-key",
};
describe("independent hair and necklace provider contracts", () => {
  it("uses only verified unexpired credit pools for the shared balance", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 200,
        results: [
          { amount: 210, expiry: Date.now() + 60000 },
          { amount: 30, expiry: Date.now() - 1 },
        ],
      }),
    );
    await expect(
      getCreditBalance({ ...options, fetch: fetcher }),
    ).resolves.toBe(210);
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    await expect(
      getCreditBalance({
        ...options,
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json({ status: 200, results: [{ amount: -1 }] }),
          ),
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("uses one supported preset without conflicting palette/pattern fields", async () => {
    const recipe = { kind: "hair_color", preset: "Chocolate Brown" } as const;
    expect(hairColorPayload("source", recipe)).toEqual({
      src_file_id: "source",
      preset: "Chocolate Brown",
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ status: 200, data: { task_id: "saved-task" } }),
      );
    await submitHairColorTask(
      { sourceFileId: "source", recipe },
      { ...options, fetch: fetcher },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      src_file_id: "source",
      preset: "Chocolate Brown",
    });
  });
  it("binds necklace file names and explicit background/shadow settings", () => {
    const recipe = {
      kind: "necklace",
      referenceId: "detail-brass-pendant",
      removeBackground: true,
    } as const;
    const payload = necklacePayload("source", "reference", recipe);
    expect(payload.object_infos[0]).toEqual({
      name: "reference",
      parameter: {
        necklace_need_remove_background: true,
        necklace_shadow_intensity: 0.15,
        necklace_ambient_light_intensity: 1,
      },
    });
    expect(
      NecklaceInputSchema.safeParse({
        ...payload,
        source_info: { name: "different" },
      }).success,
    ).toBe(false);
    expect(
      detailProviderInputHash("a".repeat(64), recipe, "b".repeat(64)),
    ).toBe(
      detailProviderInputHash(
        "a".repeat(64),
        { ...recipe, referenceId: "other-physical-id" },
        "b".repeat(64),
      ),
    );
  });
  it("never repeats an uncertain necklace POST", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("lost response"));
    await expect(
      submitNecklaceTask(
        {
          sourceFileId: "source",
          referenceFileId: "reference",
          recipe: {
            kind: "necklace",
            referenceId: "detail-brass-pendant",
            removeBackground: true,
          },
        },
        { ...options, fetch: fetcher },
      ),
    ).rejects.toMatchObject({
      code: "unknown_submission",
      submissionUncertain: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts the documented single-URL result and rejects unsupported destinations", async () => {
    const success = () =>
      Response.json({
        status: 200,
        data: {
          task_status: "success",
          results: { url: "https://storage.googleapis.com/example/result.jpg" },
        },
      });
    await expect(
      getHairColorTask("saved", {
        ...options,
        fetch: vi.fn<typeof fetch>().mockImplementation(async () => success()),
      }),
    ).resolves.toMatchObject({ state: "success" });
    await expect(
      getNecklaceTask("saved", {
        ...options,
        fetch: vi.fn<typeof fetch>().mockImplementation(async () => success()),
      }),
    ).resolves.toMatchObject({ state: "success" });
    const bad = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 200,
        data: {
          task_status: "success",
          results: { url: "https://evil.example/result.jpg" },
        },
      }),
    );
    await expect(
      getNecklaceTask("saved", { ...options, fetch: bad }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("rejects corrupt/mismatched ledgers and never resets a persisted submission intent", () => {
    const hash = "a".repeat(64),
      expected = [{ id: "one", inputHash: hash }];
    expect(() => parseRecordingLedger("{", hash, expected)).toThrow(
      /not be reset/,
    );
    const ledger = {
      version: 1,
      matrixSha256: hash,
      costsVerified: false,
      items: [
        {
          id: "one",
          inputHash: hash,
          state: "submitting",
          files: {},
          submissionStartedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    };
    const saved = parseRecordingLedger(JSON.stringify(ledger), hash, expected);
    expect(maySubmitRecording(saved.items[0])).toBe(false);
    expect(() =>
      parseRecordingLedger(JSON.stringify(ledger), "b".repeat(64), expected),
    ).toThrow(/does not match/);
  });
});
