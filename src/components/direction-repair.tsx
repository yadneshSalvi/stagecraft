"use client";
import { useState } from "react";
import type { Character } from "@/lib/types";
import { Button, Field } from "./ui";

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
  const palette = paletteText.split(/[\s,;]+/).filter(Boolean);
  const paletteValid =
    palette.length <= 10 &&
    palette.every((color) => /^#[0-9a-f]{6}$/i.test(color));
  const [saved, setSaved] = useState(false);
  return (
    <details className="direction-repair" open={!saved}>
      <summary>
        {saved
          ? `${character.name} · direction saved for review`
          : `Revise ${character.name}’s direction here`}
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
          )
            setSaved(true);
        }}
      >
        <Field label={`${character.name} character direction`}>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSaved(false);
            }}
            maxLength={2000}
            required
          />
        </Field>
        <Field
          label={`${character.name} essential details`}
          hint="One requirement per line."
        >
          <textarea
            value={essential}
            onChange={(event) => {
              setEssential(event.target.value);
              setSaved(false);
            }}
            maxLength={1800}
          />
        </Field>
        <Field
          label={`${character.name} colour palette`}
          hint="Up to ten six-digit hex colours, separated by commas; leave empty to clear."
        >
          <input
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
        <p className="muted">
          Saving clears the direction approval and requires a fresh appearance
          decision. Existing matching provider images remain available.
        </p>
        <Button
          variant="primary"
          busy={busy}
          disabled={!paletteValid}
          type="submit"
        >
          Save direction for review
        </Button>
      </form>
    </details>
  );
}
