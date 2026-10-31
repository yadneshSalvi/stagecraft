"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Search,
  Shirt,
  SlidersHorizontal,
} from "lucide-react";
import { money, day } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, PageHeading, Photo } from "./ui";
import { UnitDialog, AddUnitDialog } from "./wardrobe-dialogs";
import { ChangeReview } from "./change-review";

export function WardrobeWorkspace() {
  const { project } = useProduction();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [changeId, setChangeId] = useState<string | null>(null);
  const units = project.units.filter(
    (unit) =>
      `${unit.name} ${unit.code} ${unit.supplier} ${unit.material}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        filter === unit.ownership ||
        (filter === "attention" &&
          (unit.status !== "available" || !unit.availability.confirmed))),
  );
  const selectedUnit = project.units.find((u) => u.id === selected);
  return (
    <>
      <PageHeading
        eyebrow="THE WARDROBE / A PHOTOGRAPHIC LEDGER"
        title="Beautiful things. Real commitments."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add a physical unit
          </Button>
        }
      >
        Every row is one garment you can locate, measure, allocate, and account
        for.
      </PageHeading>
      <div className="wardrobe-toolbar">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Search wardrobe</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a unit, fabric, or supplier…"
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
        <span className="mono">{units.length} PHYSICAL UNITS</span>
      </div>
      {!project.units.length ? (
        <EmptyState
          title="Open the costume room."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Shirt size={16} />
              Add the first physical unit
            </Button>
          }
        >
          A style is a design. A physical unit is the exact garment the crew
          will collect. Add each item with its own identifier and evidence.
        </EmptyState>
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
        >
          Try a unit code, garment name, fabric, or supplier.
        </EmptyState>
      ) : (
        <div className="wardrobe-ledger">
          <div className="ledger-head">
            <span>PHYSICAL UNIT</span>
            <span>EVIDENCE & LOCATION</span>
            <span>COMMITMENT</span>
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
                  <Photo src={unit.imageUrl} alt={unit.name} />
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
                    <div className="inline-badges">
                      <Badge
                        tone={
                          unit.status === "available" ? "neutral" : "danger"
                        }
                      >
                        {unit.status === "available"
                          ? "In inventory"
                          : unit.status}
                      </Badge>
                      {unit.availability.provenance === "synthetic" && (
                        <Badge tone="brass">Synthetic stock</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ledger-evidence">
                  <strong>{unit.location}</strong>
                  <span>{unit.supplier}</span>
                  <p>
                    {unit.availability.confirmed
                      ? "Availability evidence recorded"
                      : "Availability to confirm"}
                    <small>
                      Checked{" "}
                      {day(unit.availability.checkedAt, project.timeZone)}
                    </small>
                  </p>
                  <span className="fit-state">
                    {
                      {
                        not_measured: "Not measured / not fitted",
                        provisional: "Provisionally compatible",
                        scheduled: "Fitting scheduled",
                        confirmed: "Fitting evidence recorded",
                        alteration: "Alteration required",
                      }[unit.fitting.status]
                    }
                  </span>
                </div>
                <div className="ledger-commitment">
                  <strong>{money(unit.priceCents, project.currency)}</strong>
                  <span>
                    {unit.ownership === "rental"
                      ? "recorded hire quote"
                      : "owned stock value"}
                  </span>
                  <p>
                    {scenes.length
                      ? `${scenes.length} scene${scenes.length === 1 ? "" : "s"} depend on this unit`
                      : "Not yet in a look"}
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
      <div className="wardrobe-footnote">
        <SlidersHorizontal size={17} />
        <div>
          <strong>
            Availability, measurements, and appearance are different evidence.
          </strong>
          <p>
            A generated preview never confirms physical fit, movement range,
            condition, or a supplier booking. Provenance remains visible in
            every unit record.
          </p>
        </div>
      </div>
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
    </>
  );
}
