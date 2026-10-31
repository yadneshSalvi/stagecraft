import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  FixtureTransportManifestSchema,
  readFixtureTransport,
  verifyFixtureTransport,
} from "@/lib/server/fixture-transports";
import { RecordingManifestSchema } from "@/lib/youcam/recorded";
import { BeautyRecordingManifestSchema } from "@/lib/youcam/recorded-beauty";
import { sha256Bytes } from "@/lib/server/images";

const manifest = FixtureTransportManifestSchema.parse(
  JSON.parse(await readFile("public/examples/fixture-transports.json", "utf8")),
);
describe("frozen synthetic fixture transports", () => {
  it("preserves the exact original provider upload hash for all thirteen source/profile pairs", async () => {
    const garments = RecordingManifestSchema.parse(
      JSON.parse(
        await readFile("public/examples/recorded-previews.json", "utf8"),
      ),
    );
    const beauty = BeautyRecordingManifestSchema.parse(
      JSON.parse(
        await readFile("public/examples/recorded-beauty-previews.json", "utf8"),
      ),
    );
    const anchors = new Map<string, string>();
    for (const item of garments.previews) {
      anchors.set(`garment:${item.sourceImagePath}`, item.sourceUploadSha256);
      anchors.set(`garment:${item.garmentImagePath}`, item.garmentUploadSha256);
    }
    for (const item of beauty.previews)
      anchors.set(`face:${item.sourceImagePath}`, item.sourceUploadSha256);
    expect(manifest.transports).toHaveLength(13);
    for (const item of manifest.transports) {
      const raw = await readFile(join("public", item.sourcePath));
      const frozen = await readFixtureTransport(
        item.sourcePath,
        raw,
        item.profile,
      );
      expect(sha256Bytes(raw)).toBe(item.sourceSha256);
      expect(frozen.sha256).toBe(
        anchors.get(`${item.profile}:${item.sourcePath}`),
      );
      expect(
        frozen.bytes.equals(await readFile(join("public", item.transportPath))),
      ).toBe(true);
    }
  });
  it("rejects changed source bytes, an unregistered source and the wrong capture profile", async () => {
    const item = manifest.transports[0];
    const raw = await readFile(join("public", item.sourcePath));
    for (const [source, bytes, profile] of [
      [
        item.sourcePath,
        Buffer.concat([raw, Buffer.from("changed")]),
        item.profile,
      ],
      ["/assets/cast/unknown.webp", raw, item.profile],
      [item.sourcePath, raw, "face"],
    ] as const)
      await expect(
        readFixtureTransport(source, bytes, profile),
      ).rejects.toMatchObject({ code: "FIXTURE_TRANSPORT_UNAVAILABLE" });
  });
  it("fails closed when a registered JPEG is tampered with or missing", async () => {
    const item = manifest.transports[0];
    const jpeg = Buffer.from(
      await readFile(join("public", item.transportPath)),
    );
    jpeg[32] ^= 1;
    await expect(verifyFixtureTransport(item, jpeg)).rejects.toMatchObject({
      code: "FIXTURE_TRANSPORT_UNAVAILABLE",
    });
    const root = await mkdtemp(join(tmpdir(), "stagecraft-transports-"));
    try {
      await mkdir(join(root, "public/examples"), { recursive: true });
      await writeFile(
        join(root, "public/examples/fixture-transports.json"),
        JSON.stringify(manifest),
      );
      await expect(
        readFixtureTransport(
          item.sourcePath,
          await readFile(join("public", item.sourcePath)),
          item.profile,
          root,
        ),
      ).rejects.toMatchObject({ code: "FIXTURE_TRANSPORT_UNAVAILABLE" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
