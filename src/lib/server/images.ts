import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ApiError } from "./errors";

export const MAX_UPLOAD_BYTES = 9_999_999;
export const sha256Bytes = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Decode first; rotate from EXIF, then strip metadata by encoding a new JPEG. */
export async function normalizePhoto(
  bytes: Buffer,
  expectedType?: string,
  profile: "garment" | "face" = "garment",
) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new ApiError(
      413,
      "IMAGE_TOO_LARGE",
      "Choose a photo smaller than 10 MB.",
    );
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 32_000_000,
      animated: false,
    }).metadata();
    const mime: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    if (
      !metadata.format ||
      !mime[metadata.format] ||
      (expectedType && mime[metadata.format] !== expectedType) ||
      (metadata.pages || 1) > 1
    )
      throw new ApiError(
        422,
        "IMAGE_TYPE_MISMATCH",
        "Use a single JPEG, PNG, or WebP image matching its file type.",
      );
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (Math.min(width, height) < 384 || Math.max(width, height) < 512)
      throw new ApiError(
        422,
        "IMAGE_TOO_SMALL",
        "Choose an image at least 512 pixels on its longer side and 384 on its shorter side.",
      );
    if (Math.max(width, height) > 8192)
      throw new ApiError(
        422,
        "IMAGE_DIMENSIONS",
        "Export this photo with each side below 8192 pixels.",
      );
    const normalized = await sharp(bytes, { limitInputPixels: 32_000_000 })
      .rotate()
      .resize(
        profile === "face" ? 1600 : 2048,
        profile === "face" ? 1000 : 2048,
        { fit: "inside", withoutEnlargement: true },
      )
      .flatten({ background: "#eeeeee" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
      sha256: sha256Bytes(normalized.data),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      422,
      "IMAGE_UNREADABLE",
      "This photo could not be decoded. Export it as a JPEG, PNG, or WebP image.",
    );
  }
}

/** A separate face image is normalized without cropping or compositing. */
export const normalizeFacePhoto = (bytes: Buffer, expectedType?: string) =>
  normalizePhoto(bytes, expectedType, "face");
