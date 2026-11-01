"use client";
import { Photo } from "./ui";

export function ApprovalOutput({
  imageUrl,
  subject,
}: {
  imageUrl?: string | null;
  subject: string;
  provenance?: "recorded_provider" | "live_provider";
}) {
  if (!imageUrl) return null;
  return (
    <figure className="approval-output">
      <Photo
        src={imageUrl}
        alt={`Exact output under review: ${subject}`}
        original
        natural
      />
    </figure>
  );
}
