"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  cancelJob,
  getJob,
  getJobByCommand,
  requestPreview,
  resumeJob,
} from "@/lib/client";
import type { PreviewJob, DetailKind } from "@/lib/types";
import { useProduction } from "./production-context";

type Mode = "live" | "recorded";
interface SavedIntent {
  mode: Mode;
  commandId: string;
}
const activeStates = new Set([
  "queued",
  "preparing",
  "submitting",
  "polling",
  "storing",
]);
const knownUnavailableCodes = new Set([
  "GENERATION_PAUSED",
  "GENERATION_UNAVAILABLE",
  "LIVE_PREVIEWS_RESTING",
  "YOUCAM_UNAVAILABLE",
  "PREVIEW_BUDGET_FLOOR",
  "PREVIEW_BUDGET_UNAVAILABLE",
  "BUDGET_FLOOR",
  "BUDGET_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
]);
function saved(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The in-memory attempt remains usable if browser storage is unavailable.
  }
  return null;
}
function readIntent(key: string): SavedIntent | null {
  try {
    const value: unknown = JSON.parse(saved(key) || "null");
    if (
      value &&
      typeof value === "object" &&
      "commandId" in value &&
      typeof value.commandId === "string" &&
      "mode" in value &&
      (value.mode === "live" || value.mode === "recorded")
    )
      return value as SavedIntent;
  } catch {
    saved(key, null);
  }
  return null;
}

export function usePreviewJob(
  lookId: string,
  kind: "garment" | "beauty" | DetailKind,
  onSuccess: () => void,
  candidateId?: string,
) {
  const { project, refresh, setError } = useProduction();
  const [job, setJob] = useState<PreviewJob | null>(null);
  const [recordedJob, setRecordedJob] = useState<PreviewJob | null>(null);
  const [working, setWorking] = useState(false);
  const [recordedWorking, setRecordedWorking] = useState(false);
  const [intent, setIntent] = useState<SavedIntent | null>(null);
  const [recordedIntent, setRecordedIntent] = useState<SavedIntent | null>(
    null,
  );
  const [notFound, setNotFound] = useState<Mode | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const locks = useRef({ live: false, recorded: false });
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);
  const storageKey = `stagecraft-job:${project.id}:${lookId}${kind === "garment" ? "" : `:${kind}`}${candidateId ? `:candidate:${candidateId}` : ""}`;
  const intentKey = `${storageKey}:intent`;
  const pending = !!job && activeStates.has(job.state);
  const recordedPending = !!recordedJob && activeStates.has(recordedJob.state);

  const accept = useCallback(
    async (next: PreviewJob, mode: Mode) => {
      const key = mode === "live" ? storageKey : `${storageKey}:recorded`;
      if (mode === "live") {
        setJob(next);
        setIntent(null);
      } else {
        setRecordedJob(next);
        setRecordedIntent(null);
      }
      saved(mode === "live" ? intentKey : `${intentKey}:recorded`, null);
      saved(key, activeStates.has(next.state) ? next.id : null);
      setNotFound(null);
      setRecoveryMessage(null);
      if (next.state === "succeeded") {
        try {
          await refresh();
          onSuccessRef.current();
        } catch {
          setError(
            "The result is saved. Reload the production to display its latest revision.",
          );
        }
      }
    },
    [storageKey, intentKey, refresh, setError],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const legacyIntent = readIntent(intentKey);
      const recorded = readIntent(`${intentKey}:recorded`);
      if (cancelled) return;
      setIntent(legacyIntent?.mode === "live" ? legacyIntent : null);
      setRecordedIntent(
        recorded || (legacyIntent?.mode === "recorded" ? legacyIntent : null),
      );
      if (legacyIntent?.mode === "recorded") {
        saved(`${intentKey}:recorded`, JSON.stringify(legacyIntent));
        saved(intentKey, null);
      }
      for (const mode of ["live", "recorded"] as const) {
        const key = mode === "live" ? storageKey : `${storageKey}:recorded`;
        const id = saved(key);
        if (!id) continue;
        try {
          const result = await getJob(id);
          if (!cancelled) await accept(result.job, mode);
        } catch (cause) {
          if (cause instanceof ApiError && [403, 404].includes(cause.status))
            saved(key, null);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, intentKey, accept]);

  const jobId = pending ? job?.id : undefined;
  const recordedJobId = recordedPending ? recordedJob?.id : undefined;
  useEffect(() => {
    if (!jobId && !recordedJobId) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        for (const [mode, id] of [
          ["live", jobId],
          ["recorded", recordedJobId],
        ] as const) {
          if (!id) continue;
          const result = await getJob(id);
          if (!cancelled) await accept(result.job, mode);
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "The saved preview status could not be loaded. Check its status to reconnect.",
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
  }, [jobId, recordedJobId, accept, setError]);

  const generate = useCallback(
    async (mode: Mode, retry?: SavedIntent) => {
      const previous = mode === "live" ? intent : recordedIntent;
      if (locks.current[mode] || (mode === "live" ? pending : recordedPending))
        return;
      if (previous && !retry) {
        setRecoveryMessage(
          "Check the saved request’s status before sending it again. Recorded results remain available separately.",
        );
        return;
      }
      locks.current[mode] = true;
      (mode === "live" ? setWorking : setRecordedWorking)(true);
      setError(null);
      const nextIntent = retry || { mode, commandId: crypto.randomUUID() };
      const key = mode === "live" ? intentKey : `${intentKey}:recorded`;
      (mode === "live" ? setIntent : setRecordedIntent)(nextIntent);
      saved(key, JSON.stringify(nextIntent));
      try {
        const result = await requestPreview(
          project,
          lookId,
          mode,
          kind,
          nextIntent.commandId,
          candidateId,
        );
        await accept(result.job, mode);
      } catch (cause) {
        const deterministic =
          cause instanceof ApiError &&
          (cause.status < 500 ||
            (cause.status === 503 &&
              knownUnavailableCodes.has(cause.code || "")));
        if (deterministic) {
          saved(key, null);
          (mode === "live" ? setIntent : setRecordedIntent)(null);
          if (cause.status === 409) await refresh().catch(() => {});
          setError(
            cause.status === 409
              ? "The working book changed. The latest revision is loaded; review the inputs before trying again."
              : cause.message,
          );
        } else {
          setRecoveryMessage(
            "The browser did not receive a confirmed result. Check the saved request’s status; this does not start another provider task.",
          );
        }
      } finally {
        locks.current[mode] = false;
        (mode === "live" ? setWorking : setRecordedWorking)(false);
      }
    },
    [
      intent,
      recordedIntent,
      pending,
      recordedPending,
      setError,
      intentKey,
      project,
      lookId,
      kind,
      candidateId,
      accept,
      refresh,
    ],
  );

  async function recover(mode: Mode = intent ? "live" : "recorded") {
    const target = mode === "live" ? intent : recordedIntent;
    if (!target || locks.current[mode]) return;
    locks.current[mode] = true;
    (mode === "live" ? setWorking : setRecordedWorking)(true);
    setError(null);
    try {
      const result = await getJobByCommand(project.id, target.commandId);
      if (result.job) await accept(result.job, mode);
      else {
        setNotFound(mode);
        setRecoveryMessage(
          "No saved job is visible for this request yet. Check again, or retry this same request identifier. A recorded result can still be used independently.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Status could not be checked. The original request is still saved.",
      );
    } finally {
      locks.current[mode] = false;
      (mode === "live" ? setWorking : setRecordedWorking)(false);
    }
  }
  async function control(action: "resume" | "cancel") {
    if (!job || locks.current.live) return;
    locks.current.live = true;
    setWorking(true);
    setError(null);
    try {
      const result = await (action === "resume"
        ? resumeJob(job.id)
        : cancelJob(job.id));
      await accept(result.job, "live");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This saved attempt could not be updated.",
      );
    } finally {
      locks.current.live = false;
      setWorking(false);
    }
  }
  return {
    job: job || recordedJob,
    recordedJob,
    pending,
    working,
    intent,
    recordedPending,
    recordedWorking,
    recordedIntent,
    recoveryMessage,
    notFound,
    generate: (mode: Mode) => generate(mode),
    recover,
    control,
    retrySaved: () => {
      const target =
        notFound === "live"
          ? intent
          : notFound === "recorded"
            ? recordedIntent
            : null;
      return target ? generate(target.mode, target) : Promise.resolve();
    },
  };
}
