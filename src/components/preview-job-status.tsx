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
            {recoveryMessage ||
              "A request is saved in this browser. Check its status before sending it again."}
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
              Check recorded request status
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
          <Notice tone="success">
            A matching recorded result was attached. The fresh attempt keeps its
            own status below.
          </Notice>
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
              YouCam may have received this attempt. It will not be submitted
              again automatically. Recorded results remain available.
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
              <p>You can leave this page; the saved job continues.</p>
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
              <small>
                Cancelling prevents adoption; it cannot reverse a provider
                charge.
              </small>
            </>
          )}
        </div>
      )}
    </>
  );
}
