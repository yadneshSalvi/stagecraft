"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  GitBranch,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { Production, RepairProposal } from "@/lib/types";
import { money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
import { FindingSummary } from "./finding-summary";
import { ContinuityWall } from "./continuity-wall";
import { DirectionRepair, DirectionAcknowledgement } from "./direction-repair";
import { CandidateApproval } from "./candidate-approval";
import { ExampleDecisions } from "./example-decisions";
import {
  getCurrentApproval,
  getCurrentCandidatePreview,
} from "@/lib/domain/lineage";
import { getCreativeReferenceFlags } from "@/lib/domain/direction";

type ChangeReviewProps = {
  open: boolean;
  onClose: () => void;
  initialUnitId?: string;
  initialCharacterId?: string;
  initialReplacementId?: string;
  refreshImpactOnOpen?: boolean;
};

export function ChangeReview(props: ChangeReviewProps) {
  return props.open ? <ChangeReviewSession {...props} /> : null;
}

function ChangeReviewSession({
  open,
  onClose,
  initialUnitId,
  initialCharacterId,
  initialReplacementId,
  refreshImpactOnOpen = false,
}: ChangeReviewProps) {
  const { project, send, busy, error, clearError } = useProduction();
  const [kind, setKind] = useState<RepairProposal["kind"]>(
    initialCharacterId ? "recast" : "garment_unavailable",
  );
  const [subject, setSubject] = useState(
    initialCharacterId || initialUnitId || project.units[0]?.id || "",
  );
  const [replacement, setReplacement] = useState(
    initialReplacementId ||
      project.performers.find(
        (p) => !project.characters.some((c) => c.performerId === p.id),
      )?.id ||
      "",
  );
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [adopted, setAdopted] = useState(false);
  const [revisionNotice, setRevisionNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const ownMutation = useRef(false);
  const resumedImpact = useRef(false);
  const pendingRefresh = useRef<number | null>(null);
  const chosenReplacement = useRef<string | null>(null);
  const seenRevision = useRef(project.revision);
  useEffect(() => {
    if (seenRevision.current === project.revision) return;
    seenRevision.current = project.revision;
    if (ownMutation.current) return;
    const frame = requestAnimationFrame(() => {
      setProposalId(null);
      setOptionId(null);
      setAdopted(false);
      setRevisionNotice(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [project.revision]);
  const proposal = project.proposals.find((p) => p.id === proposalId);
  const resumingImpact = refreshImpactOnOpen && !proposal && !revisionNotice;
  const isStale =
    !!proposal &&
    (proposal.status === "stale" ||
      (proposal.status !== "adopted" &&
        proposal.baseRevision !== project.revision));
  const selected = proposal?.options.find((option) => option.id === optionId);
  const unit = project.units.find((u) => u.id === subject);
  const character = project.characters.find((c) => c.id === subject);
  const creativeFlags = proposal
    ? adopted
      ? getCreativeReferenceFlags(
          project,
          proposal.impact.lookIds,
          proposal.impact.creativeFlags?.map((flag) => flag.unitId) || [],
        )
      : proposal.impact.creativeFlags || []
    : [];
  const propose = useCallback(async () => {
    ownMutation.current = true;
    setRevisionNotice(false);
    setRefreshing(true);
    clearError();
    const next = await send({
      type: "propose_change",
      kind,
      subjectId: subject,
      ...(kind === "recast" ? { replacementId: replacement } : {}),
      seeded: project.fixture,
    });
    if (next) {
      seenRevision.current = next.revision;
      const result = next.proposals.at(-1);
      if (result) {
        setProposalId(result.id);
        const preferred = result.options.find(
          (option) =>
            (option.replacementUnitId || option.replacementPerformerId) ===
            chosenReplacement.current,
        );
        setOptionId(
          preferred?.id ||
            result.options.find((option) => option.feasible)?.id ||
            result.options.find((option) => option.decisionsNeeded)?.id ||
            result.options[0]?.id ||
            null,
        );
        setAdopted(false);
      }
    }
    ownMutation.current = false;
    setRefreshing(false);
  }, [clearError, kind, project.fixture, replacement, send, subject]);
  useEffect(() => {
    if (!refreshImpactOnOpen || resumedImpact.current || busy) return;
    resumedImpact.current = true;
    void propose();
  }, [busy, propose, refreshImpactOnOpen]);
  useEffect(() => {
    if (busy || pendingRefresh.current !== project.revision) return;
    pendingRefresh.current = null;
    void propose();
  }, [busy, project.revision, propose]);
  function decisionSaved(next: Production | null) {
    if (next) {
      seenRevision.current = next.revision;
      pendingRefresh.current = next.revision;
    }
    ownMutation.current = false;
  }
  async function adopt() {
    if (!proposal || !optionId || isStale || !selected?.feasible) return;
    ownMutation.current = true;
    const next = await send({
      type: "adopt_repair",
      proposalId: proposal.id,
      optionId,
    });
    if (next) {
      seenRevision.current = next.revision;
      setAdopted(true);
    }
    ownMutation.current = false;
  }
  async function handleDirectionSave(
    characterId: string,
    text: string,
    essential: string[],
    palette: string[],
  ) {
    ownMutation.current = true;
    const next = await send({
      type: "edit_direction",
      characterId,
      text,
      essential,
      palette,
    });
    if (next) {
      seenRevision.current = next.revision;
      if (!adopted) pendingRefresh.current = next.revision;
    }
    ownMutation.current = false;
    return !!next;
  }
  function close() {
    if (busy || refreshing) return;
    clearError();
    onClose();
  }
  const alternativeHref = proposal
    ? `/production/${project.id}/looks?look=${proposal.impact.lookIds[0] || ""}&detail=alternatives&${kind === "recast" ? `performer=${replacement}&recast=${subject}` : `repair=${subject}`}`
    : "";
  const decisionHref = `/production/${project.id}/looks?look=${selected?.decisionsNeeded?.lookIds[0] || ""}&${kind === "recast" ? `returnRecast=${subject}&returnPerformer=${replacement}` : `returnChange=${subject}`}`;
  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={
        adopted
          ? "Change adopted"
          : proposal
            ? "Change impact"
            : "Review a change"
      }
      footer={
        <>
          <Button onClick={close} disabled={busy || refreshing}>
            {adopted ? "Back to production" : "Cancel"}
          </Button>
          {adopted ? (
            <Link
              className="button button-primary"
              href={`/production/${project.id}/looks?look=${proposal?.impact.lookIds[0] || ""}`}
              onClick={close}
            >
              Review affected looks <ArrowRight size={16} />
            </Link>
          ) : !proposal || isStale ? (
            <Button
              variant="primary"
              busy={busy || refreshing || (resumingImpact && !error)}
              disabled={!subject || (kind === "recast" && !replacement)}
              onClick={() => void propose()}
            >
              {resumingImpact
                ? error
                  ? "Retry impact refresh"
                  : "Refreshing impact"
                : isStale
                  ? "Recompute impact"
                  : "Preview the impact"}
              <GitBranch size={16} />
            </Button>
          ) : (
            <Button
              variant="primary"
              busy={busy || refreshing}
              disabled={!selected?.feasible}
              onClick={() => void adopt()}
            >
              Adopt this revision <ArrowRight size={16} />
            </Button>
          )}
        </>
      }
    >
      {project.fixture &&
        !proposal &&
        !resumingImpact &&
        !project.looks.some((look) => getCurrentApproval(look, project)) && (
          <p className="change-review-nudge">
            Approve{" "}
            <Link
              href={`/production/${project.id}/looks?look=look-nora`}
              onClick={close}
            >
              Nora
            </Link>{" "}
            and{" "}
            <Link
              href={`/production/${project.id}/looks?look=look-mae`}
              onClick={close}
            >
              Mae
            </Link>{" "}
            first.
          </p>
        )}
      {(revisionNotice || isStale) && !refreshing && (
        <Notice>Production changed. Preview the impact again.</Notice>
      )}
      {(resumingImpact || refreshing) && !error && (
        <p className="change-refresh-status" role="status">
          Refreshing impact…
        </p>
      )}
      {!proposal && !resumingImpact && (
        <div className="change-setup">
          <div className="change-type-switch">
            <button
              className={kind === "garment_unavailable" ? "selected" : ""}
              aria-pressed={kind === "garment_unavailable"}
              onClick={() => {
                setKind("garment_unavailable");
                setSubject(initialUnitId || project.units[0]?.id || "");
                chosenReplacement.current = null;
              }}
            >
              <GitBranch size={22} />
              <strong>A garment is unavailable</strong>
            </button>
            <button
              className={kind === "recast" ? "selected" : ""}
              aria-pressed={kind === "recast"}
              onClick={() => {
                setKind("recast");
                setSubject(project.characters[0]?.id || "");
                chosenReplacement.current = null;
              }}
            >
              <RefreshCcw size={22} />
              <strong>A character is recast</strong>
            </button>
          </div>
          {kind === "garment_unavailable" ? (
            <Field label="Unavailable unit">
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                {project.units.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="field-grid">
              <Field label="Character">
                <select
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                >
                  {project.characters.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Replacement performer">
                <select
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                >
                  <option value="">Choose a performer</option>
                  {project.performers
                    .filter((item) => item.id !== character?.performerId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}
      {proposal && (
        <>
          <div className="dependency-path" aria-label="Affected dependencies">
            <span>
              {kind === "garment_unavailable" ? unit?.code : character?.name}
            </span>
            <ArrowRight size={16} />
            <span>{proposal.impact.lookIds.length} looks</span>
            <ArrowRight size={16} />
            <span>
              {proposal.impact.sceneIds.length} scenes ·{" "}
              {proposal.impact.occurrenceIds.length} calls
            </span>
          </div>
          {selected?.decisionsNeeded && (
            <div className="repair-decisions-needed" role="status">
              <Notice tone="warning">
                {selected.decisionsNeeded.count} other look
                {selected.decisionsNeeded.count === 1
                  ? " needs"
                  : "s need"}{" "}
                decisions first.
              </Notice>
              <div className="button-row">
                <Link className="button" href={decisionHref} onClick={close}>
                  Review looks <ArrowRight size={15} />
                </Link>
                <ExampleDecisions
                  compact
                  onMutationStart={() => {
                    ownMutation.current = true;
                  }}
                  onMutationEnd={decisionSaved}
                />
              </div>
            </div>
          )}
          <ContinuityWall
            project={project}
            compact
            affectedLookIds={proposal.impact.lookIds}
          />
          {!adopted && (
            <>
              <div className="section-title">
                <h3>Repairs</h3>
                {proposal.impact.lookIds.length > 0 && (
                  <Link
                    className="inline-action"
                    href={alternativeHref}
                    onClick={close}
                  >
                    Compare alternatives <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              <div className="repair-options repair-options-visual">
                {proposal.options.map((option) => {
                  const replacementUnit = project.units.find(
                    (item) => item.id === option.replacementUnitId,
                  );
                  const performer = project.performers.find(
                    (item) => item.id === option.replacementPerformerId,
                  );
                  const candidate = project.appearanceCandidates?.find(
                    (item) => item.id === option.candidateId,
                  );
                  const preview =
                    candidate && getCurrentCandidatePreview(project, candidate);
                  const conflict = option.findings.some(
                    (finding) =>
                      finding.severity === "conflict" &&
                      finding.code !== "APPEARANCE_APPROVAL_REQUIRED",
                  );
                  const status = option.feasible
                    ? "Ready"
                    : conflict
                      ? "Conflict"
                      : option.requiresVisualApproval
                        ? "Needs approval"
                        : option.decisionsNeeded
                          ? "Decisions needed"
                          : "Needs checking";
                  return (
                    <article
                      className={`repair-choice ${option.id === optionId ? "selected" : ""}`}
                      key={option.id}
                    >
                      <button
                        className={`repair-option ${option.id === optionId ? "selected" : ""}`}
                        onClick={() => {
                          setOptionId(option.id);
                          chosenReplacement.current =
                            option.replacementUnitId ||
                            option.replacementPerformerId ||
                            null;
                        }}
                        aria-pressed={option.id === optionId}
                        aria-label={`${option.label} · ${status}`}
                      >
                        <div className="repair-option-image">
                          <Photo
                            natural
                            original={!!preview}
                            src={
                              preview?.imageUrl ||
                              replacementUnit?.imageUrl ||
                              performer?.imageUrl
                            }
                            alt={
                              preview
                                ? `Actual YouCam performer preview for ${option.label}`
                                : `${replacementUnit?.name || performer?.name || "Repair option"}, source reference`
                            }
                          />
                          {preview && replacementUnit && (
                            <span className="repair-reference-inset">
                              <Photo
                                natural
                                src={replacementUnit.imageUrl}
                                alt={`Exact reference ${replacementUnit.code}`}
                                sizes="65px"
                              />
                            </span>
                          )}
                        </div>
                        <div className="repair-option-copy">
                          <div className="repair-option-top">
                            <strong>{option.label}</strong>
                            <span className="radio-indicator">
                              {option.id === optionId && <Check size={12} />}
                            </span>
                          </div>
                          <div className="inline-badges">
                            <Badge
                              tone={
                                option.feasible
                                  ? "success"
                                  : conflict
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {status}
                            </Badge>
                            {option.costDeltaCents !== 0 && (
                              <span className="mono">
                                {option.costDeltaCents > 0 ? "+" : ""}
                                {money(option.costDeltaCents, project.currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      {candidate && preview && (
                        <div className="repair-inline-review">
                          <CandidateApproval
                            candidate={candidate}
                            onMutationStart={() => {
                              ownMutation.current = true;
                              chosenReplacement.current =
                                option.replacementUnitId ||
                                option.replacementPerformerId ||
                                null;
                            }}
                            onMutationEnd={decisionSaved}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {selected && (
                <FindingSummary
                  findings={selected.findings}
                  hiddenGroupCodes={
                    selected.decisionsNeeded
                      ? ["APPEARANCE_APPROVAL_REQUIRED"]
                      : []
                  }
                />
              )}
              {!proposal.options.length && (
                <Notice tone="warning">
                  No repair fits the recorded constraints.
                </Notice>
              )}
            </>
          )}
          {creativeFlags.length > 0 && (
            <section className="creative-impact">
              <h3>Direction still names the old garment</h3>
              <ul>
                {creativeFlags.map((flag) => (
                  <li key={`${flag.characterId}:${flag.unitId}`}>
                    <strong>
                      {
                        project.characters.find(
                          (item) => item.id === flag.characterId,
                        )?.name
                      }
                    </strong>{" "}
                    · {flag.references.join(" · ")}
                  </li>
                ))}
              </ul>
              {[...new Set(creativeFlags.map((flag) => flag.characterId))].map(
                (id) => {
                  const currentCharacter = project.characters.find(
                    (item) => item.id === id,
                  );
                  return currentCharacter ? (
                    <DirectionRepair
                      key={`${id}:${currentCharacter.direction.revision}`}
                      character={currentCharacter}
                      busy={busy}
                      onSave={handleDirectionSave}
                    />
                  ) : null;
                },
              )}
              {adopted &&
                creativeFlags.map((flag) => (
                  <DirectionAcknowledgement
                    key={`${flag.characterId}:${flag.unitId}`}
                    characterId={flag.characterId}
                    unitId={flag.unitId}
                    onMutationStart={() => {
                      ownMutation.current = true;
                    }}
                    onMutationEnd={(next) => {
                      if (next) seenRevision.current = next.revision;
                      ownMutation.current = false;
                    }}
                  />
                ))}
            </section>
          )}
          <div className="impact-columns">
            <section className="impact-preserved">
              <h4>
                <ShieldCheck size={17} />
                What stays valid
              </h4>
              <ul>
                {proposal.impact.preservedApprovalIds.length > 0 && (
                  <li>
                    {proposal.impact.preservedApprovalIds.length} look approvals
                  </li>
                )}
                {!!proposal.impact.preservedBeautyApprovalIds?.length && (
                  <li>
                    {proposal.impact.preservedBeautyApprovalIds.length} makeup
                    approvals
                  </li>
                )}
                {!!proposal.impact.preservedDetailApprovalIds?.length && (
                  <li>
                    {proposal.impact.preservedDetailApprovalIds.length} hair &
                    necklace approvals
                  </li>
                )}
                <li>Script & chronology</li>
              </ul>
            </section>
            <section className="impact-review">
              <h4>
                <TriangleAlert size={17} />
                {adopted ? "Changed" : "What needs attention"}
              </h4>
              <ul>
                <li>
                  {proposal.impact.sceneIds
                    .map(
                      (id) =>
                        project.scenes.find((scene) => scene.id === id)?.number,
                    )
                    .filter(Boolean)
                    .map((number) => `SC ${number}`)
                    .join(" · ") || "No scheduled scenes"}
                </li>
                {proposal.impact.invalidatedApprovalIds.length > 0 && (
                  <li>
                    {proposal.impact.invalidatedApprovalIds.length} look{" "}
                    {adopted ? "decisions" : "approvals"}
                  </li>
                )}
                {!!proposal.impact.invalidatedBeautyApprovalIds?.length && (
                  <li>
                    {proposal.impact.invalidatedBeautyApprovalIds.length} makeup{" "}
                    {adopted ? "decisions" : "approvals"}
                  </li>
                )}
                {!!proposal.impact.invalidatedDetailApprovalIds?.length && (
                  <li>
                    {proposal.impact.invalidatedDetailApprovalIds.length} hair &
                    necklace {adopted ? "decisions" : "approvals"}
                  </li>
                )}
                {proposal.impact.sourcingIds.length > 0 && (
                  <li>{proposal.impact.sourcingIds.length} sourcing records</li>
                )}
                {proposal.impact.packIds.length > 0 && (
                  <li>{proposal.impact.packIds.length} crew packs</li>
                )}
              </ul>
            </section>
          </div>
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </Modal>
  );
}
