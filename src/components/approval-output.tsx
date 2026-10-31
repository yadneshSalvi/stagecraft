"use client";
import { Photo } from "./ui";
import { ProvenanceChip } from "./provenance-chip";

export function ApprovalOutput({
  imageUrl,
  subject,
  provenance,
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
      />
      <figcaption>
        <span className="eyebrow">EXACT OUTPUT UNDER REVIEW</span>
        <strong>{subject}</strong>
        {provenance && (
          <ProvenanceChip
            kind={provenance === "recorded_provider" ? "recorded" : "fresh"}
          />
        )}
      </figcaption>
    </figure>
  );
}
