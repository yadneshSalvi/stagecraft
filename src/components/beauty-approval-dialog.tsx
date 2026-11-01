"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Look } from "@/lib/types";
import {
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import { displayApproval } from "@/lib/presentation-copy";
import { appearanceIntentHash } from "@/lib/domain/lineage";
import { ApprovalOutput } from "./approval-output";
import { useProduction } from "./production-context";
import { Button, Field, Modal, Notice } from "./ui";

export function BeautyApprovalDialog({
  look,
  open,
  onClose,
  targetId,
  targetIntent,
}: {
  look: Look;
  open: boolean;
  onClose: () => void;
  targetId: string | null;
  targetIntent: string | null;
}) {
  const { project, busy, send, error } = useProduction();
  const [author, setAuthor] = useState("");
  const [rationale, setRationale] = useState("");
  const preview = getCurrentBeautyPreview(look);
  const approval = getCurrentBeautyApproval(look);
  const decision = approval ? displayApproval(approval) : null;
  const performer = project.performers.find(
    (person) => person.id === look.performerId,
  );
  const targetPreview = look.beauty?.previews.find(
    (item) => item.id === targetId,
  );
  const changed =
    targetId !== preview?.id ||
    targetIntent !== appearanceIntentHash(project, [look.id]);
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || changed) return;
    const result = await send({
      type: "approve_beauty",
      lookId: look.id,
      previewId: preview.id,
      approvedBy: author.trim(),
      rationale: rationale.trim(),
    });
    if (result) onClose();
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={approval ? "Makeup approval" : "Approve makeup"}
      description={performer?.name}
    >
      <ApprovalOutput
        imageUrl={
          performer?.faceCapture?.consent.granted
            ? targetPreview?.imageUrl
            : null
        }
        subject={`${performer?.name} · makeup detail`}
        provenance={targetPreview?.provenance}
      />
      {approval ? (
        <div className="form-stack">
          <Notice tone="success" title={decision?.approvedBy}>
            {decision?.rationale}
          </Notice>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={approve}>
          <Field label="Reviewer">
            <input
              aria-label="Makeup reviewer name or role"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="Morgan · Makeup designer"
            />
          </Field>
          <Field label="Note">
            <textarea
              aria-label="What did you approve in the makeup detail?"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              required
              minLength={5}
              maxLength={1200}
              placeholder="Muted berry works; check lip edges"
            />
          </Field>
          {changed && (
            <Notice tone="warning">
              The preview changed. Re-inspect before approving.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              disabled={changed}
            >
              Approve
              <Check size={15} />
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
