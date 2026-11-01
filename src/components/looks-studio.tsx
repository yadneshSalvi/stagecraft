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
import {
  displayApproval,
  displayInspectionNotes,
} from "@/lib/presentation-copy";
import { ImageComparison } from "./image-comparison";
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
  const repairSubject = search.get("returnChange") || search.get("repair");
  const recastSubject = search.get("returnRecast") || search.get("recast");
  const returnPerformer =
    search.get("returnPerformer") || search.get("performer");
  const returnHref = repairSubject
    ? `/production/${project.id}?change=${encodeURIComponent(repairSubject)}&impact=refresh`
    : recastSubject && returnPerformer
      ? `/production/${project.id}?recast=${encodeURIComponent(recastSubject)}&performer=${encodeURIComponent(returnPerformer)}&impact=refresh`
      : undefined;
  const [cast, setCast] = useState(false);
  const [newLook, setNewLook] = useState(false);
  const [library, setLibrary] = useState(false);
  const [libraryPerformerId, setLibraryPerformerId] = useState<string>();
  const openLibraryPair = (performerId: string) => {
    setNewLook(false);
    setLibraryPerformerId(performerId);
    setLibrary(true);
  };
  return (
    <>
      <div className="studio-titlebar">
        <Link href={returnHref || `/production/${project.id}`}>
          <ArrowLeft size={14} />
          {returnHref ? "Return to change review" : "Production board"}
        </Link>
        <h1>Looks</h1>
        <div>
          <Button
            variant="quiet"
            onClick={() => {
              setLibraryPerformerId(undefined);
              setLibrary(true);
            }}
          >
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
              Makeup
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
        </div>
      )}
      {!selected ? (
        <EmptyState
          title="No looks yet"
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
        />
      ) : (
        <div className="studio-layout">
          <aside className="character-rail">
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
                      className={`look-status-dot ${currentApproval ? "approved" : currentPreview ? "review" : "empty"}`}
                      role="img"
                      aria-label={
                        currentApproval
                          ? "Approved"
                          : currentPreview
                            ? "To review"
                            : "No preview"
                      }
                    />
                  </span>
                  {selected.id === look.id && (
                    <span className="character-marker" />
                  )}
                </button>
              );
            })}
          </aside>
          {detail === "makeup" ? (
            <BeautyStudio key={selected.id} look={selected} />
          ) : detail === "alternatives" ? (
            <CandidateStudio
              key={`${selected.id}-${search.get("performer") || "current"}`}
              look={selected}
              prospectivePerformerId={search.get("performer") || undefined}
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
              onOpenLibrary={openLibraryPair}
            />
          )}
        </div>
      )}
      <CastManager open={cast} onClose={() => setCast(false)} />
      <LibraryDialog
        open={library}
        onClose={() => setLibrary(false)}
        initialKind={libraryPerformerId ? "wardrobe" : "cast"}
        initialPerformerId={libraryPerformerId}
      />
      <NewLookDialog
        open={newLook}
        onClose={() => setNewLook(false)}
        onOpenLibrary={openLibraryPair}
        onCreated={(lookId) =>
          router.replace(`/production/${project.id}/looks?look=${lookId}`)
        }
      />
    </>
  );
}

function LookCanvas({
  look,
  onCast,
  onOpenLibrary,
}: {
  look: Look;
  onCast: () => void;
  onOpenLibrary: (performerId: string) => void;
}) {
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
      <section className="look-canvas costume-canvas">
        <header className="look-heading">
          <div>
            <h2>{character?.name || "Character look"}</h2>
            <p>
              <span className="look-name">{look.title}</span>
              <span>·</span>
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
          <div className="appearance-approval">
            <Badge tone={approval ? "success" : "warning"}>
              {approval ? "Approved" : preview ? "To review" : "No preview"}
            </Badge>
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
          </div>
        </header>
        <div className="look-stage">
          <div className="look-view-tabs">
            <div className="segmented" aria-label="Image view">
              <button
                aria-pressed={view === "preview"}
                className={view === "preview" ? "active" : ""}
                disabled={!preview}
                onClick={() => selectView("preview")}
              >
                Preview
              </button>
              <button
                aria-pressed={view === "source"}
                className={view === "source" ? "active" : ""}
                onClick={() => selectView("source")}
              >
                Source
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
          </div>
          <div className="costume-image-stage">
            {view === "compare" && preview && performer?.imageUrl ? (
              <ImageComparison
                sourceUrl={performer.imageUrl}
                previewUrl={preview.imageUrl}
                sourceAlt={`Original source of ${performer.name}`}
                previewAlt={`${character?.name}, YouCam generated garment preview`}
              />
            ) : (
              <Photo
                natural
                original
                priority
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
              />
            )}
          </div>
        </div>
        {look.reviewReason && !approval && look.approvals.length > 0 && (
          <Notice tone="warning" title="Needs re-review">
            {look.reviewReason}
          </Notice>
        )}
        {preview?.inspectionNotes && (
          <details className="inspection-notes">
            <summary>Inspection notes</summary>
            <p>{displayInspectionNotes(preview.inspectionNotes)}</p>
          </details>
        )}
        <details className="look-history">
          <summary>History</summary>
          {look.approvals.map((entry) => (
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
          {!look.approvals.length && <p className="muted">No decisions yet.</p>}
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
        onOpenLibrary={onOpenLibrary}
      />
      <Modal
        open={approving}
        onClose={() => {
          if (!busy) setApproving(false);
        }}
        title={approval ? "Appearance approval" : "Approve appearance"}
        description={`${character?.name} · ${performer?.name}`}
      >
        <ApprovalOutput
          imageUrl={performer?.consent.granted ? targetPreview?.imageUrl : null}
          subject={`${character?.name} · ${performer?.name}`}
          provenance={targetPreview?.provenance}
        />
        {approval ? (
          <div className="form-stack">
            <Notice tone="success" title={displayApproval(approval).approvedBy}>
              {displayApproval(approval).rationale}
            </Notice>
            <Button onClick={() => setApproving(false)}>Close</Button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={approve}>
            <p className="muted approval-scope">
              Appearance only — fit is checked at fitting.
            </p>
            <Field label="Reviewer">
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="Alex · Costume designer"
              />
            </Field>
            <Field label="Note">
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                required
                minLength={5}
                maxLength={1200}
              />
            </Field>
            {outputChanged && (
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
                variant="primary"
                busy={busy}
                disabled={outputChanged}
                type="submit"
              >
                Approve
                <Check size={15} />
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
