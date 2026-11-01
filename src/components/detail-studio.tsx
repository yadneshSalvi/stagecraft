"use client";
import { useCallback, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Gem,
  Palette,
  Sparkles,
  UserRound,
} from "lucide-react";
import type {
  DetailKind,
  DetailRecipe,
  HairColorPreset,
  Look,
} from "@/lib/types";
import {
  getCurrentDetailApproval,
  getCurrentDetailPreview,
  detailIntentHash,
} from "@/lib/domain/details";
import {
  displayApproval,
  displayFixtureText,
  displayInspectionNotes,
} from "@/lib/presentation-copy";
import { useProduction } from "./production-context";
import { usePreviewJob } from "./use-preview-job";
import { PreviewJobStatus } from "./preview-job-status";
import {
  PreviewAvailability,
  freshPreviewAvailable,
} from "./preview-availability";
import { ImageComparison } from "./image-comparison";
import { ApprovalOutput } from "./approval-output";
import { FaceSourceDialog } from "./face-source-dialog";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";

const hairPresets: HairColorPreset[] = [
  "Jet Black",
  "Chocolate Brown",
  "Honey Blonde",
  "Platinum Blonde",
  "Ash Gray",
  "Rose Gold",
  "Burgundy",
  "Copper Red",
  "Lavender",
  "Teal Blue",
];
export function DetailStudio({ look, kind }: { look: Look; kind: DetailKind }) {
  const { project, send, busy, error, clearError } = useProduction();
  const detail = look.details?.find((item) => item.kind === kind);
  const performer = project.performers.find(
    (person) => person.id === look.performerId,
  );
  const character = project.characters.find(
    (person) => person.id === look.characterId,
  );
  const preview = getCurrentDetailPreview(look, kind, project);
  const approval = getCurrentDetailApproval(look, kind, project);
  const decision = approval ? displayApproval(approval) : null;
  const inspectionNotes = displayInspectionNotes(preview?.inspectionNotes);
  const name = kind === "hair_color" ? "Hair colour" : "Necklace";
  const [viewOverride, setView] = useState<
    "preview" | "source" | "compare" | null
  >(null);
  const view = !preview ? "source" : viewOverride || "preview";
  const viewChosen = useRef(false);
  const showPreview = useCallback(() => {
    if (!viewChosen.current) setView("preview");
  }, []);
  const state = usePreviewJob(look.id, kind, showPreview);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourcePerformerId, setSourcePerformerId] = useState(look.performerId);
  const [approving, setApproving] = useState(false);
  const [target, setTarget] = useState<{ id: string; intent: string } | null>(
    null,
  );
  const [author, setAuthor] = useState("");
  const [rationale, setRationale] = useState("");
  const face = performer?.faceCapture;
  const source = face?.consent.granted ? face.imageUrl : null;
  const changed =
    !!target &&
    (target.id !== preview?.id ||
      target.intent !== detailIntentHash(project, look, kind));
  function openSource() {
    setSourcePerformerId(look.performerId);
    setSourceOpen(true);
  }
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || changed) return;
    if (
      await send({
        type: "approve_detail",
        lookId: look.id,
        kind,
        previewId: preview.id,
        approvedBy: author.trim(),
        rationale: rationale.trim(),
      })
    )
      setApproving(false);
  }
  return (
    <>
      <section className="look-canvas beauty-canvas detail-canvas">
        <header className="look-heading">
          <div>
            <h2>{character?.name}</h2>
            <p>
              {performer?.name || "Assign a performer"}
              <span>·</span>
              {look.sceneIds
                .map(
                  (id) =>
                    project.scenes.find((scene) => scene.id === id)?.number,
                )
                .filter(Boolean)
                .map((number) => `SC ${number}`)
                .join(" / ")}
            </p>
          </div>
          <div className="appearance-approval detail-approval-action">
            <Badge tone={approval ? "success" : "warning"}>
              {approval ? "Approved" : preview ? "To review" : "No preview"}
            </Badge>
            <Button
              variant={approval ? "default" : "primary"}
              disabled={!preview || busy}
              onClick={() => {
                clearError();
                setTarget(
                  preview
                    ? {
                        id: preview.id,
                        intent: detailIntentHash(project, look, kind),
                      }
                    : null,
                );
                setView("preview");
                setApproving(true);
              }}
            >
              {approval ? "Review approval" : `Approve ${name.toLowerCase()}`}
              <Check size={15} />
            </Button>
          </div>
        </header>
        <div className="look-view-tabs">
          <div className="segmented" aria-label={`${name} image view`}>
            {(["preview", "source", "compare"] as const).map((value) => (
              <button
                key={value}
                className={view === value ? "active" : ""}
                aria-pressed={view === value}
                disabled={value !== "source" && !preview}
                onClick={() => {
                  viewChosen.current = true;
                  setView(value);
                }}
              >
                {value === "preview"
                  ? "Preview"
                  : value === "source"
                    ? "Source"
                    : "Compare"}
              </button>
            ))}
          </div>
        </div>
        {source ? (
          <div className="face-image-stage">
            {view === "compare" && preview ? (
              <ImageComparison
                sourceUrl={source}
                previewUrl={preview.imageUrl}
                sourceAlt={`${performer?.name}, original face source`}
                previewAlt={`${character?.name}, actual YouCam ${name.toLowerCase()} result`}
                aspectRatio={4 / 5}
              />
            ) : (
              <Photo
                src={view === "source" ? source : preview?.imageUrl || source}
                alt={
                  view === "source" || !preview
                    ? `${performer?.name}, original face source`
                    : `${character?.name}, actual YouCam ${name.toLowerCase()} result`
                }
                original
                natural
                aspectRatio={4 / 5}
                priority
              />
            )}
          </div>
        ) : (
          <div className="beauty-source-empty">
            <UserRound size={42} />
            <h2>Face source needed</h2>
            <p>
              {kind === "hair_color"
                ? "Full hair visible."
                : "Neck and collar visible."}
            </p>
            <Button variant="primary" onClick={openSource}>
              Add face source <ArrowRight size={15} />
            </Button>
          </div>
        )}
        {detail?.reviewReason && (
          <Notice tone="warning" title="Needs re-review">
            {detail.reviewReason}
          </Notice>
        )}
        {inspectionNotes && (
          <details className="inspection-notes">
            <summary>Inspection notes</summary>
            <p>{inspectionNotes}</p>
          </details>
        )}
        <details className="look-history">
          <summary>History</summary>
          {detail?.approvals.map((entry) => (
            <div key={entry.id}>
              <Badge tone={entry.id === approval?.id ? "success" : "neutral"}>
                {entry.id === approval?.id
                  ? "Current approval"
                  : entry.state === "current"
                    ? "Earlier output"
                    : entry.state.replaceAll("_", " ")}
              </Badge>
              <p>{displayApproval(entry).approvedBy}</p>
              <p className="muted">
                {displayApproval(entry).rationale}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </p>
            </div>
          ))}
          {!detail?.approvals.length && (
            <p className="muted">No decisions yet.</p>
          )}
        </details>
      </section>
      <DetailControls
        key={`${look.id}-${kind}-${detail?.revision || 0}`}
        look={look}
        kind={kind}
        state={{
          ...state,
          generate: (mode) => {
            viewChosen.current = false;
            return state.generate(mode);
          },
        }}
        onSource={openSource}
      />
      <FaceSourceDialog
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        performerId={sourcePerformerId}
      />
      <Modal
        open={approving}
        onClose={() => {
          if (!busy) setApproving(false);
        }}
        title={approval ? `${name} approval` : `Approve ${name.toLowerCase()}`}
        description={performer?.name}
      >
        <ApprovalOutput
          imageUrl={
            face?.consent.granted
              ? detail?.previews.find((item) => item.id === target?.id)
                  ?.imageUrl
              : null
          }
          subject={`${performer?.name} · ${name.toLowerCase()}`}
          provenance={
            detail?.previews.find((item) => item.id === target?.id)?.provenance
          }
        />
        {approval ? (
          <div className="form-stack">
            <Notice tone="success" title={decision?.approvedBy}>
              {decision?.rationale}
            </Notice>
            <Button onClick={() => setApproving(false)}>Close</Button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={approve}>
            <Field label="Reviewer">
              <input
                aria-label={`${name} reviewer name or role`}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                required
                minLength={2}
                maxLength={100}
              />
            </Field>
            <Field label="Note">
              <textarea
                aria-label={`What did you approve in the ${name.toLowerCase()} detail?`}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                required
                minLength={5}
                maxLength={1200}
              />
            </Field>
            {changed && (
              <Notice tone="warning">
                The preview changed. Re-inspect before approving.
              </Notice>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button type="button" onClick={() => setApproving(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                busy={busy}
                disabled={changed}
              >
                Approve <Check size={15} />
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function DetailControls({
  look,
  kind,
  state,
  onSource,
}: {
  look: Look;
  kind: DetailKind;
  state: ReturnType<typeof usePreviewJob>;
  onSource: () => void;
}) {
  const { project, send, config, busy, error } = useProduction();
  const detail = look.details?.find((item) => item.kind === kind);
  const initial: DetailRecipe =
    detail?.recipe ||
    (kind === "hair_color"
      ? { kind, preset: "Chocolate Brown" }
      : {
          kind,
          referenceId: project.detailReferences?.[0]?.id || "",
          removeBackground: true,
        });
  const [recipe, setRecipe] = useState<DetailRecipe>(initial);
  const performer = project.performers.find(
    (person) => person.id === look.performerId,
  );
  const face = performer?.faceCapture;
  const preview = getCurrentDetailPreview(look, kind, project);
  const changed =
    !detail || JSON.stringify(detail.recipe) !== JSON.stringify(recipe);
  const reference =
    recipe.kind === "necklace"
      ? project.detailReferences?.find((item) => item.id === recipe.referenceId)
      : null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await send({ type: "update_detail", lookId: look.id, recipe });
  }
  return (
    <aside className="recipe-inspector detail-inspector">
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
      <form className="form-stack beauty-recipe-form" onSubmit={save}>
        <div className="section-title">
          <h2>
            {kind === "hair_color" ? <Palette size={16} /> : <Gem size={16} />}
            Recipe
          </h2>
        </div>
        {recipe.kind === "hair_color" ? (
          <>
            <Field label="Hair colour">
              <select
                value={recipe.preset}
                onChange={(event) =>
                  setRecipe({
                    kind: "hair_color",
                    preset: event.target.value as HairColorPreset,
                  })
                }
              >
                {hairPresets.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Necklace">
              <select
                value={recipe.referenceId}
                onChange={(event) =>
                  setRecipe({ ...recipe, referenceId: event.target.value })
                }
                required
              >
                <option value="">Choose a reference</option>
                {project.detailReferences?.map((item) => (
                  <option value={item.id} key={item.id}>
                    {displayFixtureText(
                      item.name,
                      project.fixture || !!item.librarySourceId,
                    )}
                  </option>
                ))}
              </select>
            </Field>
            {reference && (
              <div className="detail-reference">
                <Photo
                  natural
                  aspectRatio={1}
                  src={reference.imageUrl}
                  alt={`${reference.name}, exact necklace reference`}
                  sizes="250px"
                />
                <strong>
                  {displayFixtureText(
                    reference.name,
                    project.fixture || !!reference.librarySourceId,
                  )}
                </strong>
              </div>
            )}
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={recipe.removeBackground}
                onChange={(event) =>
                  setRecipe({
                    ...recipe,
                    removeBackground: event.target.checked,
                  })
                }
              />
              Remove background
            </label>
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!changed || state.pending}>
          <Check size={15} />
          Save recipe
        </Button>
      </form>
      <section className="generation-panel">
        <h3>
          <Sparkles size={15} />
          Preview
        </h3>
        {face?.consent.granted && face.imageUrl ? (
          <>
            <Button
              variant={preview ? "default" : "primary"}
              busy={state.recordedWorking || state.recordedPending}
              disabled={changed || !!state.recordedIntent}
              onClick={() => void state.generate("recorded")}
            >
              Use saved result
              <ArrowRight size={13} />
            </Button>
            <Button
              busy={state.pending || state.working}
              disabled={
                changed || !!state.intent || !freshPreviewAvailable(config)
              }
              onClick={() => void state.generate("live")}
            >
              Generate preview
            </Button>
            <span className="generation-cost">1 unit</span>
            {changed && <p className="text-warning">Save the recipe first.</p>}
            <PreviewAvailability config={config} />
          </>
        ) : null}
        <PreviewJobStatus state={state} />
      </section>
    </aside>
  );
}
