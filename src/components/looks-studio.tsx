"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers3,
  Plus,
  Users,
  Shirt,
  Palette,
  Gem,
  Scissors,
} from "lucide-react";
import {
  getCurrentApproval,
  getCurrentPreview,
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import type { Look } from "@/lib/types";
import { provenanceLabel, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, Field, Modal, Notice, Photo } from "./ui";
import { RecipeInspector } from "./recipe-inspector";
import { ApprovalOutput } from "./approval-output";
import { usePreviewJob } from "./use-preview-job";
import { BeautyStudio } from "./beauty-studio";
import { CandidateStudio } from "./candidate-studio";
import { DetailStudio } from "./detail-studio";
import {
  getCurrentDetailApproval,
  getCurrentDetailPreview,
} from "@/lib/domain/details";
import { LibraryDialog } from "./example-library";
import { ProvenanceChip } from "./provenance-chip";
import { appearanceIntentHash } from "@/lib/domain/lineage";
import { CastManager, NewLookDialog } from "./cast-manager";

export function LooksStudio() {
  const { project } = useProduction();
  const search = useSearchParams();
  const router = useRouter();
  const selected =
    project.looks.find((look) => look.id === search.get("look")) ||
    project.looks[0];
  const detail =
    search.get("detail") === "makeup"
      ? "makeup"
      : search.get("detail") === "alternatives"
        ? "alternatives"
        : search.get("detail") === "hair_color"
          ? "hair_color"
          : search.get("detail") === "necklace"
            ? "necklace"
            : "costume";
  const intendedDetail = useRef(detail);
  useEffect(() => {
    intendedDetail.current = detail;
  }, [detail]);
  const showDetail = (
    next: "costume" | "makeup" | "alternatives" | "hair_color" | "necklace",
  ) => {
    intendedDetail.current = next;
    const params = new URLSearchParams(search.toString());
    params.set("look", selected.id);
    if (next === "costume") params.delete("detail");
    else params.set("detail", next);
    router.replace(`/production/${project.id}/looks?${params}`, {
      scroll: false,
    });
  };
  const [cast, setCast] = useState(false);
  const [newLook, setNewLook] = useState(false);
  const [library, setLibrary] = useState(false);
  return (
    <>
      <div className="studio-titlebar">
        <Link href={`/production/${project.id}`}>
          <ArrowLeft size={14} />
          Production board
        </Link>
        <span className="eyebrow">THE LOOK STUDIO</span>
        <div>
          <Button variant="quiet" onClick={() => setLibrary(true)}>
            Example library
          </Button>
          <Button onClick={() => setCast(true)}>
            <Users size={15} />
            Cast & sources
          </Button>
          <Button onClick={() => setNewLook(true)}>
            <Plus size={15} />
            New look
          </Button>
        </div>
      </div>
      {selected && (
        <div className="studio-detail-tabs">
          <div className="segmented" aria-label="Look detail">
            <button
              aria-pressed={detail === "costume"}
              className={detail === "costume" ? "active" : ""}
              onClick={() => showDetail("costume")}
            >
              <Shirt size={15} />
              Costume
            </button>
            <button
              aria-pressed={detail === "makeup"}
              className={detail === "makeup" ? "active" : ""}
              onClick={() => showDetail("makeup")}
            >
              <Palette size={15} />
              Makeup detail
            </button>
            <button
              aria-pressed={detail === "alternatives"}
              className={detail === "alternatives" ? "active" : ""}
              onClick={() => showDetail("alternatives")}
            >
              <Layers3 size={15} />
              Alternatives
            </button>
            <button
              aria-pressed={detail === "hair_color"}
              className={detail === "hair_color" ? "active" : ""}
              onClick={() => showDetail("hair_color")}
            >
              <Scissors size={15} />
              Hair colour
            </button>
            <button
              aria-pressed={detail === "necklace"}
              className={detail === "necklace" ? "active" : ""}
              onClick={() => showDetail("necklace")}
            >
              <Gem size={15} />
              Necklace
            </button>
          </div>
          <span>Each output has its own evidence and decision.</span>
        </div>
      )}
      {!selected ? (
        <EmptyState
          title="A character becomes a presence."
          action={
            <div className="button-row">
              <Button variant="primary" onClick={() => setCast(true)}>
                <Users size={16} />
                Add the cast
              </Button>
              <Button onClick={() => setNewLook(true)}>
                <Plus size={16} />
                Create a look
              </Button>
            </div>
          }
        >
          Add a permitted performer source, connect a character and a garment,
          then see the appearance take shape.
        </EmptyState>
      ) : (
        <div className="studio-layout">
          <aside className="character-rail">
            <p className="eyebrow">THE CHARACTERS</p>
            {project.looks.map((look) => {
              const character = project.characters.find(
                (c) => c.id === look.characterId,
              );
              const performer = project.performers.find(
                (p) => p.id === look.performerId,
              );
              const currentApproval =
                detail === "makeup"
                  ? getCurrentBeautyApproval(look)
                  : detail === "hair_color" || detail === "necklace"
                    ? getCurrentDetailApproval(look, detail, project)
                    : getCurrentApproval(look, project);
              const currentPreview =
                detail === "makeup"
                  ? getCurrentBeautyPreview(look)
                  : detail === "hair_color" || detail === "necklace"
                    ? getCurrentDetailPreview(look, detail, project)
                    : getCurrentPreview(look, project);
              return (
                <button
                  key={look.id}
                  onClick={() => {
                    const params = new URLSearchParams(search.toString());
                    params.set("look", look.id);
                    if (intendedDetail.current === "costume")
                      params.delete("detail");
                    else params.set("detail", intendedDetail.current);
                    if (look.characterId !== selected.characterId) {
                      params.delete("repair");
                      params.delete("recast");
                      params.delete("performer");
                    }
                    router.replace(
                      `/production/${project.id}/looks?${params}`,
                      { scroll: false },
                    );
                  }}
                  className={selected.id === look.id ? "selected" : ""}
                  aria-pressed={selected.id === look.id}
                >
                  <Photo
                    src={
                      detail === "makeup" ||
                      detail === "hair_color" ||
                      detail === "necklace"
                        ? performer?.faceCapture?.consent.granted
                          ? performer.faceCapture.imageUrl
                          : performer?.imageUrl
                        : performer?.imageUrl
                    }
                    alt=""
                  />
                  <span>
                    <strong>{character?.name || "Character"}</strong>
                    <small>{look.title}</small>
                    <span
                      className={`look-status ${currentApproval ? "approved" : ""}`}
                    >
                      {currentApproval
                        ? detail === "makeup"
                          ? "Makeup approved"
                          : detail === "hair_color"
                            ? "Hair colour approved"
                            : detail === "necklace"
                              ? "Necklace approved"
                              : "Approved appearance"
                        : currentPreview
                          ? "Ready for review"
                          : detail === "makeup" &&
                              !performer?.faceCapture?.consent.granted
                            ? "Face source needed"
                            : "Preview needed"}
                    </span>
                  </span>
                  {selected.id === look.id && (
                    <span className="character-marker" />
                  )}
                </button>
              );
            })}
            <div className="studio-source-note">
              <Layers3 size={17} />
              <p>
                One recipe can carry across several scenes. A change follows its
                exact dependencies.
              </p>
            </div>
          </aside>
          {detail === "makeup" ? (
            <BeautyStudio key={selected.id} look={selected} />
          ) : detail === "alternatives" ? (
            <CandidateStudio
              key={`${selected.id}-${search.get("performer") || "current"}`}
              look={selected}
              prospectivePerformerId={search.get("performer") || undefined}
              returnHref={
                search.get("repair")
                  ? `/production/${project.id}?change=${encodeURIComponent(search.get("repair")!)}`
                  : search.get("recast") && search.get("performer")
                    ? `/production/${project.id}?recast=${encodeURIComponent(search.get("recast")!)}&performer=${encodeURIComponent(search.get("performer")!)}`
                    : undefined
              }
            />
          ) : detail === "hair_color" || detail === "necklace" ? (
            <DetailStudio
              key={`${selected.id}-${detail}`}
              look={selected}
              kind={detail}
            />
          ) : (
            <LookCanvas
              key={`${selected.id}-${selected.activeCandidateId || "base"}`}
              look={selected}
              onCast={() => setCast(true)}
            />
          )}
        </div>
      )}
      <CastManager open={cast} onClose={() => setCast(false)} />
      <LibraryDialog open={library} onClose={() => setLibrary(false)} />
      <NewLookDialog
        open={newLook}
        onClose={() => setNewLook(false)}
        onCreated={(lookId) =>
          router.replace(`/production/${project.id}/looks?look=${lookId}`)
        }
      />
    </>
  );
}

function LookCanvas({ look, onCast }: { look: Look; onCast: () => void }) {
  const { project, config, send, busy, error, setError } = useProduction();
  const character = project.characters.find((c) => c.id === look.characterId);
  const performer = project.performers.find((p) => p.id === look.performerId);
  const preview = getCurrentPreview(look, project);
  const approval = getCurrentApproval(look, project);
  const [viewOverride, setView] = useState<
    "preview" | "source" | "compare" | null
  >(null);
  const view = !preview ? "source" : viewOverride || "preview";
  const [approving, setApproving] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<string | null>(null);
  const [approvalIntent, setApprovalIntent] = useState<string | null>(null);
  const [author, setAuthor] = useState("");
  const [rationale, setRationale] = useState("");
  const viewChosen = useRef(false);
  const showPreview = useCallback(() => {
    if (!viewChosen.current) setView("preview");
  }, [setView]);
  const selectView = (next: "source" | "preview" | "compare") => {
    viewChosen.current = true;
    setView(next);
  };
  const jobState = usePreviewJob(
    look.id,
    "garment",
    showPreview,
    look.activeCandidateId,
  );
  const targetPreview = [
    ...look.previews,
    ...(project.appearanceCandidates?.find(
      (candidate) => candidate.id === look.activeCandidateId,
    )?.previews || []),
  ].find((item) => item.id === approvalTarget);
  const scopeLookIds = preview?.scopeLookIds || [look.id];
  const outputChanged =
    approving &&
    (approvalTarget !== preview?.id ||
      approvalIntent !== appearanceIntentHash(project, scopeLookIds));
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || outputChanged) return;
    const result = await send({
      type: "approve_look",
      lookId: look.id,
      previewId: preview.id,
      approvedBy: author.trim(),
      rationale: rationale.trim(),
    });
    if (result) setApproving(false);
  }
  return (
    <>
      <section className="look-canvas">
        <header className="look-heading">
          <div>
            <p className="eyebrow">
              {look.title} / RECIPE {revision(look.revision)}
            </p>
            <h1>{character?.name || "Character look"}</h1>
            <p>
              {performer?.name || "Assign a performer"}
              <span>·</span>
              {look.sceneIds
                .map(
                  (id) =>
                    project.scenes.find((scene) => scene.id === id)?.number,
                )
                .filter(Boolean)
                .map((n) => `SC ${n}`)
                .join(" / ")}
            </p>
          </div>
          <Badge tone={approval ? "success" : "warning"}>
            {approval ? "Appearance approved" : "Awaiting review"}
          </Badge>
        </header>
        <div className="look-view-tabs">
          <div className="segmented" aria-label="Image view">
            <button
              aria-pressed={view === "preview"}
              className={view === "preview" ? "active" : ""}
              disabled={!preview}
              onClick={() => selectView("preview")}
            >
              YouCam preview
            </button>
            <button
              aria-pressed={view === "source"}
              className={view === "source" ? "active" : ""}
              onClick={() => selectView("source")}
            >
              Original source
            </button>
            <button
              aria-pressed={view === "compare"}
              className={view === "compare" ? "active" : ""}
              disabled={!preview}
              onClick={() => selectView("compare")}
            >
              Compare
            </button>
          </div>
          <span className="mono">BODY / FULL FRAME</span>
        </div>
        <div
          className={`look-image-stage ${view === "compare" ? "comparison-stage" : ""}`}
        >
          {view === "compare" && (
            <figure>
              <Photo
                original
                src={performer?.imageUrl}
                alt={`Original source of ${performer?.name}`}
              />
              <figcaption>
                {performer?.synthetic ? "SYNTHETIC SOURCE" : "ORIGINAL SOURCE"}
              </figcaption>
            </figure>
          )}
          <figure>
            <Photo
              original
              src={
                view === "source"
                  ? performer?.imageUrl
                  : preview?.imageUrl || performer?.imageUrl
              }
              alt={
                view === "source"
                  ? `${performer?.name}, original permitted source`
                  : `${character?.name}, ${preview ? "YouCam generated garment preview" : "source image awaiting preview"}`
              }
              priority
            />
            <figcaption>
              {view === "source"
                ? performer?.synthetic
                  ? "SYNTHETIC CAST SOURCE"
                  : "PERMITTED CAST SOURCE"
                : preview
                  ? provenanceLabel(preview.provenance).toUpperCase()
                  : "SOURCE · PREVIEW NEEDED"}
            </figcaption>
          </figure>
        </div>
        <div className="look-image-footer">
          <div className="provenance-row">
            <ProvenanceChip
              kind={performer?.synthetic ? "synthetic" : "photo"}
            />
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
          <span>Original sources stay inspectable.</span>
        </div>
        {look.reviewReason && (
          <Notice tone="warning" title="This look needs a fresh review.">
            {look.reviewReason}
          </Notice>
        )}
        {preview?.inspectionNotes && (
          <details className="inspection-notes">
            <summary>What to inspect in this result</summary>
            <p>{preview.inspectionNotes}</p>
            <p className="muted">
              Compare face, silhouette, garment details, and story-critical
              elements with the sources. Provider completion is not an
              appearance approval.
            </p>
          </details>
        )}
        <section className="appearance-approval">
          <div>
            <span className="eyebrow">THE APPEARANCE DECISION</span>
            <h3>
              {approval
                ? "Approved for these scenes."
                : "Does this carry the character?"}
            </h3>
            <p>
              {approval
                ? `${approval.approvedBy} · ${approval.rationale}`
                : "An approval applies to this performer, this exact recipe, and this output."}
            </p>
          </div>
          <Button
            variant={approval ? "default" : "primary"}
            disabled={!preview || busy}
            onClick={() => {
              setApprovalTarget(preview?.id || null);
              setApprovalIntent(appearanceIntentHash(project, scopeLookIds));
              setError(null);
              setView("preview");
              setApproving(true);
            }}
          >
            {approval ? (
              <>
                <Check size={16} />
                Review approval
              </>
            ) : (
              <>
                Approve appearance
                <ArrowRight size={15} />
              </>
            )}
          </Button>
        </section>
        <details className="look-history">
          <summary>
            Recipe & approval history{" "}
            <span className="mono">
              {look.previews.length} OUTPUTS · {look.approvals.length} DECISIONS
            </span>
          </summary>
          {look.approvals.map((entry) => (
            <div key={entry.id}>
              <Badge tone={entry.id === approval?.id ? "success" : "neutral"}>
                {entry.id === approval?.id
                  ? "Current approval"
                  : entry.state === "current"
                    ? "Earlier output"
                    : entry.state.replaceAll("_", " ")}
              </Badge>
              <p>
                {entry.approvedBy} · recipe {revision(entry.recipeRevision)}
              </p>
              <p className="muted">
                {entry.rationale}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </p>
            </div>
          ))}
          {!look.approvals.length && (
            <p className="muted">
              No appearance decisions have been recorded yet.
            </p>
          )}
        </details>
      </section>
      <RecipeInspector
        key={`${look.id}-${look.revision}`}
        look={look}
        jobState={jobState}
        pending={jobState.pending || jobState.working}
        config={config}
        generate={(mode) => {
          viewChosen.current = false;
          return jobState.generate(mode);
        }}
        onCast={onCast}
      />
      <Modal
        open={approving}
        onClose={() => {
          if (!busy) setApproving(false);
        }}
        title={
          approval
            ? "The recorded appearance approval"
            : "Approve this exact appearance"
        }
        description={`${character?.name} · ${performer?.name} · Recipe ${revision(look.revision)}`}
      >
        <ApprovalOutput
          imageUrl={performer?.consent.granted ? targetPreview?.imageUrl : null}
          subject={`${character?.name} · ${performer?.name}`}
          provenance={targetPreview?.provenance}
        />
        {approval ? (
          <div className="form-stack">
            <Notice tone="success" title={`Approved by ${approval.approvedBy}`}>
              {approval.rationale}
            </Notice>
            <p className="muted">
              This decision references the exact output, performer and current
              creative intent.
            </p>
            <Button onClick={() => setApproving(false)}>Close approval</Button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={approve}>
            <Notice tone="warning">
              Approves appearance only; fit is checked at fitting.
            </Notice>
            <Field label="Reviewer name or role">
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Alex · Costume designer"
              />
            </Field>
            <Field
              label="What did you approve?"
              hint="Record important details and any limitations you will carry into the physical review."
            >
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                required
                minLength={5}
                maxLength={1200}
                placeholder="The silhouette supports the character. Check the coat hem and closure at fitting…"
              />
            </Field>
            {outputChanged && (
              <Notice tone="warning">
                A different output or creative intent is now current. Close this
                dialog and inspect the current look before approving it. Your
                written notes remain here.
              </Notice>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button type="button" onClick={() => setApproving(false)}>
                Keep reviewing
              </Button>
              <Button
                variant="primary"
                busy={busy}
                disabled={outputChanged}
                type="submit"
              >
                Record appearance approval
                <Check size={15} />
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
