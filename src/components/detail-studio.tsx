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
import { revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { usePreviewJob } from "./use-preview-job";
import { PreviewJobStatus } from "./preview-job-status";
import {
  PreviewAvailability,
  freshPreviewAvailable,
} from "./preview-availability";
import { ProvenanceChip } from "./provenance-chip";
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
            <p className="eyebrow">
              {look.title} / {name.toUpperCase()}{" "}
              {revision(detail?.revision || 1)}
            </p>
            <h1>{character?.name}</h1>
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
          <Badge tone={approval ? "success" : "warning"}>
            {approval
              ? `${name} approved`
              : preview
                ? "Review needed"
                : "Detail needed"}
          </Badge>
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
                  ? `${name} preview`
                  : value === "source"
                    ? "Face source"
                    : `Compare ${name.toLowerCase()}`}
              </button>
            ))}
          </div>
          <span className="mono">INDEPENDENT DETAIL</span>
        </div>
        {source ? (
          <div
            className={`look-image-stage beauty-image-stage ${view === "compare" ? "comparison-stage" : ""}`}
          >
            {view === "compare" && (
              <figure>
                <Photo
                  src={source}
                  alt={`${performer?.name}, original face source`}
                  original
                />
                <figcaption>ORIGINAL FACE SOURCE</figcaption>
              </figure>
            )}
            <figure>
              <Photo
                src={view === "source" ? source : preview?.imageUrl || source}
                alt={
                  view === "source" || !preview
                    ? `${performer?.name}, original face source`
                    : `${character?.name}, actual YouCam ${name.toLowerCase()} result`
                }
                original
                priority
              />
              <figcaption>
                {view === "source" || !preview
                  ? "SOURCE CAPTURE"
                  : `YOUCAM ${name.toUpperCase()} RESULT`}
              </figcaption>
            </figure>
          </div>
        ) : (
          <div className="beauty-source-empty">
            <UserRound size={42} />
            <h2>A clear source for the detail.</h2>
            <p>
              {kind === "hair_color"
                ? "Add a permitted face capture with the full hair shape visible."
                : "Add a permitted face capture with the neck and collar area visible."}
            </p>
            <Button variant="primary" onClick={openSource}>
              Add face source <ArrowRight size={15} />
            </Button>
          </div>
        )}
        <div className="look-image-footer">
          <div className="provenance-row">
            {source && (
              <ProvenanceChip kind={face?.synthetic ? "synthetic" : "photo"} />
            )}
            {preview && view !== "source" && (
              <ProvenanceChip
                kind={
                  preview.provenance === "recorded_provider"
                    ? "recorded"
                    : "fresh"
                }
              />
            )}
          </div>
          <span>
            {kind === "hair_color"
              ? "Requested colour study · inspect the rendered shade."
              : "Accessory appearance · physical fit remains separate."}
          </span>
        </div>
        {preview?.inspectionNotes && (
          <details className="inspection-notes">
            <summary>Inspect this {name.toLowerCase()} result</summary>
            <p>{preview.inspectionNotes}</p>
          </details>
        )}
        <section className="appearance-approval">
          <div>
            <span className="eyebrow">THE {name.toUpperCase()} DECISION</span>
            <h3>
              {approval
                ? "Approved as its own detail."
                : kind === "hair_color"
                  ? "Does this colour follow the story?"
                  : "Does this detail carry the character?"}
            </h3>
            <p>
              {approval
                ? `${approval.approvedBy} · ${approval.rationale}`
                : "Review this source, exact recipe and output independently."}
            </p>
          </div>
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
            {approval
              ? `Review ${name.toLowerCase()} approval`
              : `Approve ${name.toLowerCase()} detail`}
            <Check size={15} />
          </Button>
        </section>
        <details className="look-history">
          <summary>
            {name} evidence history{" "}
            <span className="mono">
              {detail?.previews.length || 0} OUTPUTS ·{" "}
              {detail?.approvals.length || 0} DECISIONS
            </span>
          </summary>
          {detail?.approvals.map((entry) => (
            <div key={entry.id}>
              <Badge tone={entry.id === approval?.id ? "success" : "neutral"}>
                {entry.id === approval?.id
                  ? "Current approval"
                  : entry.state === "current"
                    ? "Earlier output"
                    : entry.state.replaceAll("_", " ")}
              </Badge>
              <p>
                {entry.approvedBy} · detail {revision(entry.detailRevision)} ·
                capture {entry.faceCaptureVersion}
              </p>
              <p className="muted">
                {entry.rationale}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </p>
            </div>
          ))}
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
        title={
          approval
            ? `The recorded ${name.toLowerCase()} approval`
            : `Approve this exact ${name.toLowerCase()} detail`
        }
        description={`${performer?.name} · Detail ${revision(detail?.revision || 1)} · face capture ${face?.version || "pending"}`}
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
            <Notice tone="success" title={approval.approvedBy}>
              {approval.rationale}
            </Notice>
            <p>
              This is a separate appearance decision. A costume or makeup
              approval cannot substitute for it.
            </p>
            <Button onClick={() => setApproving(false)}>Close approval</Button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={approve}>
            <p className="muted">
              Approves this appearance only; practical application and physical
              fit are checked separately.
            </p>
            <Field label={`${name} reviewer name or role`}>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                required
                minLength={2}
                maxLength={100}
              />
            </Field>
            <Field
              label={`What did you approve in the ${name.toLowerCase()} detail?`}
            >
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                required
                minLength={5}
                maxLength={1200}
              />
            </Field>
            {changed && (
              <Notice tone="warning">
                The result or creative intent changed. Close this dialog and
                inspect the current detail before approving.
              </Notice>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button type="button" onClick={() => setApproving(false)}>
                Keep inspecting
              </Button>
              <Button
                type="submit"
                variant="primary"
                busy={busy}
                disabled={changed}
              >
                Record {name.toLowerCase()} approval <Check size={15} />
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
  const name = kind === "hair_color" ? "hair colour" : "necklace";
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
              {face?.consent.granted ? "Manage face source" : "Add face source"}
            </Button>
          </div>
        </div>
      </section>
      <form className="form-stack beauty-recipe-form" onSubmit={save}>
        <div className="section-title">
          <h2>
            {kind === "hair_color" ? <Palette size={16} /> : <Gem size={16} />}
            The {name} recipe
          </h2>
        </div>
        {recipe.kind === "hair_color" ? (
          <>
            <Field label="Requested hair colour preset">
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
            <p className="muted">
              Use this as a colour study for the character’s hair or wig. Cut,
              length and physical colour matching remain crew direction.
            </p>
          </>
        ) : (
          <>
            <Field label="Exact necklace reference">
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
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            {reference && (
              <div className="detail-reference">
                <Photo
                  src={reference.imageUrl}
                  alt={`${reference.name}, exact necklace reference`}
                  sizes="250px"
                />
                <strong>{reference.name}</strong>
                <ProvenanceChip
                  kind={reference.synthetic ? "synthetic" : "photo"}
                />
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
              Remove the reference background
            </label>
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!changed || state.pending}>
          <Check size={15} />
          Save {name} recipe
        </Button>
      </form>
      <section className="generation-panel">
        <h3>
          <Sparkles size={15} />
          Bring the detail into view
        </h3>
        <p>
          Each result is generated and reviewed separately from costume and
          makeup.
        </p>
        {face?.consent.granted && face.imageUrl ? (
          <>
            <Button
              variant="primary"
              busy={state.pending || state.working}
              disabled={
                changed || !!state.intent || !freshPreviewAvailable(config)
              }
              onClick={() => void state.generate("live")}
            >
              Generate fresh {name} detail
            </Button>
            <span className="generation-cost">
              Est. 1 YouCam unit · shared generation limits
            </span>
            <Button
              busy={state.recordedWorking || state.recordedPending}
              disabled={changed || !!state.recordedIntent}
              onClick={() => void state.generate("recorded")}
            >
              Use matching recorded {name}
              <ArrowRight size={13} />
            </Button>
            {changed && (
              <p className="text-warning">
                Save the recipe before generating or reusing a recording.
              </p>
            )}
            <PreviewAvailability config={config} />
          </>
        ) : (
          <Notice>
            Add a permitted face source before generating this detail.
          </Notice>
        )}
        <PreviewJobStatus state={state} />
      </section>
    </aside>
  );
}
