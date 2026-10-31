"use client";
import type {
  AppConfig,
  Production,
  ProductionCommand,
  PreviewJob,
} from "./types";
import { ensureAuthenticated } from "./auth-client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (path !== "/api/config") await ensureAuthenticated();
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      typeof body?.error === "string"
        ? body.error
        : body?.error?.message ||
            body?.message ||
            "That change could not be saved. Your production is still here.",
      response.status,
      body?.error?.code || body?.code,
    );
  return body as T;
}
export const getConfig = () => api<AppConfig>("/api/config");
export type ProjectSummary = Pick<
  Production,
  "id" | "title" | "fixture" | "revision" | "updatedAt" | "timeZone"
> & { characterCount: number; sceneCount: number };
export const listProjects = () =>
  api<{ projects: ProjectSummary[] }>("/api/projects");
export const createProject = (mode: "example" | "blank", title?: string) =>
  api<{ project: Production }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ mode, title }),
  });
export const getProject = (id: string) =>
  api<{ project: Production }>(`/api/projects/${encodeURIComponent(id)}`);
export const commandProject = (
  project: Production,
  command: ProductionCommand,
) =>
  api<{ project: Production }>(
    `/api/projects/${encodeURIComponent(project.id)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: project.revision,
        commandId: crypto.randomUUID(),
        command,
      }),
    },
  );
export const requestPreview = (
  project: Production,
  lookId: string,
  mode: "live" | "recorded",
  kind: "garment" | "beauty" = "garment",
  commandId = crypto.randomUUID(),
) =>
  api<{ job: PreviewJob }>(
    `/api/projects/${encodeURIComponent(project.id)}/previews`,
    {
      method: "POST",
      body: JSON.stringify({
        lookId,
        mode,
        commandId,
        kind,
        expectedRevision: project.revision,
      }),
    },
  );
export const getJob = (id: string) =>
  api<{ job: PreviewJob }>(`/api/jobs/${encodeURIComponent(id)}`);
export const deleteProject = (id: string) =>
  api<{ deleted: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const resumeJob = (id: string) =>
  api<{ job: PreviewJob }>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: "POST",
  });
export const cancelJob = (id: string) =>
  api<{ job: PreviewJob }>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
