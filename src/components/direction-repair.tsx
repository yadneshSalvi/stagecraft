"use client";
import { useRef, useState } from "react";
import type { Character, Production } from "@/lib/types";
import { getDirectionReferenceReview } from "@/lib/domain/direction";
import { useProduction } from "./production-context";
import { Button, Field, Modal, Notice } from "./ui";

export function DirectionRepair({
  character,
  busy,
  onSave,
}: {
  character: Character;
  busy: boolean;
  onSave: (
    characterId: string,
    text: string,
    essential: string[],
    palette: string[],
  ) => Promise<boolean>;
}) {
  const [text, setText] = useState(character.direction.text);
  const [essential, setEssential] = useState(
    character.direction.essential.join("\n"),
  );
  const [paletteText, setPaletteText] = useState(
    character.direction.palette.join(", "),
  );
  const [saved, setSaved] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const palette = paletteText.split(/[\s,;]+/).filter(Boolean);
  const paletteValid =
    palette.length <= 10 &&
    palette.every((color) => /^#[0-9a-f]{6}$/i.test(color));
  return (
    <details className="direction-repair" ref={details}>
      <summary>
        {saved
          ? `${character.name} · saved`
          : `Edit ${character.name}’s direction`}
      </summary>
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!paletteValid) return;
          if (
            await onSave(
              character.id,
              text,
              essential
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
              palette,
            )
          ) {
            setSaved(true);
            if (details.current) details.current.open = false;
          }
        }}
      >
        <Field label="Direction">
          <textarea
            aria-label={`${character.name} character direction`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSaved(false);
            }}
            maxLength={2000}
            required
          />
        </Field>
        <Field label="Essentials">
          <textarea
            aria-label={`${character.name} essential details`}
            placeholder="One per line"
            value={essential}
            onChange={(event) => {
              setEssential(event.target.value);
              setSaved(false);
            }}
            maxLength={1800}
          />
        </Field>
        <Field label="Palette">
          <input
            aria-label={`${character.name} colour palette`}
            placeholder="#6B2948, #1B2232"
            value={paletteText}
            onChange={(event) => {
              setPaletteText(event.target.value);
              setSaved(false);
            }}
            maxLength={100}
            aria-invalid={!paletteValid || undefined}
          />
        </Field>
        {!paletteValid && (
          <p className="text-danger">
            Use colours such as #6B2948, with at most ten entries.
          </p>
        )}
        <p className="muted">Saving resets this look&apos;s approval.</p>
        <Button busy={busy} disabled={!paletteValid} type="submit">
          Save direction
        </Button>
      </form>
    </details>
  );
}

export function DirectionAcknowledgement({
  characterId,
  unitId,
  onMutationStart,
  onMutationEnd,
}: {
  characterId: string;
  unitId: string;
  onMutationStart?: () => void;
  onMutationEnd?: (project: Production | null) => void;
}) {
  const { project, send, busy, error, clearError } = useProduction();
  const current = getDirectionReferenceReview(project, characterId, unitId);
  const [target, setTarget] = useState<typeof current>();
  const [open, setOpen] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const changed =
    !!target &&
    (current?.referenceHash !== target.referenceHash ||
      project.revision !== target.sourceRevision);
  if (!current && !open) return null;
  return (
    <>
      <Button
        variant="quiet"
        disabled={busy || !current}
        onClick={() => {
          clearError();
          setTarget(current);
          setOpen(true);
        }}
      >
        Keep these words deliberately
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Keep direction wording"
      >
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target || changed) return;
            onMutationStart?.();
            const next = await send({
              type: "acknowledge_direction_reference",
              characterId,
              unitId,
              sourceRevision: target.sourceRevision,
              referenceHash: target.referenceHash,
              acknowledgedBy: reviewer.trim(),
              rationale: note.trim(),
            });
            if (next) setOpen(false);
            onMutationEnd?.(next);
          }}
        >
          <p>{target?.references.join(" · ")}</p>
          <Field label="Reviewer">
            <input
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              minLength={2}
              maxLength={100}
              required
            />
          </Field>
          <Field label="Reason">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={5}
              maxLength={1000}
              required
            />
          </Field>
          {changed && (
            <Notice tone="warning">
              Production changed. Reopen this decision.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              busy={busy}
              disabled={changed}
            >
              Keep these words
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
