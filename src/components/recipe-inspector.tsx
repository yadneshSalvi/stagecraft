"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Edit3, Sparkles } from "lucide-react";
import type { AppConfig, GarmentCategory, Look } from "@/lib/types";
import { money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
import { PreviewJobStatus } from "./preview-job-status";
import type { usePreviewJob } from "./use-preview-job";

export function RecipeInspector({
  look,
  jobState,
  pending,
  config,
  generate,
  onCast,
}: {
  look: Look;
  jobState: ReturnType<typeof usePreviewJob>;
  pending: boolean;
  config: AppConfig | null;
  generate: (mode: "live" | "recorded") => Promise<void>;
  onCast: () => void;
}) {
  const { project, send, busy, error } = useProduction();
  const character = project.characters.find((c) => c.id === look.characterId);
  const performer = project.performers.find((p) => p.id === look.performerId);
  const [unitId, setUnitId] = useState(look.unitIds[0] || "");
  const [makeup, setMakeup] = useState(look.makeup.notes);
  const [hair, setHair] = useState(look.hair);
  const [accessories, setAccessories] = useState(look.accessories);
  const [note, setNote] = useState(look.note);
  const [minutes, setMinutes] = useState(
    look.preparationMinutes === null ? "" : String(look.preparationMinutes),
  );
  const [directionOpen, setDirectionOpen] = useState(false);
  const [direction, setDirection] = useState(character?.direction.text || "");
  const [essential, setEssential] = useState(
    character?.direction.essential.join("\n") || "",
  );
  const [designer, setDesigner] = useState("");
  const unit = project.units.find((u) => u.id === unitId);
  const changed =
    unitId !== look.unitIds[0] ||
    makeup !== look.makeup.notes ||
    hair !== look.hair ||
    accessories !== look.accessories ||
    note !== look.note ||
    minutes !==
      (look.preparationMinutes === null ? "" : String(look.preparationMinutes));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await send({
      type: "update_look",
      lookId: look.id,
      unitIds: [unitId, ...look.unitIds.slice(1)],
      category: (unit?.category || look.category) as GarmentCategory,
      makeupNotes: makeup,
      hair,
      accessories,
      note,
      preparationMinutes: minutes === "" ? null : Number(minutes),
    });
  }
  async function saveDirection(event: React.FormEvent) {
    event.preventDefault();
    if (!character) return;
    const result = await send({
      type: "update_direction",
      characterId: character.id,
      text: direction,
      essential: essential
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
      approvedBy: designer,
    });
    if (result) setDirectionOpen(false);
  }
  return (
    <aside className="recipe-inspector">
      <section className="direction-note">
        <div className="section-title">
          <span className="eyebrow">CHARACTER DIRECTION</span>
          <button
            className="icon-button"
            aria-label="Edit character direction"
            onClick={() => setDirectionOpen(true)}
          >
            <Edit3 size={13} />
          </button>
        </div>
        <p>
          {character?.direction.text ||
            "Give this character a visual direction."}
        </p>
        <div className="palette-swatches" aria-label="Character palette">
          {character?.direction.palette.map((color) => (
            <span key={color} style={{ background: color }} title={color} />
          ))}
        </div>
        {character?.direction.approvedBy && (
          <small>Direction by {character.direction.approvedBy}</small>
        )}
      </section>
      <form onSubmit={save} className="recipe-form">
        <div className="section-title">
          <h2>The recipe</h2>
          <span className="mono">EXACT REFERENCES</span>
        </div>
        <Field label="01 / Costume unit">
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            required
          >
            <option value="">Choose a physical unit</option>
            {project.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} · {u.name}
                {u.status !== "available" ? ` · ${u.status}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {unit && (
          <div className="recipe-garment">
            <Photo src={unit.imageUrl} alt={`Source garment: ${unit.name}`} />
            <div>
              <span className="mono">{unit.code}</span>
              <strong>{unit.name}</strong>
              <p>{unit.material}</p>
              <span>
                {money(unit.priceCents, project.currency)}{" "}
                <small>
                  {unit.ownership === "rental" ? "quoted hire" : "owned stock"}
                </small>
              </span>
              <Badge tone={unit.status === "available" ? "neutral" : "danger"}>
                {unit.availability.confirmed
                  ? "Availability recorded"
                  : "Availability to confirm"}
              </Badge>
            </div>
          </div>
        )}
        <details className="recipe-details" open>
          <summary>02 / Makeup & hair direction</summary>
          <Field label="Makeup notes">
            <textarea
              value={makeup}
              onChange={(event) => setMakeup(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          </Field>
          <Field label="Hair direction">
            <input
              value={hair}
              onChange={(event) => setHair(event.target.value)}
              maxLength={800}
            />
          </Field>
          <p className="recipe-disclaimer">
            These are crew application notes. The garment preview does not
            render makeup or hair.
          </p>
        </details>
        <details className="recipe-details">
          <summary>03 / Accessories & preparation</summary>
          <Field label="Accessories">
            <textarea
              value={accessories}
              onChange={(event) => setAccessories(event.target.value)}
              maxLength={2000}
              rows={2}
            />
          </Field>
          <Field
            label="Preparation estimate (minutes)"
            hint="An estimate remains provisional until observed. Leave empty when unknown."
          >
            <input
              type="number"
              min="0"
              max="720"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
          <Field label="Continuity & application notes">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={3}
            />
          </Field>
        </details>
        {changed && (
          <div className="recipe-save">
            <p>
              Saving creates a new recipe revision and requires a new appearance
              review.
            </p>
            <Button variant="primary" type="submit" busy={busy}>
              Save recipe revision
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </form>
      <section className="generation-panel">
        <div className="section-title">
          <h3>
            <Sparkles size={15} /> Bring the garment into focus
          </h3>
        </div>
        <p>
          Clothes V4 uses this performer and this garment reference. Inspect the
          silhouette, details, and any changes from the source.
        </p>
        {!performer?.consent.granted || !performer.imageUrl ? (
          <>
            <Notice tone="warning">
              A permitted, usable performer source is needed before generating.
            </Notice>
            <Button onClick={onCast}>Add a source photo</Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              busy={pending}
              disabled={
                changed ||
                !!jobState.intent ||
                !config?.youcam ||
                config.generationPaused ||
                unit?.status === "unavailable"
              }
              onClick={() => void generate("live")}
            >
              <Sparkles size={15} />
              {pending ? "Preview in progress" : "Generate a fresh preview"}
            </Button>
            <span className="generation-cost">
              Est. 2 YouCam units · {config?.ownerDailyJobLimit || 4} fresh jobs
              per browser / day
            </span>
            {config?.generationPaused && (
              <Notice tone="warning">
                Fresh generation is paused. Recorded results remain available.
              </Notice>
            )}
            {!config?.youcam && (
              <Notice>
                Fresh generation is currently unavailable. You can still review
                saved outputs.
              </Notice>
            )}
            {project.fixture && (config?.recordedPreviews || 0) > 0 && (
              <Button
                disabled={changed || pending || !!jobState.intent}
                onClick={() => void generate("recorded")}
              >
                Use matching recorded result
                <ArrowRight size={13} />
              </Button>
            )}
            {changed && (
              <p className="text-warning">Save the recipe before generating.</p>
            )}
          </>
        )}
        <PreviewJobStatus state={jobState} />
      </section>
      <Link
        className="recipe-unit-link"
        href={`/production/${project.id}/wardrobe`}
      >
        Inspect physical unit & fitting evidence
        <ArrowRight size={14} />
      </Link>
      <Modal
        open={directionOpen}
        onClose={() => {
          if (!busy) setDirectionOpen(false);
        }}
        title="The character’s visual direction"
        description="Direction belongs to the story. It stays intact when the performer changes."
      >
        <form onSubmit={saveDirection} className="form-stack">
          <Field label="Character direction">
            <textarea
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              required
              maxLength={2000}
            />
          </Field>
          <Field
            label="Essential details"
            hint="One per line. Changes to these requirements need a designer’s decision."
          >
            <textarea
              value={essential}
              onChange={(event) => setEssential(event.target.value)}
              maxLength={1800}
            />
          </Field>
          <Field label="Designer name or role">
            <input
              required
              value={designer}
              onChange={(event) => setDesigner(event.target.value)}
              minLength={2}
              maxLength={100}
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button type="button" onClick={() => setDirectionOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy} type="submit">
              Record direction
            </Button>
          </div>
        </form>
      </Modal>
    </aside>
  );
}
