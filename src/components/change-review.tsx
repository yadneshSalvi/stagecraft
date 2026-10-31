"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  GitBranch,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { RepairProposal } from "@/lib/types";
import { money, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
import { FindingSummary } from "./finding-summary";
import { ContinuityWall } from "./continuity-wall";
import { ProvenanceChip } from "./provenance-chip";
import { DirectionRepair } from "./direction-repair";
import {
  getCurrentApproval,
  getCurrentCandidatePreview,
} from "@/lib/domain/lineage";

export function ChangeReview({
  open,
  onClose,
  initialUnitId,
  initialCharacterId,
  initialReplacementId,
}: {
  open: boolean;
  onClose: () => void;
  initialUnitId?: string;
  initialCharacterId?: string;
  initialReplacementId?: string;
}) {
  return open ? (
    <ChangeReviewSession
      open
      onClose={onClose}
      initialUnitId={initialUnitId}
      initialCharacterId={initialCharacterId}
      initialReplacementId={initialReplacementId}
    />
  ) : null;
}

function ChangeReviewSession({
  open,
  onClose,
  initialUnitId,
  initialCharacterId,
  initialReplacementId,
}: {
  open: boolean;
  onClose: () => void;
  initialUnitId?: string;
  initialCharacterId?: string;
  initialReplacementId?: string;
}) {
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
  const ownMutation = useRef(false);
  const seenRevision = useRef(project.revision);
  const [revisionNotice, setRevisionNotice] = useState(false);
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
  const isStale =
    !!proposal &&
    (proposal.status === "stale" ||
      (proposal.status !== "adopted" &&
        proposal.baseRevision !== project.revision));
  const selected = proposal?.options.find((option) => option.id === optionId);
  const unit = project.units.find((u) => u.id === subject);
  const character = project.characters.find((c) => c.id === subject);
  async function propose() {
    ownMutation.current = true;
    setRevisionNotice(false);
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
      const p = next.proposals.at(-1);
      if (p) {
        setProposalId(p.id);
        setOptionId(
          p.options.find((o) => o.feasible)?.id || p.options[0]?.id || null,
        );
        setAdopted(false);
      }
    }
    ownMutation.current = false;
  }
  async function adopt() {
    if (!proposal || !optionId) return;
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
    if (next) seenRevision.current = next.revision;
    ownMutation.current = false;
    return !!next;
  }
  function close() {
    if (busy) return;
    onClose();
    setProposalId(null);
    setOptionId(null);
    setAdopted(false);
    clearError();
  }
  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={
        adopted
          ? "A considered new revision."
          : proposal
            ? "Follow the change."
            : "The show changes. The story stays."
      }
      description={
        adopted
          ? "The selected evidence follows the new revision. Review any remaining dependencies before the crew handoff."
          : "See exactly what depends on this decision before you change the working book."
      }
    >
      {project.fixture && (
        <div className="fixture-line">
          <ProvenanceChip kind="synthetic" />
          <span>A reversible change in your working copy.</span>
        </div>
      )}
      {project.fixture &&
        !project.looks.some((look) => getCurrentApproval(look, project)) &&
        !adopted && (
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
            first to see which decisions a change preserves.
          </p>
        )}
      {revisionNotice && (
        <Notice>
          The working book changed. Review the current inputs and prepare a new
          impact proposal.
        </Notice>
      )}
      {!proposal && (
        <div className="change-setup">
          <div className="change-type-switch">
            <button
              className={kind === "garment_unavailable" ? "selected" : ""}
              aria-pressed={kind === "garment_unavailable"}
              onClick={() => {
                setKind("garment_unavailable");
                setSubject(initialUnitId || project.units[0]?.id || "");
              }}
            >
              <GitBranch size={22} />
              <strong>A garment is unavailable</strong>
              <span>Trace the unit through looks, scenes, and sourcing.</span>
            </button>
            <button
              className={kind === "recast" ? "selected" : ""}
              aria-pressed={kind === "recast"}
              onClick={() => {
                setKind("recast");
                setSubject(project.characters[0]?.id || "");
              }}
            >
              <RefreshCcw size={22} />
              <strong>A character is recast</strong>
              <span>
                Keep the direction. Review the new performer’s evidence.
              </span>
            </button>
          </div>
          {kind === "garment_unavailable" ? (
            <Field label="Which physical unit is unavailable?">
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                {project.units.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.code} · {u.name}
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
                  {project.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
                    .filter((p) => p.id !== character?.performerId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.synthetic ? " · synthetic" : ""}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          )}
          <div className="change-intent">
            <span className="mono">CHANGE INTENT</span>
            <p>
              {kind === "garment_unavailable"
                ? `${unit?.name || "This garment"} can no longer be allocated. Compare replacements using this production’s recorded constraints.`
                : "Actor-specific previews, approvals, and fitting evidence will need review. Character direction and unrelated cast decisions remain."}
            </p>
          </div>
        </div>
      )}
      {proposal && (
        <>
          <div className="change-summary">
            <div>
              <span className="mono">
                {revision(proposal.baseRevision)} / BASE REVISION
              </span>
              <h3>
                {kind === "garment_unavailable"
                  ? `${unit?.code || "Unit"} leaves the wardrobe.`
                  : `${character?.name || "This character"} gets a new performer.`}
              </h3>
              {proposal.impact.explanation.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <div className="dependency-path">
              <span>
                {kind === "garment_unavailable" ? unit?.code : character?.name}
              </span>
              <ArrowDown size={16} />
              <span>
                {proposal.impact.lookIds.length} dependent look
                {proposal.impact.lookIds.length === 1 ? "" : "s"}
              </span>
              <ArrowDown size={16} />
              <span>
                {proposal.impact.sceneIds.length} scene
                {proposal.impact.sceneIds.length === 1 ? "" : "s"} ·{" "}
                {proposal.impact.occurrenceIds.length} calls
              </span>
            </div>
          </div>
          {!adopted && (
            <>
              <div className="section-title">
                <h3>Review the repair</h3>
                <span className="muted">
                  No creative decision is approved for you.
                </span>
              </div>
              <div className="repair-options repair-options-visual">
                {proposal.options.map((option) => {
                  const replacementUnit = project.units.find(
                    (u) => u.id === option.replacementUnitId,
                  );
                  const performer = project.performers.find(
                    (p) => p.id === option.replacementPerformerId,
                  );
                  const candidate = project.appearanceCandidates?.find(
                    (item) => item.id === option.candidateId,
                  );
                  const candidatePreview =
                    candidate && getCurrentCandidatePreview(project, candidate);
                  return (
                    <button
                      className={`repair-option ${option.id === optionId ? "selected" : ""}`}
                      key={option.id}
                      onClick={() => setOptionId(option.id)}
                      aria-pressed={option.id === optionId}
                      aria-label={`${option.label} · ${option.feasible ? "Reviewable proposal" : option.requiresVisualApproval ? "Appearance approval needed" : "Constraint conflict"}`}
                    >
                      <div className="repair-option-image">
                        <Photo
                          src={
                            candidatePreview?.imageUrl ||
                            replacementUnit?.imageUrl ||
                            performer?.imageUrl
                          }
                          alt={
                            candidatePreview
                              ? `Actual YouCam performer preview for ${option.label}`
                              : `${replacementUnit?.name || performer?.name || "Repair option"}, source reference`
                          }
                        />
                        {candidatePreview && replacementUnit && (
                          <span className="repair-reference-inset">
                            <Photo
                              src={replacementUnit.imageUrl}
                              alt={`Exact reference ${replacementUnit.code}`}
                              sizes="65px"
                            />
                          </span>
                        )}
                        <span className="repair-image-label">
                          {candidatePreview
                            ? "ACTUAL YOUCAM RESULT"
                            : "SOURCE REFERENCE"}
                        </span>
                      </div>
                      <div>
                        <div className="repair-option-top">
                          <strong>{option.label}</strong>
                          <span className="radio-indicator">
                            {option.id === optionId && <Check size={12} />}
                          </span>
                        </div>
                        <p>{option.explanation}</p>
                        <div className="inline-badges">
                          <Badge
                            tone={
                              option.feasible
                                ? "info"
                                : option.requiresVisualApproval
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {option.feasible
                              ? "Reviewable proposal"
                              : option.requiresVisualApproval
                                ? "Appearance approval needed"
                                : "Constraint conflict"}
                          </Badge>
                          {option.costDeltaCents !== 0 && (
                            <span className="mono">
                              {option.costDeltaCents > 0 ? "+" : ""}
                              {money(option.costDeltaCents, project.currency)}
                            </span>
                          )}
                        </div>
                        <p className="repair-evidence-count">
                          {
                            new Set(
                              option.findings.map((finding) => finding.code),
                            ).size
                          }{" "}
                          evidence categories to inspect
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {proposal.impact.lookIds.length > 0 && (
                <div className="repair-review-action">
                  <p>
                    Inspect exact outputs together, record a decision, then
                    return to refresh this impact.
                  </p>
                  <Link
                    className="button button-primary"
                    href={`/production/${project.id}/looks?look=${proposal.impact.lookIds[0] || ""}&detail=alternatives&${proposal.kind === "recast" ? `performer=${replacement}&recast=${subject}` : `repair=${subject}`}`}
                    onClick={close}
                  >
                    Compare & review alternatives <ArrowRight size={15} />
                  </Link>
                </div>
              )}
              {selected && <FindingSummary findings={selected.findings} />}
              {!proposal.options.length && (
                <Notice tone="warning">
                  No repair satisfies the recorded constraints. Add an allowed
                  replacement, obtain availability evidence, or explicitly
                  revise the requirement before recomputing.
                </Notice>
              )}
            </>
          )}
          <ContinuityWall
            project={project}
            compact
            affectedLookIds={proposal.impact.lookIds}
          />
          {!!proposal.impact.creativeFlags?.length && (
            <section className="creative-impact">
              <span className="eyebrow">CREATIVE INTENT TO RECONCILE</span>
              <h3>The old garment is still in the direction.</h3>
              <ul>
                {proposal.impact.creativeFlags.map((flag, index) => (
                  <li key={`${flag.characterId}-${index}`}>
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
              <p>
                These references need an explicit edit or a deliberate decision
                to retain them.
              </p>
              {adopted &&
                [
                  ...new Set(
                    proposal.impact.creativeFlags.map(
                      (flag) => flag.characterId,
                    ),
                  ),
                ].map((id) => {
                  const character = project.characters.find(
                    (item) => item.id === id,
                  );
                  return character ? (
                    <DirectionRepair
                      key={id}
                      character={character}
                      busy={busy}
                      onSave={handleDirectionSave}
                    />
                  ) : null;
                })}
            </section>
          )}
          <div className="impact-columns">
            <section className="impact-preserved">
              <h4>
                <ShieldCheck size={17} /> What stays valid
              </h4>
              <ul>
                {proposal.impact.preserved.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
                {proposal.impact.preservedApprovalIds.length > 0 && (
                  <li>
                    {proposal.impact.preservedApprovalIds.length} existing
                    appearance approval
                    {proposal.impact.preservedApprovalIds.length === 1
                      ? ""
                      : "s"}{" "}
                    preserved
                  </li>
                )}
                {(proposal.impact.preservedBeautyApprovalIds?.length || 0) >
                  0 && (
                  <li>
                    {proposal.impact.preservedBeautyApprovalIds!.length}{" "}
                    independent makeup approval(s) preserved
                  </li>
                )}
                {(proposal.impact.preservedDetailApprovalIds?.length || 0) >
                  0 && (
                  <li>
                    {proposal.impact.preservedDetailApprovalIds!.length}{" "}
                    independent hair or accessory approval(s) preserved
                  </li>
                )}
              </ul>
            </section>
            <section className="impact-review">
              <h4>
                <TriangleAlert size={17} /> What needs attention
              </h4>
              <ul>
                <li>
                  {proposal.impact.sceneIds
                    .map((id) => project.scenes.find((s) => s.id === id))
                    .filter(Boolean)
                    .map((s) => `Scene ${s!.number}`)
                    .join(", ") || "No scheduled scenes"}
                </li>
                {proposal.impact.invalidatedApprovalIds.length > 0 && (
                  <li>
                    {proposal.impact.invalidatedApprovalIds.length} appearance
                    approval
                    {proposal.impact.invalidatedApprovalIds.length === 1
                      ? ""
                      : "s"}{" "}
                    affected
                  </li>
                )}
                {(proposal.impact.invalidatedBeautyApprovalIds?.length || 0) >
                  0 && (
                  <li>
                    {proposal.impact.invalidatedBeautyApprovalIds!.length}{" "}
                    independent makeup approval(s) affected
                  </li>
                )}
                {(proposal.impact.invalidatedDetailApprovalIds?.length || 0) >
                  0 && (
                  <li>
                    {proposal.impact.invalidatedDetailApprovalIds!.length}{" "}
                    independent hair or accessory approval(s) affected
                  </li>
                )}
                <li>
                  {proposal.impact.sourcingIds.length} sourcing record
                  {proposal.impact.sourcingIds.length === 1 ? "" : "s"} ·{" "}
                  {proposal.impact.packIds.length} crew pack
                  {proposal.impact.packIds.length === 1 ? "" : "s"}
                </li>
              </ul>
            </section>
          </div>
          {adopted && (
            <Notice
              tone="success"
              title={`${revision(project.revision)} is now the current working book.`}
            >
              The exact reviewed alternative remains attached. Open the affected
              looks to inspect their current decisions and any independent
              details that need review.
            </Notice>
          )}
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {isStale && (
        <Notice tone="warning">
          The production changed after this proposal was prepared. Recompute its
          impact before adoption.
        </Notice>
      )}
      <div className="modal-actions">
        <Button onClick={close} disabled={busy}>
          {adopted ? "Back to production" : "Cancel"}
        </Button>
        {adopted ? (
          <Link
            className="button button-primary"
            href={`/production/${project.id}/looks?look=${proposal?.impact.lookIds[0] || ""}`}
            onClick={close}
          >
            Review affected looks
            <ArrowRight size={16} />
          </Link>
        ) : !proposal || isStale ? (
          <Button
            variant="primary"
            busy={busy}
            disabled={!subject || (kind === "recast" && !replacement)}
            onClick={() => void propose()}
          >
            {isStale ? "Recompute impact" : "Preview the impact"}
            <GitBranch size={16} />
          </Button>
        ) : (
          <Button
            variant="primary"
            busy={busy}
            disabled={!selected?.feasible}
            onClick={() => void adopt()}
          >
            Adopt this revision
            <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </Modal>
  );
}
