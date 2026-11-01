"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Library, RefreshCcw } from "lucide-react";
import { api } from "@/lib/client";
import type {
  LibraryCatalog,
  LibraryPairSuggestion,
} from "@/lib/library-types";
import type { GarmentCategory } from "@/lib/types";
import { useProduction } from "./production-context";
import { Badge, Button, Photo } from "./ui";

export function useRecordedLibrary({
  performerId,
  unitId,
  category,
  enabled = true,
}: {
  performerId?: string;
  unitId?: string;
  category?: GarmentCategory;
  enabled?: boolean;
} = {}) {
  const { project } = useProduction();
  const [attempt, setAttempt] = useState(0);
  const key = `${project.id}:${project.revision}:${performerId || ""}:${unitId || ""}:${category || ""}:${attempt}`;
  const [response, setResponse] = useState<{
    key: string;
    catalog: LibraryCatalog | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    const query = new URLSearchParams({ projectId: project.id });
    if (performerId && unitId) {
      query.set("performerId", performerId);
      query.set("unitId", unitId);
      if (category) query.set("category", category);
    }
    api<LibraryCatalog>(`/api/library?${query}`, { signal: controller.signal })
      .then((catalog) => {
        if (cancelled) return;
        if (catalog.project?.revision !== project.revision) {
          setResponse({
            key,
            catalog: null,
            error:
              "The working book changed during the check. Check these references again.",
          });
          return;
        }
        setResponse({ key, catalog, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setResponse({
            key,
            catalog: null,
            error:
              "Recorded pairing could not be checked. Your selected references are unchanged.",
          });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    category,
    enabled,
    key,
    performerId,
    project.id,
    project.revision,
    unitId,
  ]);
  const current = response?.key === key ? response : null;
  return {
    catalog: enabled ? current?.catalog || null : null,
    error: enabled ? current?.error || null : null,
    loading: enabled && !current,
    retry: () => setAttempt((value) => value + 1),
  };
}

export function RecordedPairGuide({
  library,
  onSelectUnit,
  onOpenLibrary,
  disabled = false,
}: {
  library: ReturnType<typeof useRecordedLibrary>;
  onSelectUnit: (unitId: string) => void;
  onOpenLibrary?: (performerId: string) => void;
  disabled?: boolean;
}) {
  const { project, send, busy } = useProduction();
  const [adding, setAdding] = useState<string | null>(null);
  const { catalog, loading, error, retry } = library;
  const selection = catalog?.selection;
  async function choose(suggestion: LibraryPairSuggestion) {
    if (disabled || busy || adding || suggestion.change !== "garment") return;
    if (suggestion.projectUnitId) {
      onSelectUnit(suggestion.projectUnitId);
      return;
    }
    setAdding(suggestion.unitId);
    try {
      const next = await send({
        type: "import_example_unit",
        sourceUnitId: suggestion.unitId,
      });
      const imported = next?.units.find(
        (unit) =>
          unit.librarySourceId === suggestion.unitId &&
          !project.units.some((old) => old.id === unit.id),
      );
      if (imported) onSelectUnit(imported.id);
    } finally {
      setAdding(null);
    }
  }
  if (loading)
    return (
      <p className="pair-check-status" role="status">
        Checking available recorded pairings…
      </p>
    );
  if (error)
    return (
      <div className="recorded-pair-guide pair-unchecked">
        <p>{error}</p>
        <Button type="button" variant="quiet" onClick={retry}>
          <RefreshCcw size={14} /> Check recorded pairings
        </Button>
      </div>
    );
  if (!catalog || !selection) return null;
  if (selection.ready)
    return (
      <div className="recorded-pair-guide pair-ready" role="status">
        <Badge tone="success">Ready preview</Badge>
        <p>
          A verified recording matches these sources. Reuse costs no fresh
          units; review the result before allocation.
        </p>
      </div>
    );
  const samePerformer = selection.suggestions.filter(
    (item) => item.change === "garment",
  );
  const suggestions = (
    samePerformer.length ? samePerformer : selection.suggestions
  ).slice(0, 3);
  return (
    <section
      className="recorded-pair-guide"
      aria-label="Recorded preview options"
    >
      <div className="pair-guide-title">
        <Library size={16} />
        <strong>
          {selection.reason === "permission_required"
            ? "Source permission needed"
            : selection.reason === "source_unavailable"
              ? "Source unavailable"
              : "No recording for this pairing"}
        </strong>
      </div>
      <p>{selection.message}</p>
      {suggestions.length > 0 && (
        <>
          <p className="pair-suggestion-intro">
            {samePerformer.length
              ? "Keep this performer and choose one of these recorded garments."
              : "These library pairs have recordings. Using one requires choosing its named performer explicitly."}
          </p>
          <div className="pair-suggestions">
            {suggestions.map((suggestion) => {
              const unit = catalog.units.find(
                (item) => item.id === suggestion.unitId,
              );
              const performer = catalog.performers.find(
                (item) => item.id === suggestion.performerId,
              );
              return (
                <article key={`${suggestion.performerId}:${suggestion.unitId}`}>
                  <Photo
                    src={suggestion.previewImageUrl}
                    alt={`Recorded YouCam pairing: ${performer?.name}, ${unit?.name}`}
                    sizes="72px"
                  />
                  <div>
                    <span className="mono">
                      RECORDED YOUCAM · 0 FRESH UNITS
                    </span>
                    <strong>
                      {unit?.code} · {unit?.name}
                    </strong>
                    <p>{performer?.name}</p>
                    {suggestion.change === "garment" ? (
                      <Button
                        type="button"
                        variant="quiet"
                        busy={adding === suggestion.unitId}
                        disabled={disabled || busy || !!adding}
                        onClick={() => void choose(suggestion)}
                      >
                        {suggestion.projectUnitId ? "Use" : "Add & use"}{" "}
                        {unit?.code} <ArrowRight size={13} />
                      </Button>
                    ) : onOpenLibrary ? (
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={disabled || busy}
                        onClick={() => onOpenLibrary(suggestion.performerId)}
                      >
                        Review this library pair <ArrowRight size={13} />
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
