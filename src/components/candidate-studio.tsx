"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCheck, Sparkles } from "lucide-react";
import type { AppearanceCandidate, Look, PhysicalUnit } from "@/lib/types";
import {
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
import { CandidateApproval } from "./candidate-approval";
import { ImageComparison } from "./image-comparison";
import {
  displayApproval,
  displayInspectionNotes,
} from "@/lib/presentation-copy";
import { Badge, Button, Field, Notice, Photo } from "./ui";

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
        setError("No saved preview for this unit.");
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
          <h2>{character?.name} · Alternatives</h2>
        </div>
        <Badge>
          {
            candidates.filter((candidate) =>
              getCurrentCandidateApproval(project, candidate),
            ).length
          }{" "}
          approved
        </Badge>
      </header>
      <div className="candidate-direction">
        <h3>Direction</h3>
        <p>{character?.direction.text || "No direction yet"}</p>
      </div>
      {performer?.id !== look.performerId && (
        <Notice>{`Recast study · ${performer?.name}`}</Notice>
      )}
      <div className="candidate-grid">
        {chosenUnits.map((unit) => {
          const matches = [...candidates]
            .reverse()
            .filter(
              (item) =>
                item.recipe.unitIds.length === 1 &&
                item.recipe.unitIds[0] === unit.id,
            );
          const candidate =
            matches.find((item) =>
              getCurrentCandidateApproval(project, item),
            ) || matches[0];
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
              </div>
              <div className="candidate-card-body">
                <span className="mono">
                  {unit.code} · {money(unit.priceCents, project.currency)}
                </span>
                <h2>{unit.name}</h2>
                <Button
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
        <Notice>No other units in this category. Add a unit to compare.</Notice>
      )}
      <div className="candidate-add">
        <Field label="Another unit">
          <select
            value={extraUnit}
            onChange={(event) => setExtraUnit(event.target.value)}
          >
            <option value="">Choose a unit</option>
            {available.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} · {unit.name}
              </option>
            ))}
          </select>
        </Field>
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
  const { project, config, send, busy } = useProduction();
  const preview = getCurrentCandidatePreview(project, candidate);
  const approval = getCurrentCandidateApproval(project, candidate);
  const performer = project.performers.find(
    (item) => item.id === candidate.performerId,
  );
  const [compare, setCompare] = useState(false);
  const onSuccess = useCallback(() => {}, []);
  const state = usePreviewJob(look.id, "garment", onSuccess, candidate.id);
  const adopted = look.activeCandidateId === candidate.id;
  return (
    <article
      className={`candidate-card ${approval ? "candidate-approved" : ""}`}
    >
      <div className={`candidate-image ${compare ? "candidate-compare" : ""}`}>
        {compare && preview && performer?.imageUrl ? (
          <ImageComparison
            sourceUrl={performer.imageUrl}
            previewUrl={preview.imageUrl}
            sourceAlt={`${performer.name}, original body source`}
            previewAlt={`${performer.name} in ${unit.name}, actual YouCam alternative`}
          />
        ) : (
          <Photo
            natural
            src={preview?.imageUrl || unit.imageUrl}
            alt={
              preview
                ? `${performer?.name} in ${unit.name}, actual YouCam alternative`
                : `${unit.name}, garment reference; preview needed`
            }
            original={!!preview}
          />
        )}
        {!compare && (
          <span className="candidate-garment-inset">
            <Photo
              src={unit.imageUrl}
              alt={`Exact reference ${unit.code}`}
              sizes="90px"
            />
          </span>
        )}
      </div>
      <div className="candidate-card-body">
        <div className="candidate-card-top">
          <span className="mono">
            {unit.code} · {money(unit.priceCents, project.currency)}
          </span>
          <Badge tone={approval ? "success" : "warning"}>
            {adopted
              ? approval
                ? "In use"
                : "In use · to review"
              : approval
                ? "Approved"
                : "To review"}
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
        </p>
        {preview && (
          <div className="candidate-comparison-control">
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
            <summary>Notes</summary>
            <p>{displayInspectionNotes(preview.inspectionNotes)}</p>
          </details>
        )}
        {approval && (
          <p className="candidate-decision">
            <CheckCheck size={15} />
            <span>
              {displayApproval(approval).approvedBy}
              <small>{displayApproval(approval).rationale}</small>
            </span>
          </p>
        )}
        <div className="candidate-actions">
          <CandidateApproval candidate={candidate} />
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
          <summary>{preview ? "Preview" : "Get preview"}</summary>
          <Button
            busy={state.recordedWorking || state.recordedPending}
            disabled={!!state.recordedIntent}
            onClick={() => void state.generate("recorded")}
          >
            Use saved preview
          </Button>
          <Button
            busy={state.pending || state.working}
            disabled={!!state.intent || !freshPreviewAvailable(config)}
            onClick={() => void state.generate("live")}
          >
            <Sparkles size={14} />
            Generate · 2 units
          </Button>
          <PreviewAvailability config={config} />
          <PreviewJobStatus state={state} />
        </details>
      </div>
    </article>
  );
}
