import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  matchRecording,
  recordedPreviews,
  RecordingManifestSchema,
} from "@/lib/youcam/recorded";
import { sha256Bytes } from "@/lib/server/images";
import { readFixtureTransport } from "@/lib/server/fixture-transports";

describe("recorded provider evidence", () => {
  it("verifies all public source, transport and result hashes and records no approvals or temporary URLs", async () => {
    const raw = await readFile(
      join(process.cwd(), "public/examples/recorded-previews.json"),
      "utf8",
    );
    const manifest = RecordingManifestSchema.parse(JSON.parse(raw));
    expect(manifest.previews).toHaveLength(7);
    expect(raw).not.toMatch(/https?:\/\/|task_id|"approved"\s*:\s*true/);
    for (const item of manifest.previews) {
      const [source, garment, output] = await Promise.all(
        [item.sourceImagePath, item.garmentImagePath, item.imagePath].map(
          (path) => readFile(join(process.cwd(), "public", path)),
        ),
      );
      expect(sha256Bytes(source)).toBe(item.sourceSha256);
      expect(sha256Bytes(garment)).toBe(item.garmentSha256);
      expect(sha256Bytes(output)).toBe(item.outputSha256);
      expect(
        (await readFixtureTransport(item.sourceImagePath, source, "garment"))
          .sha256,
      ).toBe(item.sourceUploadSha256);
      expect(
        (await readFixtureTransport(item.garmentImagePath, garment, "garment"))
          .sha256,
      ).toBe(item.garmentUploadSha256);
      expect(item.inspectionNotes).toMatch(/preview|inspect|review/i);
    }
  }, 30000);
  it("requires exact performer, source, garment and category while allowing current logical revisions", async () => {
    const item = (await recordedPreviews()).find(
      (record) => record.id === "recorded-nora-charcoal",
    )!;
    const input = {
      lookId: item.lookId,
      performerId: item.performerId,
      unitIds: item.unitIds,
      category: item.category,
      sourceSha256: item.sourceUploadSha256,
      garmentSha256: item.garmentUploadSha256,
    };
    expect((await matchRecording(input))?.id).toBe(item.id);
    expect(
      await matchRecording({ ...input, performerId: "performer-unrelated" }),
    ).toBeNull();
    expect(
      await matchRecording({ ...input, sourceSha256: "0".repeat(64) }),
    ).toBeNull();
    expect(
      await matchRecording({ ...input, garmentSha256: "0".repeat(64) }),
    ).toBeNull();
    expect(
      await matchRecording({ ...input, category: "full_body" }),
    ).toBeNull();
    expect(
      await matchRecording({ ...input, unitIds: ["unit-coat-oxblood"] }),
    ).toBeNull();
  });
});
