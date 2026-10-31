"use client";
import Link from "next/link";
import { Info } from "lucide-react";

export type ProvenanceKind =
  | "recorded"
  | "fresh"
  | "synthetic"
  | "photo"
  | "manual"
  | "sample-decision"
  | "unrendered";
const descriptions: Record<ProvenanceKind, { label: string; text: string }> = {
  recorded: {
    label: "Recorded YouCam",
    text: "A genuine saved YouCam output, reused only when its verified source images and provider settings match. Reuse starts no new provider task. Your review remains a separate decision.",
  },
  fresh: {
    label: "Fresh YouCam",
    text: "A genuine YouCam output created for this production’s saved inputs. Review the exact result before approving its appearance.",
  },
  synthetic: {
    label: "Synthetic sample",
    text: "An AI-created fictional adult or wardrobe reference, with source hashes and generation provenance. It is not a photograph of a real cast member or proof that a physical item exists.",
  },
  photo: {
    label: "Your photo",
    text: "A privately uploaded source permitted by this browser’s owner. Body and face captures are versioned separately; a new capture requires review of its affected outputs.",
  },
  manual: {
    label: "Recorded evidence",
    text: "Information entered by an operator. The named source, date and evidence determine what has been confirmed; the application does not contact suppliers or perform fittings.",
  },
  "sample-decision": {
    label: "Example decision",
    text: "An explicit, reversible sample decision attributed to Example reviewer (sample decision). It demonstrates the approval workflow without claiming a human designer reviewed this look.",
  },
  unrendered: {
    label: "Crew direction",
    text: "A written instruction that is not represented by a provider output. Keep it visible for the crew and verify it separately.",
  },
};

export function ProvenanceChip({ kind }: { kind: ProvenanceKind }) {
  const item = descriptions[kind];
  return (
    <details className={`provenance-chip provenance-${kind}`}>
      <summary>
        {item.label}
        <Info size={12} aria-hidden="true" />
      </summary>
      <div className="provenance-popover" role="note">
        <strong>{item.label}</strong>
        <p>{item.text}</p>
        <Link href="/evidence">
          Evidence & limits <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </details>
  );
}
