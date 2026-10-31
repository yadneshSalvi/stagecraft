/** Offline source validation and immutable JPEG preparation; no provider requests. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { normalizePhoto, sha256Bytes } from "../src/lib/server/images";
import {
  ReviewFixtureTransportManifestSchema,
  type FixtureTransport,
} from "../src/lib/server/fixture-transports";
const sources = [
  [
    "/assets/cast/mina-face.webp",
    "face",
    "58999ac24758ada2ef67a19647b5833368d4b9285e7ba238ed6ac06912cdd5e6",
  ],
  [
    "/assets/garments/burgundy-coat.webp",
    "garment",
    "cdeb2f24235908a6650a97f40096bcff36ee284afa70520eeb5349f7cd603ac4",
  ],
  [
    "/assets/garments/rust-jacket.webp",
    "garment",
    "5cdd36e9958bb824054bfa4c661549552a6f7e023ed6d4e2f8f520b6ead272f8",
  ],
  [
    "/assets/accessories/brass-pendant.webp",
    "garment",
    "a94b3f8266e9711db1c47ecfa1317768cb3f86dc47799abc14e917d537f467d1",
  ],
] as const;
const outputs: { entry: FixtureTransport; bytes: Buffer }[] = [];
for (const [sourcePath, profile, sourceSha256] of sources) {
  const raw = await readFile(join("public", sourcePath));
  if (sha256Bytes(raw) !== sourceSha256)
    throw new Error("The review source differs from its inspected artwork.");
  const photo = await normalizePhoto(raw, undefined, profile);
  const transportPath = `/examples/transports/${basename(sourcePath, ".webp")}-${profile}.jpg`;
  let existing: Buffer | null;
  try {
    existing = await readFile(join("public", transportPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    existing = null;
  }
  if (existing && sha256Bytes(existing) !== photo.sha256)
    throw new Error(
      "Preserve the existing frozen review transport; this runtime produces different JPEG bytes.",
    );
  outputs.push({
    entry: {
      sourcePath,
      profile,
      sourceSha256,
      transportPath,
      transportSha256: photo.sha256,
      width: photo.width,
      height: photo.height,
    },
    bytes: photo.bytes,
  });
}
const manifest = ReviewFixtureTransportManifestSchema.parse({
  version: 1,
  normalization: "jpeg-q92-mozjpeg-v1",
  transports: outputs.map((output) => output.entry),
});
await mkdir("public/examples/transports", { recursive: true });
for (const output of outputs)
  await writeFile(join("public", output.entry.transportPath), output.bytes);
await writeFile(
  "public/examples/fixture-transports-review.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    frozenReviewFixtures: outputs.length,
    providerCalls: 0,
    originalManifestChanged: false,
  }),
);
