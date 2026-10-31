"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  cancelJob,
  getJob,
  requestPreview,
  resumeJob,
} from "@/lib/client";
import type { PreviewJob } from "@/lib/types";
import { useProduction } from "./production-context";

interface SavedIntent {
  mode: "live" | "recorded";
  commandId: string;
}

export function usePreviewJob(
  lookId: string,
  kind: "garment" | "beauty",
  onSuccess: () => void,
) {
  const { project, refresh, setError } = useProduction();
  const [job, setJob] = useState<PreviewJob | null>(null);
  const [working, setWorking] = useState(false);
  const [intent, setIntent] = useState<SavedIntent | null>(null);
  const storageKey = `stagecraft-job:${project.id}:${lookId}${kind === "beauty" ? ":beauty" : ""}`;
  const intentKey = `${storageKey}:intent`;
  const pending =
    !!job &&
    ["queued", "preparing", "submitting", "polling", "storing"].includes(
      job.state,
    );
  const jobId = job?.id;

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      try {
        const savedIntent = localStorage.getItem(intentKey);
        if (savedIntent && !cancelled) {
          const parsed: unknown = JSON.parse(savedIntent);
          if (
            parsed &&
            typeof parsed === "object" &&
            "commandId" in parsed &&
            typeof parsed.commandId === "string" &&
            "mode" in parsed &&
            (parsed.mode === "live" || parsed.mode === "recorded")
          )
            setIntent(parsed as SavedIntent);
        }
        const savedJob = localStorage.getItem(storageKey);
        if (savedJob) {
          const result = await getJob(savedJob);
          if (!cancelled) setJob(result.job);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, intentKey]);

  useEffect(() => {
    if (!pending || !jobId) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await getJob(jobId);
        if (!cancelled) {
          if (result.job.state === "succeeded") {
            localStorage.removeItem(storageKey);
            await refresh();
            if (!cancelled) {
              onSuccess();
              setJob(result.job);
            }
          } else setJob(result.job);
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "The saved preview status could not be loaded. Use Resume saved attempt to reconnect.",
          );
      } finally {
        polling = false;
      }
    };
    const interval = setInterval(() => void poll(), 5000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pending, jobId, refresh, onSuccess, setError, storageKey]);

  const generate = useCallback(
    async (mode: "live" | "recorded") => {
      if (working || pending) return;
      if (intent && intent.mode !== mode) {
        setError("Recover the saved request before starting another preview.");
        return;
      }
      setWorking(true);
      setError(null);
      const nextIntent = intent || { mode, commandId: crypto.randomUUID() };
      setIntent(nextIntent);
      localStorage.setItem(intentKey, JSON.stringify(nextIntent));
      try {
        const result = await requestPreview(
          project,
          lookId,
          mode,
          kind,
          nextIntent.commandId,
        );
        setJob(result.job);
        localStorage.setItem(storageKey, result.job.id);
        localStorage.removeItem(intentKey);
        setIntent(null);
        if (result.job.state === "succeeded") {
          localStorage.removeItem(storageKey);
          await refresh();
          onSuccess();
        }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status < 500) {
          localStorage.removeItem(intentKey);
          setIntent(null);
          if (cause.status === 409) await refresh().catch(() => {});
          setError(
            cause.status === 409
              ? "The working book changed. The latest revision is loaded; review the inputs before trying again."
              : cause.message,
          );
        } else
          setError(
            "We could not confirm that this request reached the server. Recover the saved request using its original identifier before starting another generation.",
          );
      } finally {
        setWorking(false);
      }
    },
    [
      working,
      pending,
      intent,
      setError,
      intentKey,
      project,
      lookId,
      kind,
      storageKey,
      refresh,
      onSuccess,
    ],
  );

  async function control(action: "resume" | "cancel") {
    if (!job || working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await (action === "resume"
        ? resumeJob(job.id)
        : cancelJob(job.id));
      setJob(result.job);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This saved attempt could not be updated.",
      );
    } finally {
      setWorking(false);
    }
  }
  return {
    job,
    pending,
    working,
    intent,
    generate,
    recover: () => (intent ? generate(intent.mode) : Promise.resolve()),
    control,
  };
}
