"use client";
import { useState } from "react";
import { ArrowRight, Check, Palette, Sparkles, UserRound } from "lucide-react";
import type { BeautyRecipe, Look } from "@/lib/types";
import { getCurrentBeautyPreview } from "@/lib/domain/selectors";
import { useProduction } from "./production-context";
import type { usePreviewJob } from "./use-preview-job";
import { PreviewJobStatus } from "./preview-job-status";
import {
  BeautyRecipeFields,
  defaultBeautyRecipe,
} from "./beauty-recipe-fields";
import { Button, Notice, Photo } from "./ui";
import {
  PreviewAvailability,
  freshPreviewAvailable,
} from "./preview-availability";

export function BeautyInspector({
  look,
  state,
  onSource,
}: {
  look: Look;
  state: ReturnType<typeof usePreviewJob>;
  onSource: () => void;
}) {
  const { project, config, send, busy, error } = useProduction();
  const performer = project.performers.find(
    (person) => person.id === look.performerId,
  );
  const face = performer?.faceCapture;
  const preview = getCurrentBeautyPreview(look);
  const [recipe, setRecipe] = useState<BeautyRecipe>(
    look.beauty?.recipe || defaultBeautyRecipe,
  );
  const changed =
    !look.beauty ||
    (Object.keys(recipe) as (keyof BeautyRecipe)[]).some(
      (key) => recipe[key] !== look.beauty?.recipe[key],
    );
  const pending = state.pending || state.working;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await send({ type: "update_beauty", lookId: look.id, recipe });
  }
  return (
    <aside className="recipe-inspector beauty-inspector">
      <section className="beauty-source-card">
        <div className="section-title">
          <h3>Face source</h3>
        </div>
        <div>
          <Photo
            natural
            aspectRatio={4 / 5}
            src={face?.consent.granted ? face.imageUrl : null}
            alt={
              face?.consent.granted
                ? `${performer?.name}, independently permitted face source`
                : ""
            }
          />
          <div>
            <strong>{performer?.name || "Assign a performer"}</strong>
            <Button variant="quiet" onClick={onSource}>
              <UserRound size={13} />
              {face?.consent.granted ? "Manage face source" : "Add face source"}
            </Button>
          </div>
        </div>
      </section>
      <form className="beauty-recipe-form form-stack" onSubmit={save}>
        <div className="section-title">
          <h2>
            <Palette size={16} />
            Makeup recipe
          </h2>
        </div>
        <BeautyRecipeFields recipe={recipe} onChange={setRecipe} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!changed || pending}>
          <Check size={15} />
          Save makeup recipe
        </Button>
      </form>
      <section className="generation-panel">
        <div className="section-title">
          <h3>
            <Sparkles size={15} />
            Preview
          </h3>
        </div>
        {face?.consent.granted && face.imageUrl ? (
          <>
            {(config?.recordedBeautyPreviews ?? 1) > 0 && (
              <Button
                variant={preview ? "default" : "primary"}
                busy={state.recordedWorking || state.recordedPending}
                disabled={changed || !!state.recordedIntent}
                onClick={() => void state.generate("recorded")}
              >
                Use saved result
                <ArrowRight size={13} />
              </Button>
            )}
            <Button
              busy={pending}
              disabled={
                changed || !!state.intent || !freshPreviewAvailable(config)
              }
              onClick={() => void state.generate("live")}
            >
              <Sparkles size={15} />
              Generate preview
            </Button>
            <span className="generation-cost">1 unit</span>
            {changed && <p className="text-warning">Save the recipe first.</p>}
            <PreviewAvailability config={config} />
          </>
        ) : null}
        <PreviewJobStatus state={state} />
      </section>
      <details className="beauty-crew-direction">
        <summary>Crew notes</summary>
        <p>{look.makeup.notes || "—"}</p>
        <p>
          <strong>Hair.</strong> {look.hair || "—"}
        </p>
        <p>
          <strong>Accessories.</strong> {look.accessories || "—"}
        </p>
      </details>
    </aside>
  );
}
