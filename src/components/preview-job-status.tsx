"use client";
import { Check, Clock3, LoaderCircle, RotateCw, X } from "lucide-react";
import type { usePreviewJob } from "./use-preview-job";
import { Button, Notice } from "./ui";

const stages = [
  { state: "queued", label: "Queued" },
  { state: "preparing", label: "Preparing sources" },
  { state: "submitting", label: "Submitting to YouCam" },
  { state: "polling", label: "Generating appearance" },
  { state: "storing", label: "Saving private result" },
];

export function PreviewJobStatus({
  state,
}: {
  state: ReturnType<typeof usePreviewJob>;
}) {
  const { job, pending, working, intent, recover, control } = state;
  const current = stages.findIndex((stage) => stage.state === job?.state);
  return (
    <>
      {intent && !working && (
        <div className="saved-request-recovery">
          <Notice tone="warning">
            This request was interrupted before the browser received
            confirmation. Recovery reuses its original request identifier.
          </Notice>
          <Button busy={working} onClick={() => void recover()}>
            <RotateCw size={14} />
            Recover saved request
          </Button>
        </div>
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
            <strong>{job.message || job.state.replaceAll("_", " ")}</strong>
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
            <p>
              The provider may have received the request. This attempt is never
              submitted again automatically. A fresh generation is a separate
              paid attempt.
            </p>
          )}
          {job.state === "failed" && (
            <p>
              This attempt remains in the history. Review the source and recipe
              before deliberately starting another.
            </p>
          )}
          {pending && (
            <>
              <p>
                You can leave this page. The saved job continues. Cancelling
                stops adoption of its result; it does not reverse a provider
                charge.
              </p>
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
