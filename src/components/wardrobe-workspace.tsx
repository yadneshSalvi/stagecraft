"use client";
import { useState } from "react";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { displayFixtureText } from "@/lib/presentation-copy";
import { money, day } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, PageHeading, Photo } from "./ui";
import { UnitDialog, AddUnitDialog } from "./wardrobe-dialogs";
import { ChangeReview } from "./change-review";
import { LibraryDialog } from "./example-library";
import "./round3-wardrobe-handoff.css";

export function WardrobeWorkspace() {
  const { project } = useProduction();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [library, setLibrary] = useState(false);
  const [changeId, setChangeId] = useState<string | null>(null);
  const units = project.units.filter(
    (unit) =>
      `${unit.name} ${unit.code} ${displayFixtureText(unit.supplier, project.fixture)} ${unit.material}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        filter === unit.ownership ||
        (filter === "attention" &&
          (unit.status !== "available" || !unit.availability.confirmed))),
  );
  const selectedUnit = project.units.find((u) => u.id === selected);
  return (
    <div className="r3-wardrobe">
      <PageHeading
        title="Wardrobe"
        action={
          <>
            <Button onClick={() => setLibrary(true)}>Example library</Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add unit
            </Button>
          </>
        }
      />
      <LibraryDialog
        open={library}
        onClose={() => setLibrary(false)}
        initialKind="wardrobe"
      />
      <div className="wardrobe-toolbar">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Search wardrobe</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search units…"
          />
        </label>
        <div className="segmented" aria-label="Wardrobe filter">
          {[
            { id: "all", label: "All units" },
            { id: "owned", label: "Owned" },
            { id: "rental", label: "Rental" },
            { id: "attention", label: "Needs attention" },
          ].map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="mono">{units.length} units</span>
      </div>
      {!project.units.length ? (
        <EmptyState title="No units yet" />
      ) : !units.length ? (
        <EmptyState
          title="No unit matches that search."
          action={
            <Button
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="wardrobe-ledger">
          <div className="ledger-head">
            <span>Unit</span>
            <span>Location</span>
            <span>Use</span>
            <span />
          </div>
          {units.map((unit) => {
            const looks = project.looks.filter((look) =>
              look.unitIds.includes(unit.id),
            );
            const scenes = [...new Set(looks.flatMap((look) => look.sceneIds))];
            return (
              <button
                key={unit.id}
                className="ledger-row"
                onClick={() => setSelected(unit.id)}
              >
                <div className="ledger-unit">
                  <Photo natural src={unit.imageUrl} alt={unit.name} />
                  <div>
                    <span className="mono">
                      {unit.code}{" "}
                      <span className="unit-ownership">
                        / {unit.ownership.toUpperCase()}
                      </span>
                    </span>
                    <h2>{unit.name}</h2>
                    <p>
                      {unit.material} · {unit.color}
                    </p>
                    {unit.status !== "available" && (
                      <Badge tone="danger">Unavailable</Badge>
                    )}
                  </div>
                </div>
                <div className="ledger-evidence">
                  <strong>{unit.location}</strong>
                  <span>
                    {displayFixtureText(unit.supplier, project.fixture)}
                  </span>
                  <p>
                    {unit.availability.confirmed ? "Confirmed" : "Unconfirmed"}
                    <small>
                      {day(unit.availability.checkedAt, project.timeZone)}
                    </small>
                  </p>
                  <span className="fit-state">
                    {
                      {
                        not_measured: "Not fitted",
                        provisional: "Provisional",
                        scheduled: "Fitting booked",
                        confirmed: "Fitted",
                        alteration: "Needs alteration",
                      }[unit.fitting.status]
                    }
                  </span>
                </div>
                <div className="ledger-commitment">
                  <strong>{money(unit.priceCents, project.currency)}</strong>
                  <p>
                    {scenes.length
                      ? `${scenes.length} scene${scenes.length === 1 ? "" : "s"}`
                      : "Unused"}
                  </p>
                  <small>
                    {looks
                      .map(
                        (look) =>
                          project.characters.find(
                            (c) => c.id === look.characterId,
                          )?.name,
                      )
                      .filter(Boolean)
                      .join(" / ")}
                  </small>
                </div>
                <ArrowUpRight size={18} />
              </button>
            );
          })}
        </div>
      )}
      {selectedUnit && (
        <UnitDialog
          unit={selectedUnit}
          onClose={() => setSelected(null)}
          onChange={() => {
            setChangeId(selectedUnit.id);
            setSelected(null);
          }}
        />
      )}
      <AddUnitDialog open={adding} onClose={() => setAdding(false)} />
      {changeId && (
        <ChangeReview
          key={changeId}
          open
          onClose={() => setChangeId(null)}
          initialUnitId={changeId}
        />
      )}
    </div>
  );
}
