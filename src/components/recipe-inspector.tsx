"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Edit3, Sparkles } from "lucide-react";
import type { AppConfig, GarmentCategory, Look } from "@/lib/types";
import { getCurrentPreview } from "@/lib/domain/lineage";
import { money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
import { PreviewJobStatus } from "./preview-job-status";
import type { usePreviewJob } from "./use-preview-job";
import { RecordedPairGuide, useRecordedLibrary } from "./recorded-pair-guide";
import {
  PreviewAvailability,
  freshPreviewAvailable,
} from "./preview-availability";

export function RecipeInspector({
  look,
  jobState,
  pending,
  config,
  generate,
  onCast,
  onOpenLibrary,
}: {
  look: Look;
  jobState: ReturnType<typeof usePreviewJob>;
  pending: boolean;
  config: AppConfig | null;
  generate: (mode: "live" | "recorded") => Promise<void>;
  onCast: () => void;
  onOpenLibrary: (performerId: string) => void;
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
  const [paletteText, setPaletteText] = useState(
    character?.direction.palette.join(", ") || "",
  );
  const palette = paletteText.split(/[\s,;]+/).filter(Boolean);
  const paletteValid =
    palette.length <= 10 &&
    palette.every((color) => /^#[0-9a-f]{6}$/i.test(color));
  const unit = project.units.find((u) => u.id === unitId);
  const preview = getCurrentPreview(look, project);
  const needsPairGuide = !preview || unitId !== look.unitIds[0];
  const recordedLibrary = useRecordedLibrary({
    performerId: look.performerId || undefined,
    unitId,
    category: unitId === look.unitIds[0] ? look.category : unit?.category,
    enabled: !!look.performerId && !!unitId,
  });
  const savedReady = recordedLibrary.catalog?.selection?.ready === true;
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
    if (!character || !paletteValid) return;
    const result = await send({
      type: "edit_direction",
      characterId: character.id,
      text: direction,
      palette,
      essential: essential
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
    });
    if (result) setDirectionOpen(false);
  }
  return (
    <aside className="recipe-inspector">
      <section className="direction-note">
        <div className="section-title">
          <h3>Direction</h3>
          <button
            className="icon-button"
            aria-label="Edit character direction"
            onClick={() => setDirectionOpen(true)}
          >
            <Edit3 size={13} />
          </button>
        </div>
        <p>{character?.direction.text || "No direction yet"}</p>
        <div className="palette-swatches" aria-label="Character palette">
          {character?.direction.palette.map((color) => (
            <span key={color} style={{ background: color }} title={color} />
          ))}
        </div>
      </section>
      <form onSubmit={save} className="recipe-form">
        <div className="section-title">
          <h2>Recipe</h2>
        </div>
        <Field label="Costume unit">
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            required
          >
            <option value="">Choose a unit</option>
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
                {unit.availability.confirmed ? "Confirmed" : "Unconfirmed"}
              </Badge>
            </div>
          </div>
        )}
        {needsPairGuide && (
          <RecordedPairGuide
            library={recordedLibrary}
            onSelectUnit={setUnitId}
            onOpenLibrary={onOpenLibrary}
            disabled={busy}
          />
        )}
        <details className="recipe-details">
          <summary>Makeup & hair</summary>
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
        </details>
        <details className="recipe-details">
          <summary>Accessories & prep</summary>
          <Field label="Accessories">
            <textarea
              value={accessories}
              onChange={(event) => setAccessories(event.target.value)}
              maxLength={2000}
              rows={2}
            />
          </Field>
          <Field label="Prep time (min)">
            <input
              type="number"
              min="0"
              max="720"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
          <Field label="Continuity notes">
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
            <p>Saving resets the appearance approval.</p>
            <Button variant="primary" type="submit" busy={busy}>
              Save recipe
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </form>
      <section className="generation-panel">
        <div className="section-title">
          <h3>
            <Sparkles size={15} /> Preview
          </h3>
        </div>
        {!performer?.consent.granted || !performer.imageUrl ? (
          <>
            <Button onClick={onCast}>Add source photo</Button>
          </>
        ) : (
          <>
            {(config?.recordedPreviews ?? 1) > 0 && (
              <Button
                variant={!preview && savedReady ? "primary" : "default"}
                busy={jobState.recordedWorking || jobState.recordedPending}
                disabled={changed || !!jobState.recordedIntent}
                onClick={() => void generate("recorded")}
              >
                Use saved result
                <ArrowRight size={13} />
              </Button>
            )}
            <Button
              variant={!preview && !savedReady ? "primary" : "default"}
              busy={pending}
              disabled={
                changed ||
                !!jobState.intent ||
                !freshPreviewAvailable(config) ||
                unit?.status === "unavailable"
              }
              onClick={() => void generate("live")}
            >
              <Sparkles size={15} />
              {pending ? "Generating…" : "Generate preview"}
            </Button>
            <span className="generation-cost">
              2 units · {config?.ownerDailyJobLimit || 4}/day
            </span>
            <PreviewAvailability config={config} />
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
        Unit & fitting
        <ArrowRight size={14} />
      </Link>
      <Modal
        open={directionOpen}
        onClose={() => {
          if (!busy) setDirectionOpen(false);
        }}
        title="Direction"
      >
        <form onSubmit={saveDirection} className="form-stack">
          <Field label="Direction">
            <textarea
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              required
              maxLength={2000}
            />
          </Field>
          <Field label="Essentials">
            <textarea
              placeholder="One per line"
              value={essential}
              onChange={(event) => setEssential(event.target.value)}
              maxLength={1800}
            />
          </Field>
          <Field label="Palette">
            <input
              placeholder="#6B2948, #1B2232"
              value={paletteText}
              onChange={(event) => setPaletteText(event.target.value)}
              maxLength={100}
              aria-invalid={!paletteValid || undefined}
            />
          </Field>
          {!paletteValid && (
            <p className="text-danger">
              Use colours such as #6B2948, with at most ten entries.
            </p>
          )}
          <p className="muted">Saving resets affected approvals.</p>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button type="button" onClick={() => setDirectionOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!paletteValid}
              type="submit"
            >
              Save direction
            </Button>
          </div>
        </form>
      </Modal>
    </aside>
  );
}
