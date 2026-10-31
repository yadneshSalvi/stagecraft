"use client";
import type { BeautyRecipe } from "@/lib/types";
import { Field } from "./ui";

export const defaultBeautyRecipe: BeautyRecipe = {
  lipColor: "#853E5D",
  lipIntensity: 40,
  blushColor: "#9D526C",
  blushIntensity: 30,
};
const palettes = [
  { label: "Berry", lipColor: "#853E5D", blushColor: "#9D526C" },
  { label: "Rose", lipColor: "#A54F68", blushColor: "#BE6680" },
  { label: "Terracotta", lipColor: "#A35D46", blushColor: "#BF7153" },
];

export function BeautyRecipeFields({
  recipe,
  onChange,
}: {
  recipe: BeautyRecipe;
  onChange: (recipe: BeautyRecipe) => void;
}) {
  return (
    <>
      <div className="beauty-palette-presets" aria-label="Starting palettes">
        {palettes.map((palette) => (
          <button
            key={palette.label}
            type="button"
            aria-label={`Use ${palette.label.toLowerCase()} palette`}
            onClick={() =>
              onChange({
                ...recipe,
                lipColor: palette.lipColor,
                blushColor: palette.blushColor,
              })
            }
          >
            <span style={{ background: palette.lipColor }} aria-hidden="true" />
            {palette.label}
          </button>
        ))}
      </div>
      {(["lip", "blush"] as const).map((effect) => (
        <div className="beauty-control-row" key={effect}>
          <Field label={`${effect === "lip" ? "Lip" : "Blush"} colour`}>
            <input
              type="color"
              value={recipe[`${effect}Color`]}
              onChange={(event) =>
                onChange({
                  ...recipe,
                  [`${effect}Color`]: event.target.value.toUpperCase(),
                })
              }
            />
            <code>{recipe[`${effect}Color`]}</code>
          </Field>
          <Field label={`${effect === "lip" ? "Lip" : "Blush"} intensity`}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={recipe[`${effect}Intensity`]}
              onChange={(event) =>
                onChange({
                  ...recipe,
                  [`${effect}Intensity`]: Number(event.target.value),
                })
              }
            />
            <output>{recipe[`${effect}Intensity`]}%</output>
          </Field>
        </div>
      ))}
    </>
  );
}
