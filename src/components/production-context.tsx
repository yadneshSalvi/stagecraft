"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, commandProject, getConfig, getProject } from "@/lib/client";
import type { AppConfig, Production, ProductionCommand } from "@/lib/types";
import { Brand } from "./brand";
import { Button, Notice, Skeleton } from "./ui";
import Link from "next/link";

interface ProductionContextValue {
  project: Production;
  config: AppConfig | null;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  send: (command: ProductionCommand) => Promise<Production | null>;
  refresh: () => Promise<void>;
  setProject: (project: Production) => void;
  setError: (error: string | null) => void;
}
const Context = createContext<ProductionContextValue | null>(null);
export function useProduction() {
  const value = useContext(Context);
  if (!value) throw new Error("Production context missing");
  return value;
}
export function ProductionProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const [project, setProject] = useState<Production | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const [result, currentConfig] = await Promise.all([
      getProject(id),
      getConfig().catch(() => null),
    ]);
    setProject(result.project);
    setConfig(currentConfig);
  }, [id]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getProject(id), getConfig().catch(() => null)])
      .then(([result, config]) => {
        if (!cancelled) {
          setProject(result.project);
          setConfig(config);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const send = useCallback(
    async (command: ProductionCommand) => {
      if (!project || busy) return null;
      setBusy(true);
      setError(null);
      try {
        const result = await commandProject(project, command);
        setProject(result.project);
        return result.project;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 409) {
          await refresh().catch(() => {});
          setError(
            "The working book changed while this page was open. The latest revision is now loaded; review your choice and try again.",
          );
        } else
          setError(
            cause instanceof Error
              ? cause.message
              : "That change could not be saved.",
          );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [project, busy, refresh],
  );
  if (!project)
    return (
      <div className="workspace-loading">
        <Brand />
        <main id="main-content">
          {error ? (
            <>
              <Notice tone="danger">{error}</Notice>
              <div className="button-row">
                <Button
                  onClick={() => {
                    setError(null);
                    void refresh().catch((cause) => setError(cause.message));
                  }}
                >
                  Try again
                </Button>
                <Link className="button" href="/productions">
                  My productions
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow" role="status">
                OPENING YOUR PRODUCTION
              </p>
              <Skeleton className="skeleton-title" />
              <div className="skeleton-cast">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    );
  return (
    <Context.Provider
      value={{
        project,
        config,
        busy,
        error,
        clearError: () => setError(null),
        send,
        refresh,
        setProject,
        setError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
