"use client";
import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { AppearanceCandidate, Production } from "@/lib/types";
import {
  candidateIntentHash,
  getCurrentCandidateApproval,
  getCurrentCandidatePreview,
} from "@/lib/domain/lineage";
import { displayApproval } from "@/lib/presentation-copy";
import { useProduction } from "./production-context";
import { ApprovalOutput } from "./approval-output";
import { Button, Field, Modal, Notice } from "./ui";

/** The repair dialog and studio review the same exact output and creative intent. */
export function CandidateApproval({
  candidate,
  variant = "default",
  onMutationStart,
  onMutationEnd,
}: {
  candidate: AppearanceCandidate;
  variant?: "default" | "primary" | "quiet";
  onMutationStart?: () => void;
  onMutationEnd?: (project: Production | null) => void;
}) {
  const { project, send, busy, error, clearError } = useProduction();
  const preview = getCurrentCandidatePreview(project, candidate);
  const approval = getCurrentCandidateApproval(project, candidate);
  const performer = project.performers.find(
    (item) => item.id === candidate.performerId,
  );
  const units = candidate.recipe.unitIds
    .map((id) => project.units.find((unit) => unit.id === id)?.code)
    .filter(Boolean);
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [rationale, setRationale] = useState("");
  const [target, setTarget] = useState<{
    previewId: string;
    intent: string;
  } | null>(null);
  const targetPreview = candidate.previews.find(
    (item) => item.id === target?.previewId,
  );
  const changed =
    !!target &&
    (target.previewId !== preview?.id ||
      target.intent !== candidateIntentHash(project, candidate));
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || changed) return;
    onMutationStart?.();
    const next = await send({
      type: "approve_candidate",
      candidateId: candidate.id,
      previewId: preview.id,
      approvedBy: author.trim(),
      rationale: rationale.trim(),
    });
    if (next) setOpen(false);
    onMutationEnd?.(next);
  }
  return (
    <>
      <Button
        variant={variant}
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
        {approval ? "Review approval" : "Approve alternative"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={approval ? "Approved alternative" : "Approve alternative"}
        description={`${performer?.name || "Performer"} · ${units.join(" + ")}`}
      >
        <ApprovalOutput
          imageUrl={performer?.consent.granted ? targetPreview?.imageUrl : null}
          subject={`${performer?.name} · ${units.join(" + ")}`}
        />
        {approval ? (
          <div className="form-stack">
            <Notice tone="success" title={displayApproval(approval).approvedBy}>
              {displayApproval(approval).rationale}
            </Notice>
            <p>Revoking removes it from allocation choices.</p>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button onClick={() => setOpen(false)}>Keep approval</Button>
              <Button
                variant="danger"
                busy={busy}
                onClick={async () => {
                  onMutationStart?.();
                  const next = await send({
                    type: "revoke_candidate_approval",
                    candidateId: candidate.id,
                    approvalId: approval.id,
                  });
                  if (next) setOpen(false);
                  onMutationEnd?.(next);
                }}
              >
                <RotateCcw size={14} />
                Revoke
              </Button>
            </div>
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
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field label="Note">
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
                The preview changed. Re-inspect before approving.
              </Notice>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="modal-actions">
              <Button type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
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
