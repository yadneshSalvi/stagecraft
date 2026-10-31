import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { ApiError } from "./errors";
import { MAX_UPLOAD_BYTES, sha256Bytes } from "./images";
import { baseFixtureImageUrls, reviewFixtureImageUrls } from "./media-policy";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const manifestFor = (sourceUrls: ReadonlySet<string>) =>
  z
    .object({
      version: z.literal(1),
      normalization: z.literal("jpeg-q92-mozjpeg-v1"),
      transports: z
        .array(
          z
            .object({
              sourcePath: z.string(),
              profile: z.enum(["garment", "face"]),
              sourceSha256: sha,
              transportPath: z
                .string()
                .regex(/^\/examples\/transports\/[a-z0-9-]+\.jpg$/),
              transportSha256: sha,
              width: z.number().int().min(384).max(2048),
              height: z.number().int().min(384).max(2048),
            })
            .strict(),
        )
        .length(sourceUrls.size),
    })
    .strict()
    .superRefine((manifest, context) => {
      const seen = new Set<string>();
      for (const item of manifest.transports) {
        const expectedProfile = item.sourcePath.endsWith("-face.webp")
          ? "face"
          : "garment";
        if (
          !sourceUrls.has(item.sourcePath) ||
          item.profile !== expectedProfile ||
          seen.has(item.sourcePath)
        )
          context.addIssue({
            code: "custom",
            message: "Fixture transport registration is invalid.",
          });
        if (
          item.profile === "face" &&
          (item.width > 1600 || item.height > 1000)
        )
          context.addIssue({
            code: "custom",
            message: "Face transport dimensions are invalid.",
          });
        seen.add(item.sourcePath);
      }
    });
export const FixtureTransportManifestSchema = manifestFor(baseFixtureImageUrls);
export const ReviewFixtureTransportManifestSchema = manifestFor(
  reviewFixtureImageUrls,
);
export type FixtureTransport = z.infer<
  typeof FixtureTransportManifestSchema
>["transports"][number];
const unavailable = () =>
  new ApiError(
    503,
    "FIXTURE_TRANSPORT_UNAVAILABLE",
    "The recorded example inputs could not be verified. Please try again after the example assets are restored.",
    true,
  );

/** Decode only: re-encoding would change the exact bytes submitted for recording. */
export async function verifyFixtureTransport(
  item: FixtureTransport,
  bytes: Buffer,
) {
  if (
    !bytes.length ||
    bytes.length > MAX_UPLOAD_BYTES ||
    sha256Bytes(bytes) !== item.transportSha256
  )
    throw unavailable();
  const metadata = await sharp(bytes, {
    limitInputPixels: 32_000_000,
  }).metadata();
  if (
    metadata.format !== "jpeg" ||
    metadata.width !== item.width ||
    metadata.height !== item.height ||
    (metadata.pages || 1) !== 1
  )
    throw unavailable();
  return {
    bytes,
    width: item.width,
    height: item.height,
    sha256: item.transportSha256,
  };
}

/** Public synthetic fixtures only. Private uploads never use this registry. */
export async function readFixtureTransport(
  sourcePath: string,
  sourceBytes: Buffer,
  profile: "garment" | "face",
  root = process.cwd(),
) {
  try {
    const review = reviewFixtureImageUrls.has(sourcePath);
    const manifest = (
      review
        ? ReviewFixtureTransportManifestSchema
        : FixtureTransportManifestSchema
    ).parse(
      JSON.parse(
        await readFile(
          join(
            root,
            "public/examples",
            review
              ? "fixture-transports-review.json"
              : "fixture-transports.json",
          ),
          "utf8",
        ),
      ),
    );
    const item = manifest.transports.find(
      (entry) => entry.sourcePath === sourcePath && entry.profile === profile,
    );
    if (!item || sha256Bytes(sourceBytes) !== item.sourceSha256)
      throw unavailable();
    const bytes = await readFile(join(root, "public", item.transportPath));
    return await verifyFixtureTransport(item, bytes);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
