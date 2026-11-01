"use client";
import { useState } from "react";
import { CheckCheck, RotateCcw } from "lucide-react";
import { useProduction } from "./production-context";
import { Button, Modal, Notice } from "./ui";
import type { Production } from "@/lib/types";

export function ExampleDecisions({
  compact = false,
  onRecorded,
  onMutationStart,
  onMutationEnd,
}: {
  compact?: boolean;
  onRecorded?: (project: Production) => void;
  onMutationStart?: () => void;
  onMutationEnd?: (project: Production | null) => void;
}) {
  const { project, send, busy, error, clearError } = useProduction();
  const [open, setOpen] = useState(false);
  if (!project.fixture) return null;
  const saved = project.looks.some((look) =>
    [
      ...look.approvals,
      ...(look.beauty?.approvals || []),
      ...(look.details || []).flatMap((detail) => detail.approvals),
    ].some(
      (entry) =>
        entry.decisionSource === "example" && entry.state === "current",
    ),
  );
  async function record(enabled: boolean) {
    onMutationStart?.();
    const next = await send({ type: "set_example_decisions", enabled });
    if (next) {
      setOpen(false);
      if (enabled) onRecorded?.(next);
    }
    onMutationEnd?.(next);
  }
  return (
    <>
      <Button
        disabled={busy}
        onClick={() => {
          clearError();
          setOpen(true);
        }}
      >
        {saved && !compact ? <RotateCcw size={15} /> : <CheckCheck size={15} />}
        {saved && !compact ? "Manage example approvals" : "Approve as example"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Example approvals"
      >
        <div className="form-stack">
          <p>
            Approves each current look as <strong>Example reviewer</strong>.
            Removable anytime.
          </p>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {saved && (
              <Button
                variant="danger"
                busy={busy}
                onClick={() => void record(false)}
              >
                Remove example approvals
              </Button>
            )}
            <Button
              variant="primary"
              busy={busy}
              onClick={() => void record(true)}
            >
              Approve as example
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
