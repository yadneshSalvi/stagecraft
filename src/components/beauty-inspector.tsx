"use client";
import { useState } from "react";
import { ArrowRight, Check, Palette, Sparkles, UserRound } from "lucide-react";
import type { BeautyRecipe, Look } from "@/lib/types";
import { useProduction } from "./production-context";
import type { usePreviewJob } from "./use-preview-job";
import { PreviewJobStatus } from "./preview-job-status";
import {
  BeautyRecipeFields,
  defaultBeautyRecipe,
} from "./beauty-recipe-fields";
import { Badge, Button, Notice, Photo } from "./ui";
import {
  PreviewAvailability,
  freshPreviewAvailable,
} from "./preview-availability";
import { ProvenanceChip } from "./provenance-chip";

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
          <span className="eyebrow">THE FACE SOURCE</span>
          <Badge>{face ? `Capture ${face.version}` : "Needed"}</Badge>
        </div>
        <div>
          <Photo
            src={face?.consent.granted ? face.imageUrl : null}
            alt={
              face?.consent.granted
                ? `${performer?.name}, independently permitted face source`
                : ""
            }
          />
          <div>
            <strong>{performer?.name || "Assign a performer"}</strong>
            {face && (
              <ProvenanceChip kind={face.synthetic ? "synthetic" : "photo"} />
            )}
            <Button variant="quiet" onClick={onSource}>
              <UserRound size={13} />
              {face?.consent.granted
                ? "Manage face source"
                : "Add a face source"}
            </Button>
          </div>
        </div>
      </section>
      <form className="beauty-recipe-form form-stack" onSubmit={save}>
        <div className="section-title">
          <h2>
            <Palette size={16} />
            The rendered palette
          </h2>
          <span className="mono">MATTE / LIP + BLUSH</span>
        </div>
        <p className="muted">
          Choose digital colours and provider intensity. These settings are a
          visual reference, not a calibrated physical product amount.
        </p>
        <BeautyRecipeFields recipe={recipe} onChange={setRecipe} />
        <div className="beauty-fixed-policy">
          <span>
            <Check size={13} />
            Skin smoothing set to zero
          </span>
          <span>
            <Check size={13} />
            Lip reshaping set to zero
          </span>
        </div>
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
            Bring the palette into focus
          </h3>
        </div>
        <p>
          Makeup VTO creates a separate face detail from this exact source.
          Inspect lip edges, blush placement, colour, and unintended changes.
        </p>
        {face?.consent.granted && face.imageUrl ? (
          <>
            <Button
              variant="primary"
              busy={pending}
              disabled={
                changed || !!state.intent || !freshPreviewAvailable(config)
              }
              onClick={() => void state.generate("live")}
            >
              <Sparkles size={15} />
              Generate a fresh makeup detail
            </Button>
            <span className="generation-cost">
              Est. 1 YouCam unit · shares the production’s generation limits
            </span>
            {(config?.recordedBeautyPreviews ?? 1) > 0 && (
              <Button
                busy={state.recordedWorking || state.recordedPending}
                disabled={changed || !!state.recordedIntent}
                onClick={() => void state.generate("recorded")}
              >
                Use matching recorded makeup
                <ArrowRight size={13} />
              </Button>
            )}
            {changed && (
              <p className="text-warning">
                Save the makeup recipe before generating.
              </p>
            )}
            <PreviewAvailability config={config} />
          </>
        ) : (
          <Notice tone="warning">
            Add a separately permitted face source before generating a makeup
            detail.
          </Notice>
        )}
        <PreviewJobStatus state={state} />
      </section>
      <details className="beauty-crew-direction">
        <summary>Makeup, hair & application notes</summary>
        <p>{look.makeup.notes || "No makeup application notes yet."}</p>
        <p>
          <strong>Hair.</strong> {look.hair || "No hair direction yet."}
        </p>
        <p>
          <strong>Accessories.</strong>{" "}
          {look.accessories || "No accessory direction yet."}
        </p>
        <p className="muted">
          This result renders the lip and blush settings above. Other makeup
          details, hair, accessories, lighting and physical application remain
          separate crew direction.
        </p>
      </details>
    </aside>
  );
}
