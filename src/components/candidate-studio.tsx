"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { AppearanceCandidate, Look, PhysicalUnit } from "@/lib/types";
import {
  candidateIntentHash,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
} from "@/lib/domain/lineage";
import { money } from "@/lib/format";
import { requestPreview } from "@/lib/client";
import { useProduction } from "./production-context";
import { usePreviewJob } from "./use-preview-job";
import { PreviewJobStatus } from "./preview-job-status";
import {
  PreviewAvailability,
  freshPreviewAvailable,
} from "./preview-availability";
import { ProvenanceChip } from "./provenance-chip";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";

export function CandidateStudio({
  look,
  prospectivePerformerId,
  returnHref,
}: {
  look: Look;
  prospectivePerformerId?: string;
  returnHref?: string;
}) {
  const { project, send, busy, refresh, setError } = useProduction();
  const [preparing, setPreparing] = useState<string | null>(null);
  const [extraUnit, setExtraUnit] = useState("");
  const performer =
    project.performers.find((item) => item.id === prospectivePerformerId) ||
    project.performers.find((item) => item.id === look.performerId);
  const character = project.characters.find(
    (item) => item.id === look.characterId,
  );
  const currentUnit = project.units.find((item) => item.id === look.unitIds[0]);
  const candidates = (project.appearanceCandidates || []).filter(
    (candidate) =>
      candidate.lookIds.includes(look.id) &&
      candidate.performerId === performer?.id &&
      candidate.captureVersion === performer?.captureVersion,
  );
  const suggested = project.units.filter(
    (unit) =>
      unit.status !== "unavailable" &&
      unit.category === look.category &&
      !look.unitIds.includes(unit.id) &&
      (currentUnit?.substitutionFamily
        ? unit.substitutionFamily === currentUnit.substitutionFamily
        : true),
  );
  const available = project.units.filter(
    (unit) => unit.status !== "unavailable" && unit.category === look.category,
  );
  const chosenUnits = [
    ...new Set([
      ...suggested.map((unit) => unit.id),
      ...candidates.flatMap((candidate) => candidate.recipe.unitIds),
      ...(extraUnit ? [extraUnit] : []),
    ]),
  ]
    .map((id) => project.units.find((unit) => unit.id === id))
    .filter((unit): unit is PhysicalUnit => !!unit);
  async function prepare(unitId: string) {
    if (preparing || busy) return;
    setPreparing(unitId);
    setError(null);
    try {
      const next = await send({
        type: "create_candidate",
        lookId: look.id,
        unitIds: [unitId],
        ...(performer ? { performerId: performer.id } : {}),
      });
      if (!next) return;
      const candidate = [...(next.appearanceCandidates || [])]
        .reverse()
        .find(
          (item) =>
            item.lookIds.includes(look.id) &&
            item.recipe.unitIds.length === 1 &&
            item.recipe.unitIds[0] === unitId &&
            item.performerId === performer?.id,
        );
      if (!candidate) return;
      try {
        await requestPreview(
          next,
          look.id,
          "recorded",
          "garment",
          crypto.randomUUID(),
          candidate.id,
        );
        await refresh();
      } catch {
        setError(
          "The alternative is prepared. No matching recording was attached; use its preview controls to attach an output.",
        );
      }
    } finally {
      setPreparing(null);
    }
  }
  return (
    <section className="candidate-studio">
      {returnHref && (
        <Link className="candidate-return" href={returnHref}>
          <ArrowLeft size={15} aria-hidden="true" /> Return to change review
        </Link>
      )}
      <header className="candidate-heading">
        <div>
          <p className="eyebrow">{character?.name} / WARDROBE ALTERNATIVES</p>
          <h1>What else carries the story?</h1>
          <p>
            Compare {performer?.name || "the performer"} in each exact garment.
            Your approval makes an option available to the allocator across its
            continuity scenes.
          </p>
        </div>
        <Badge>
          {
            candidates.filter((candidate) =>
              getCurrentCandidateApproval(project, candidate),
            ).length
          }{" "}
          approved choices
        </Badge>
      </header>
      <div className="candidate-direction">
        <span className="eyebrow">CURRENT CREATIVE INTENT</span>
        <p>
          {character?.direction.text ||
            "Set the character’s visual direction in the costume recipe."}
        </p>
        <small>
          A change to this direction requires a new decision. Unchanged provider
          images stay reusable.
        </small>
      </div>
      {performer?.id !== look.performerId && (
        <Notice title={`Recast study · ${performer?.name}`}>
          These are proposed appearances for {character?.name}. The casting
          changes only when you adopt the reviewed recast impact.
        </Notice>
      )}
      <div className="candidate-grid">
        {chosenUnits.map((unit) => {
          const candidate = [...candidates]
            .reverse()
            .find(
              (item) =>
                item.recipe.unitIds.length === 1 &&
                item.recipe.unitIds[0] === unit.id,
            );
          return candidate ? (
            <CandidateCard
              key={candidate.id}
              look={look}
              candidate={candidate}
              unit={unit}
            />
          ) : (
            <article
              className="candidate-card candidate-unprepared"
              key={unit.id}
            >
              <div className="candidate-image">
                <Photo
                  src={unit.imageUrl}
                  alt={`${unit.name}, garment reference awaiting a performer preview`}
                />
                <span className="candidate-reference-label">
                  GARMENT REFERENCE
                </span>
              </div>
              <div className="candidate-card-body">
                <span className="mono">
                  {unit.code} · {money(unit.priceCents, project.currency)}
                </span>
                <h2>{unit.name}</h2>
                <p>
                  Prepare this exact physical reference for{" "}
                  {performer?.name || "the assigned performer"}.
                </p>
                <Button
                  variant="primary"
                  busy={preparing === unit.id}
                  disabled={!!preparing || busy || !performer?.consent.granted}
                  onClick={() => void prepare(unit.id)}
                >
                  Review this alternative <ArrowRight size={15} />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {!chosenUnits.length && (
        <Notice>
          Add another physical unit in the same garment category to compare a
          replacement.
        </Notice>
      )}
      <div className="candidate-add">
        <Field label="Compare another wardrobe unit">
          <select
            value={extraUnit}
            onChange={(event) => setExtraUnit(event.target.value)}
          >
            <option value="">Choose a physical unit</option>
            {available.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} · {unit.name}
              </option>
            ))}
          </select>
        </Field>
        <span>
          <Plus size={15} /> A unit label or substitute list does not grant
          approval.
        </span>
      </div>
    </section>
  );
}

function CandidateCard({
  look,
  candidate,
  unit,
}: {
  look: Look;
  candidate: AppearanceCandidate;
  unit: PhysicalUnit;
}) {
  const { project, config, send, busy, error, clearError } = useProduction();
  const preview = getCurrentCandidatePreview(project, candidate);
  const approval = getCurrentCandidateApproval(project, candidate);
  const performer = project.performers.find(
    (item) => item.id === candidate.performerId,
  );
  const character = project.characters.find(
    (item) => item.id === look.characterId,
  );
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [rationale, setRationale] = useState("");
  const [target, setTarget] = useState<{
    previewId: string;
    intent: string;
  } | null>(null);
  const [compare, setCompare] = useState(false);
  const onSuccess = useCallback(() => {}, []);
  const state = usePreviewJob(look.id, "garment", onSuccess, candidate.id);
  const adopted = look.activeCandidateId === candidate.id;
  const changed =
    !!target &&
    (target.previewId !== preview?.id ||
      target.intent !== candidateIntentHash(project, candidate));
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || changed) return;
    if (
      await send({
        type: "approve_candidate",
        candidateId: candidate.id,
        previewId: preview.id,
        approvedBy: author.trim(),
        rationale: rationale.trim(),
      })
    )
      setOpen(false);
  }
  return (
    <article
      className={`candidate-card ${approval ? "candidate-approved" : ""}`}
    >
      <div className={`candidate-image ${compare ? "candidate-compare" : ""}`}>
        {compare && (
          <Photo
            src={performer?.imageUrl}
            alt={`${performer?.name}, original body source`}
            original
          />
        )}
        <Photo
          src={preview?.imageUrl || unit.imageUrl}
          alt={
            preview
              ? `${performer?.name} in ${unit.name}, actual YouCam alternative`
              : `${unit.name}, garment reference; preview needed`
          }
          original={!!preview}
        />
        {!compare && (
          <span className="candidate-garment-inset">
            <Photo
              src={unit.imageUrl}
              alt={`Exact reference ${unit.code}`}
              sizes="90px"
            />
          </span>
        )}
        <span className="candidate-reference-label">
          {preview ? "PERFORMER + EXACT GARMENT" : "GARMENT REFERENCE"}
        </span>
      </div>
      <div className="candidate-card-body">
        <div className="candidate-card-top">
          <span className="mono">
            {unit.code} · {money(unit.priceCents, project.currency)}
          </span>
          <Badge tone={approval ? "success" : "warning"}>
            {adopted
              ? approval
                ? "Adopted · approved"
                : "Adopted · review needed"
              : approval
                ? "Admissible choice"
                : "Approval needed"}
          </Badge>
        </div>
        <h2>{unit.name}</h2>
        <p className="candidate-scope">
          {candidate.sceneIds
            .map(
              (id) => project.scenes.find((scene) => scene.id === id)?.number,
            )
            .filter(Boolean)
            .map((number) => `SC ${number}`)
            .join(" / ")}{" "}
          · one coherent garment choice
        </p>
        {preview && (
          <div className="provenance-row">
            <ProvenanceChip
              kind={
                preview.provenance === "recorded_provider"
                  ? "recorded"
                  : "fresh"
              }
            />
            <button
              className="inline-action"
              onClick={() => setCompare(!compare)}
            >
              {compare ? "Show result" : "Compare source"}
            </button>
          </div>
        )}
        {preview?.inspectionNotes && (
          <details className="candidate-observations">
            <summary>Inspect this output</summary>
            <p>{preview.inspectionNotes}</p>
          </details>
        )}
        {approval && (
          <p className="candidate-decision">
            <CheckCheck size={15} />
            <span>
              {approval.approvedBy}
              <small>{approval.rationale}</small>
            </span>
          </p>
        )}
        <div className="candidate-actions">
          <Button
            variant={approval ? "default" : "primary"}
            disabled={!preview || busy}
            onClick={() => {
              clearError();
              setTarget(
                preview
                  ? {
                      previewId: preview.id,
                      intent: candidateIntentHash(project, candidate),
                    }
                  : null,
              );
              setOpen(true);
            }}
          >
            <Check size={15} />
            {approval ? "Review this decision" : "Approve this alternative"}
          </Button>
          {approval &&
            !adopted &&
            candidate.performerId === look.performerId && (
              <Button
                disabled={busy}
                onClick={() =>
                  void send({
                    type: "adopt_candidate",
                    candidateId: candidate.id,
                  })
                }
              >
                Use this look <ArrowRight size={14} />
              </Button>
            )}
        </div>
        <details className="candidate-generation" open={!preview}>
          <summary>
            {preview ? "Preview controls" : "Attach an exact preview"}
          </summary>
          <Button
            busy={state.recordedWorking || state.recordedPending}
            disabled={!!state.recordedIntent}
            onClick={() => void state.generate("recorded")}
          >
            Use matching recorded alternative
          </Button>
          <Button
            busy={state.pending || state.working}
            disabled={!!state.intent || !freshPreviewAvailable(config)}
            onClick={() => void state.generate("live")}
          >
            <Sparkles size={14} />
            Generate fresh alternative · 2 units
          </Button>
          <PreviewAvailability config={config} />
          <PreviewJobStatus state={state} />
        </details>
      </div>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={
          approval
            ? "This exact alternative is approved."
            : "Approve this exact alternative"
        }
        description={`${performer?.name} · ${unit.code} · ${candidate.sceneIds.length} scenes`}
      >
        {approval ? (
          <div className="form-stack">
            <Notice tone="success" title={approval.approvedBy}>
              {approval.rationale}
            </Notice>
            <p>
              Revoking this decision immediately removes this candidate from
              allocation choices, including after it has been adopted.
            </p>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button onClick={() => setOpen(false)}>Keep approval</Button>
              <Button
                variant="danger"
                busy={busy}
                onClick={async () => {
                  if (
                    await send({
                      type: "revoke_candidate_approval",
                      candidateId: candidate.id,
                      approvalId: approval.id,
                    })
                  )
                    setOpen(false);
                }}
              >
                <RotateCcw size={14} />
                Revoke this decision
              </Button>
            </div>
          </div>
        ) : (
          <form className="form-stack" onSubmit={approve}>
            <p>
              <strong>Creative intent:</strong> {character?.direction.text}
            </p>
            <p className="muted">
              Approves appearance only; fit is checked at fitting.
            </p>
            <Field label="Alternative reviewer name or role">
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field label="Why does this alternative carry the character?">
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                minLength={5}
                maxLength={1200}
                required
              />
            </Field>
            {changed && (
              <Notice tone="warning">
                The output or creative intent changed. Close this dialog and
                inspect the current evidence before approving.
              </Notice>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button type="button" onClick={() => setOpen(false)}>
                Keep comparing
              </Button>
              <Button
                variant="primary"
                type="submit"
                busy={busy}
                disabled={changed}
              >
                Record alternative approval <Check size={15} />
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </article>
  );
}
