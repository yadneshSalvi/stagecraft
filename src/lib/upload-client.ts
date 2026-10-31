"use client";
import { upload } from "@vercel/blob/client";
import type { Production } from "./types";
import { api } from "./client";

export async function uploadImage(
  file: File,
  projectId: string,
  purpose: "performer" | "garment" | "face",
  subjectId: string,
) {
  if (file.size >= 10_000_000)
    throw new Error("Please choose an image smaller than 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Please choose a JPEG, PNG, or WebP image.");
  const { pathname } = await api<{ pathname: string }>("/api/assets/intent", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      purpose,
      subjectId,
      contentType: file.type,
      bytes: file.size,
      consent: true,
      rightsConfirmed: true,
    }),
  });
  const result = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/assets/upload",
    contentType: file.type,
    clientPayload: JSON.stringify({ projectId, purpose, subjectId }),
  });
  return api<{
    asset: {
      id: string;
      url: string;
      width: number;
      height: number;
      sha256: string;
    };
    project: Production;
  }>("/api/assets/finalize", {
    method: "POST",
    body: JSON.stringify({
      pathname: result.pathname,
      projectId,
      purpose,
      subjectId,
    }),
  });
}
