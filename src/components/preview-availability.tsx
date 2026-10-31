"use client";
import type { AppConfig } from "@/lib/types";
import { Notice } from "./ui";

export function freshPreviewAvailable(config: AppConfig | null) {
  return (
    !!config?.youcam &&
    !!config.storage &&
    !config.generationPaused &&
    config.freshPreviewAvailability?.available !== false
  );
}
export function PreviewAvailability({ config }: { config: AppConfig | null }) {
  if (freshPreviewAvailable(config)) return null;
  return (
    <Notice>
      {config?.freshPreviewAvailability?.message ||
        "Fresh previews are resting. Recorded results and existing approvals still work."}
    </Notice>
  );
}
