"use client";
import { useState } from "react";
import { Check, Plus, Shirt, Users } from "lucide-react";
import type { Production } from "@/lib/types";
import { money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo, Skeleton } from "./ui";
import { InitialCasting } from "./initial-casting";
import { useRecordedLibrary } from "./recorded-pair-guide";

type LibraryKind = "cast" | "wardrobe";
export function ExampleLibrary({
  kind,
  onImported,
  initialPerformerId,
  onSectionChange,
}: {
  kind: LibraryKind;
  onImported?: (project: Production, id: string) => void;
  initialPerformerId?: string;
  onSectionChange?: (kind: LibraryKind) => void;
}) {
  const { project, send, busy, error } = useProduction();
  const { catalog, error: loadError, retry } = useRecordedLibrary();
  const [adding, setAdding] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [selectedPerformer, setSelectedPerformer] = useState(
    initialPerformerId || "",
  );
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
        <Button onClick={retry}>Reload library</Button>
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
  const selectedPerformerId =
    selectedPerformer ||
    catalog.project?.performerBindings.find((binding) =>
      project.characters.some(
        (character) => character.performerId === binding.performerId,
      ),
    )?.libraryPerformerId ||
    catalog.performers[0]?.id ||
    "";
  return (
    <div className="example-library">
      {kind === "wardrobe" && (
        <div className="library-pair-filter">
          <Field label="Preview with performer">
            <select
              value={selectedPerformerId}
              onChange={(event) => setSelectedPerformer(event.target.value)}
            >
              {catalog.performers.map((performer) => (
                <option key={performer.id} value={performer.id}>
                  {performer.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {kind === "cast" && lastAdded && (
        <div className="library-casting">
          <strong>
            {project.performers.find((item) => item.id === lastAdded)?.name}{" "}
            added
          </strong>
          <InitialCasting performerId={lastAdded} />
        </div>
      )}
      <div className="library-grid">
        {items.map((item) => {
          const readyPairs = catalog.readyPairs.filter((pair) =>
            kind === "cast"
              ? pair.performerId === item.id
              : pair.unitId === item.id &&
                pair.performerId === selectedPerformerId,
          );
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
                natural
                src={item.imageUrl}
                alt={`${item.name}, synthetic library reference`}
                sizes="(max-width: 700px) 40vw, 180px"
              />
              <div>
                {"code" in item && (
                  <span className="mono">
                    {item.code} · {money(item.priceCents, project.currency)}
                  </span>
                )}
                <h3>{item.name}</h3>
                {readyPairs.length > 0 && (
                  <Badge tone="success">
                    {kind === "cast"
                      ? `${new Set(readyPairs.map((pair) => pair.unitId)).size} previews ready`
                      : "Preview ready"}
                  </Badge>
                )}
                {count > 0 && (
                  <small>
                    <Check size={12} />
                    Added{count > 1 ? ` ×${count}` : ""}
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
                {kind === "cast" &&
                  readyPairs.length > 0 &&
                  onSectionChange && (
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => {
                        setSelectedPerformer(item.id);
                        onSectionChange("wardrobe");
                      }}
                    >
                      See ready garments
                    </Button>
                  )}
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
  initialPerformerId,
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: LibraryKind;
  initialPerformerId?: string;
}) {
  return open ? (
    <LibraryDialogSession
      onClose={onClose}
      initialKind={initialKind}
      initialPerformerId={initialPerformerId}
    />
  ) : null;
}

function LibraryDialogSession({
  onClose,
  initialKind,
  initialPerformerId,
}: {
  onClose: () => void;
  initialKind: LibraryKind;
  initialPerformerId?: string;
}) {
  const { busy } = useProduction();
  const [kind, setKind] = useState<LibraryKind>(initialKind);
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
      title="Example library"
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
          Cast
        </button>
        <button
          onClick={() => setKind("wardrobe")}
          className={kind === "wardrobe" ? "active" : ""}
          aria-pressed={kind === "wardrobe"}
        >
          <Shirt size={15} />
          Wardrobe
        </button>
      </div>
      <ExampleLibrary
        kind={kind}
        initialPerformerId={initialPerformerId}
        onSectionChange={setKind}
      />
      <div className="modal-actions">
        <Button onClick={onClose} disabled={busy}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
