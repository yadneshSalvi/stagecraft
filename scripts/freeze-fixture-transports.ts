/** Offline only. Reproduce exact recorded transport bytes or refuse publication. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { normalizePhoto, sha256Bytes } from "../src/lib/server/images";
import {
  FixtureTransportManifestSchema,
  type FixtureTransport,
} from "../src/lib/server/fixture-transports";
import { RecordingManifestSchema } from "../src/lib/youcam/recorded";
import { BeautyRecordingManifestSchema } from "../src/lib/youcam/recorded-beauty";

const root = process.cwd();
type Input = Pick<
  FixtureTransport,
  "sourcePath" | "profile" | "sourceSha256" | "transportSha256"
>;
const inputs = new Map<string, Input>();
function register(input: Input) {
  const key = `${input.profile}:${input.sourcePath}`;
  const previous = inputs.get(key);
  if (previous && JSON.stringify(previous) !== JSON.stringify(input))
    throw new Error("Conflicting recorded fixture evidence.");
  inputs.set(key, input);
}
const garments = RecordingManifestSchema.parse(
  JSON.parse(
    await readFile(
      join(root, "public/examples/recorded-previews.json"),
      "utf8",
    ),
  ),
);
for (const item of garments.previews) {
  register({
    sourcePath: item.sourceImagePath,
    profile: "garment",
    sourceSha256: item.sourceSha256,
    transportSha256: item.sourceUploadSha256,
  });
  register({
    sourcePath: item.garmentImagePath,
    profile: "garment",
    sourceSha256: item.garmentSha256,
    transportSha256: item.garmentUploadSha256,
  });
}
const beauty = BeautyRecordingManifestSchema.parse(
  JSON.parse(
    await readFile(
      join(root, "public/examples/recorded-beauty-previews.json"),
      "utf8",
    ),
  ),
);
for (const item of beauty.previews)
  register({
    sourcePath: item.sourceImagePath,
    profile: "face",
    sourceSha256: item.sourceSha256,
    transportSha256: item.sourceUploadSha256,
  });

const outputs: { entry: FixtureTransport; bytes: Buffer }[] = [];
for (const input of inputs.values()) {
  const bytes = await readFile(join(root, "public", input.sourcePath));
  if (sha256Bytes(bytes) !== input.sourceSha256)
    throw new Error("The source artwork differs from recorded evidence.");
  const normalized = await normalizePhoto(bytes, undefined, input.profile);
  if (normalized.sha256 !== input.transportSha256)
    throw new Error(
      "This runtime cannot reproduce the recorded JPEG. Preserve the existing frozen transport.",
    );
  outputs.push({
    entry: {
      ...input,
      transportPath: `/examples/transports/${basename(input.sourcePath, ".webp")}-${input.profile}.jpg`,
      width: normalized.width,
      height: normalized.height,
    },
    bytes: normalized.bytes,
  });
}
const manifest = FixtureTransportManifestSchema.parse({
  version: 1,
  normalization: "jpeg-q92-mozjpeg-v1",
  transports: outputs.map((item) => item.entry),
});
await mkdir(join(root, "public/examples/transports"), { recursive: true });
for (const output of outputs)
  await writeFile(
    join(root, "public", output.entry.transportPath),
    output.bytes,
  );
await writeFile(
  join(root, "public/examples/fixture-transports.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    frozenFixtures: outputs.length,
    providerCalls: 0,
    recordedHashesChanged: false,
  }),
);
