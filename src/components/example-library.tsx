"use client";
import { useEffect, useState } from "react";
import { Check, Plus, Shirt, Users } from "lucide-react";
import { api } from "@/lib/client";
import type { Performer, PhysicalUnit, Production } from "@/lib/types";
import { money } from "@/lib/format";
import { useProduction } from "./production-context";
import { ProvenanceChip } from "./provenance-chip";
import { Button, Modal, Notice, Photo, Skeleton } from "./ui";
import { InitialCasting } from "./initial-casting";

type LibraryKind = "cast" | "wardrobe";
interface LibraryCatalog {
  performers: Pick<
    Performer,
    "id" | "name" | "imageUrl" | "synthetic" | "faceCapture"
  >[];
  units: Pick<
    PhysicalUnit,
    | "id"
    | "code"
    | "name"
    | "category"
    | "imageUrl"
    | "material"
    | "color"
    | "priceCents"
  >[];
}
export function ExampleLibrary({
  kind,
  onImported,
}: {
  kind: LibraryKind;
  onImported?: (project: Production, id: string) => void;
}) {
  const { project, send, busy, error } = useProduction();
  const [catalog, setCatalog] = useState<LibraryCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<LibraryCatalog>("/api/library")
      .then((value) => {
        if (!cancelled) {
          setCatalog(value);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setLoadError(
            "The example library could not be loaded. Your production is unchanged.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  async function add(id: string) {
    if (adding || busy) return;
    setAdding(id);
    try {
      const result = await send(
        kind === "cast"
          ? { type: "import_example_performer", sourcePerformerId: id }
          : { type: "import_example_unit", sourceUnitId: id },
      );
      if (result) {
        const item =
          kind === "cast" ? result.performers.at(-1) : result.units.at(-1);
        if (item) {
          setLastAdded(item.id);
          onImported?.(result, item.id);
        }
      }
    } finally {
      setAdding(null);
    }
  }
  if (loadError)
    return (
      <>
        <Notice tone="danger">{loadError}</Notice>
        <Button onClick={() => setRetry((value) => value + 1)}>
          Reload library
        </Button>
      </>
    );
  if (!catalog)
    return (
      <div
        className="library-loading"
        role="status"
        aria-label="Loading example library"
      >
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  const items = kind === "cast" ? catalog.performers : catalog.units;
  return (
    <div className="example-library">
      <div className="library-intro">
        <ProvenanceChip kind="synthetic" />
        <p>
          Use these permitted references in your own script. Matching genuine
          recordings can be reused when the actual provider inputs agree.
        </p>
      </div>
      {kind === "cast" && lastAdded && (
        <div className="library-casting">
          <strong>
            {project.performers.find((item) => item.id === lastAdded)?.name} is
            in the cast library.
          </strong>
          <InitialCasting performerId={lastAdded} />
        </div>
      )}
      <div className="library-grid">
        {items.map((item) => {
          const count = (
            kind === "cast" ? project.performers : project.units
          ).filter(
            (existing) =>
              existing.librarySourceId === item.id ||
              (project.fixture && existing.id === item.id),
          ).length;
          return (
            <article className="library-card" key={item.id}>
              <Photo
                src={item.imageUrl}
                alt={`${item.name}, synthetic library reference`}
                sizes="(max-width: 700px) 40vw, 180px"
              />
              <div>
                <span className="mono">
                  {"code" in item
                    ? `${item.code} · ${money(item.priceCents, project.currency)}`
                    : "FICTIONAL ADULT"}
                </span>
                <h3>{item.name}</h3>
                {count > 0 && (
                  <small>
                    <Check size={12} />
                    {count}{" "}
                    {kind === "cast"
                      ? "cast reference"
                      : "physical unit record"}
                    {count === 1 ? "" : "s"} added
                  </small>
                )}
                <Button
                  type="button"
                  busy={adding === item.id}
                  disabled={busy || !!adding}
                  onClick={() => void add(item.id)}
                >
                  <Plus size={14} />
                  {count
                    ? "Add another copy"
                    : kind === "cast"
                      ? "Add to cast"
                      : "Add to wardrobe"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
export function LibraryDialog({
  open,
  onClose,
  initialKind = "cast",
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: LibraryKind;
}) {
  const { busy } = useProduction();
  const [kind, setKind] = useState<LibraryKind>(initialKind);
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
      title="A small company. A considered wardrobe."
      description="Add labelled example references without replacing your script or existing work."
    >
      <div
        className="segmented library-tabs"
        aria-label="Example library section"
      >
        <button
          onClick={() => setKind("cast")}
          className={kind === "cast" ? "active" : ""}
          aria-pressed={kind === "cast"}
        >
          <Users size={15} />
          Cast sources
        </button>
        <button
          onClick={() => setKind("wardrobe")}
          className={kind === "wardrobe" ? "active" : ""}
          aria-pressed={kind === "wardrobe"}
        >
          <Shirt size={15} />
          Garment references
        </button>
      </div>
      {open && <ExampleLibrary kind={kind} />}
      <div className="modal-actions">
        <Button onClick={onClose} disabled={busy}>
          Return to production
        </Button>
      </div>
    </Modal>
  );
}
