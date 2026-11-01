"use client";
import { Check, Clock3, LoaderCircle, RotateCw, X } from "lucide-react";
import type { usePreviewJob } from "./use-preview-job";
import { Button, Notice } from "./ui";

const stages = [
  { state: "queued", label: "Queued" },
  { state: "preparing", label: "Preparing" },
  { state: "submitting", label: "Sending" },
  { state: "polling", label: "Generating" },
  { state: "storing", label: "Saving" },
];

export function PreviewJobStatus({
  state,
}: {
  state: ReturnType<typeof usePreviewJob>;
}) {
  const {
    job,
    pending,
    working,
    intent,
    recordedIntent,
    recordedWorking,
    recoveryMessage,
    notFound,
    recover,
    retrySaved,
    control,
  } = state;
  const current = stages.findIndex((stage) => stage.state === job?.state);
  return (
    <>
      {(intent || recordedIntent) && !(working || recordedWorking) && (
        <div className="saved-request-recovery">
          <Notice tone="warning">
            {recoveryMessage || "A request is pending. Check its status."}
          </Notice>
          <Button
            busy={working || recordedWorking}
            onClick={() => void recover()}
          >
            <RotateCw size={14} />
            Check saved request status
          </Button>
          {intent && recordedIntent && (
            <Button onClick={() => void recover("recorded")}>
              Check saved request
            </Button>
          )}
          {notFound && (
            <Button onClick={() => void retrySaved()}>
              Retry the same saved request
            </Button>
          )}
        </div>
      )}
      {state.recordedJob?.state === "succeeded" &&
        job?.id !== state.recordedJob.id && (
          <Notice tone="success">Saved result attached.</Notice>
        )}
      {job && (
        <div className={`job-progress job-${job.state}`} aria-live="polite">
          <div className="job-state">
            {pending ? (
              <LoaderCircle size={16} className="spin" />
            ) : job.state === "succeeded" ? (
              <Check size={16} />
            ) : (
              <Clock3 size={16} />
            )}
            <strong>
              {job.state === "succeeded"
                ? "Preview ready"
                : job.state === "cancelled"
                  ? "Cancelled"
                  : pending
                    ? stages[current]?.label || "Working…"
                    : job.message || job.state.replaceAll("_", " ")}
            </strong>
          </div>
          {pending && (
            <ol>
              {stages.map((stage, index) => (
                <li
                  key={stage.state}
                  className={
                    index === current ? "active" : index < current ? "done" : ""
                  }
                >
                  {index < current ? <Check size={11} /> : <span />}
                  {stage.label}
                </li>
              ))}
            </ol>
          )}
          {job.state === "ambiguous" && (
            <p>Status unclear; not resubmitted automatically.</p>
          )}
          {job.state === "failed" && (
            <p>Attempt failed. Check source and recipe.</p>
          )}
          {pending && (
            <>
              <p>Safe to leave this page.</p>
              <div className="job-controls">
                <Button
                  variant="quiet"
                  busy={working}
                  onClick={() => void control("resume")}
                >
                  <RotateCw size={13} />
                  Resume saved attempt
                </Button>
                <Button
                  variant="quiet"
                  disabled={working}
                  onClick={() => void control("cancel")}
                >
                  <X size={13} />
                  Cancel attempt
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
