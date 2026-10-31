"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Look } from "@/lib/types";
import {
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import { revision } from "@/lib/format";
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
      title={
        approval
          ? "The recorded makeup approval"
          : "Approve this exact makeup detail"
      }
      description={`${performer?.name} · Makeup ${revision(look.beauty?.revision || 1)} · face capture ${preview?.faceCaptureVersion || "pending"}`}
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
          <Notice tone="success" title={`Approved by ${approval.approvedBy}`}>
            {approval.rationale}
          </Notice>
          <p className="muted">
            This decision applies only to the exact face capture, makeup recipe
            and output. Costume approval and physical application remain
            separate.
          </p>
          <Button onClick={onClose}>Close makeup approval</Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={approve}>
          <Notice tone="warning">
            Approves this makeup appearance only; physical application is
            checked separately.
          </Notice>
          <Field label="Makeup reviewer name or role">
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="e.g. Morgan · Makeup designer"
            />
          </Field>
          <Field
            label="What did you approve in the makeup detail?"
            hint="Record placement, colour and any limits to carry into a practical application."
          >
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              required
              minLength={5}
              maxLength={1200}
              placeholder="The muted berry supports the character. Check lip edges, placement and texture against the source…"
            />
          </Field>
          {changed && (
            <Notice tone="warning">
              A different output or creative intent is now current. Close this
              dialog and inspect the current makeup before approving. Your
              written notes remain here.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button type="button" onClick={onClose}>
              Keep inspecting
            </Button>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              disabled={changed}
            >
              Record makeup approval
              <Check size={15} />
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
