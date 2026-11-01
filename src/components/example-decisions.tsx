"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCheck, RotateCcw } from "lucide-react";
import { useProduction } from "./production-context";
import { Button, Modal, Notice } from "./ui";
import { ProvenanceChip } from "./provenance-chip";
import {
  getCurrentApproval,
  getCurrentBeautyApproval,
} from "@/lib/domain/selectors";
import { getCurrentDetailApproval } from "@/lib/domain/details";
import type { Production } from "@/lib/types";

export function ExampleDecisions({
  compact = false,
  onRecorded,
}: {
  compact?: boolean;
  onRecorded?: (project: Production) => void;
}) {
  const { project, send, busy, error, clearError } = useProduction();
  const [open, setOpen] = useState(false);
  if (!project.fixture) return null;
  const savedDecisions = [
    ...new Map(
      project.looks
        .flatMap((look) => [
          ...look.approvals,
          ...(look.beauty?.approvals || []),
          ...(look.details || []).flatMap((detail) => detail.approvals),
        ])
        .filter(
          (entry) =>
            entry.decisionSource === "example" && entry.state === "current",
        )
        .map((entry) => [entry.id, entry]),
    ).values(),
  ];
  const decisions = [
    ...new Map(
      project.looks
        .flatMap((look) => [
          getCurrentApproval(look, project),
          getCurrentBeautyApproval(look),
          ...(look.details || []).map((detail) =>
            getCurrentDetailApproval(look, detail.kind, project),
          ),
        ])
        .filter((entry) => entry?.decisionSource === "example")
        .map((entry) => [entry!.id, entry!]),
    ).values(),
  ];
  async function record(enabled: boolean) {
    const next = await send({ type: "set_example_decisions", enabled });
    if (next) {
      setOpen(false);
      if (enabled) onRecorded?.(next);
    }
  }
  const action = (
    <Button
      variant={compact ? "default" : "quiet"}
      disabled={busy}
      onClick={() => {
        clearError();
        setOpen(true);
      }}
    >
      {savedDecisions.length && !compact ? (
        <RotateCcw size={15} />
      ) : (
        <CheckCheck size={15} />
      )}
      {savedDecisions.length && !compact
        ? "Manage example decisions"
        : "Record example decisions"}
    </Button>
  );
  return (
    <>
      {compact ? (
        action
      ) : (
        <div className="example-decisions">
          <span className="eyebrow">REHEARSE THE DECISIONS</span>
          <div>
            <ProvenanceChip kind="sample-decision" />
            <p>
              {decisions.length
                ? `${decisions.length} current sample decisions are in this working book.`
                : savedDecisions.length
                  ? "Sample decisions are saved; the current outputs still need review."
                  : "Inspect and approve individual looks, or rehearse the complete allocation with explicit sample decisions."}
            </p>
          </div>
          {!project.proposals.length && decisions.length < 2 && (
            <div className="example-review-links">
              <Link href={`/production/${project.id}/looks?look=look-nora`}>
                Review Nora →
              </Link>
              <Link href={`/production/${project.id}/looks?look=look-mae`}>
                Review Mae →
              </Link>
            </div>
          )}
          {action}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Rehearse the decisions."
        description="Each decision is tied to an exact current output and can be removed without undoing your own reviews."
      >
        <div className="form-stack">
          <p>
            Record an individual approval for each eligible current recorded
            result, attributed exactly to{" "}
            <strong>Example reviewer (sample decision)</strong>. This makes the
            approval-dependent allocation and disruption paths easy to explore.
          </p>
          <p className="muted">
            It does not approve unseen alternatives, confirm supplier
            availability, or record a physical fitting.
          </p>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Keep reviewing individually
            </Button>
            {savedDecisions.length > 0 && (
              <Button
                variant="danger"
                busy={busy}
                onClick={() => void record(false)}
              >
                Remove sample decisions
              </Button>
            )}
            <Button
              variant="primary"
              busy={busy}
              onClick={() => void record(true)}
            >
              Record example decisions
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
