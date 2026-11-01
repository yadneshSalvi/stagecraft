"use client";
import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadImage } from "@/lib/upload-client";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";

export function FaceSourceDialog({
  open,
  onClose,
  performerId,
}: {
  open: boolean;
  onClose: () => void;
  performerId: string;
}) {
  const { project, setProject, send, busy, error, setError } = useProduction();
  const performer = project.performers.find(
    (person) => person.id === performerId,
  );
  const face = performer?.faceCapture;
  const [file, setFile] = useState<File | null>(null);
  const [permitted, setPermitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dimensionsId = useId();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !permitted || uploading || busy) return;
    setUploading(true);
    setError(null);
    setMessage("Uploading…");
    try {
      const result = await uploadImage(file, project.id, "face", performerId);
      setProject(result.project);
      setFile(null);
      setPermitted(false);
      if (input.current) input.current.value = "";
      setMessage("Saved. Face previews need re-review.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The face source could not be saved.",
      );
      setMessage("");
    } finally {
      setUploading(false);
    }
  }
  async function revoke() {
    if (!withdraw) return;
    const result = await send({ type: "withdraw_face_consent", performerId });
    if (result) {
      setWithdraw(false);
      setMessage("Permission withdrawn.");
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!uploading && !busy) onClose();
      }}
      title="Face source"
    >
      <div className="face-source-preview">
        <Photo
          original
          natural
          aspectRatio={4 / 5}
          src={face?.consent.granted ? face.imageUrl : null}
          alt={
            face?.consent.granted
              ? `${performer?.name}, separate face source`
              : ""
          }
        />
        <div>
          {!face?.consent.granted && (
            <Badge tone="warning">Permission needed</Badge>
          )}
          <h3>{performer?.name}</h3>
          <p>Clear, front-facing, face unobstructed.</p>
        </div>
      </div>
      <form onSubmit={save} className="form-stack">
        <Field
          label="Face source image"
          hint="JPEG, PNG or WebP · ≤10 MB · ≥512 px"
        >
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby={dimensionsId}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setMessage("");
            }}
          />
          <span className="sr-only" id={dimensionsId}>
            At least 512 px long edge, 384 px short edge.
          </span>
        </Field>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={permitted}
            onChange={(event) => setPermitted(event.target.checked)}
          />
          I have the rights to use this image with YouCam.
        </label>
        <Notice>Private to this browser. Deleted after 30 days.</Notice>
        {message && (
          <p className="upload-feedback" role="status">
            {message}
          </p>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="modal-actions">
          <Button type="button" disabled={uploading || busy} onClick={onClose}>
            Done
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={uploading}
            disabled={!file || !permitted || busy}
          >
            <Upload size={15} />
            Save face source
          </Button>
        </div>
      </form>
      {face?.consent.granted && (
        <details className="source-withdrawal">
          <summary>Withdraw face-source permission</summary>
          <p>Removes this performer’s face previews and approvals.</p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={withdraw}
              onChange={(event) => setWithdraw(event.target.checked)}
            />
            Withdraw face permission for {performer?.name}.
          </label>
          <Button
            variant="danger"
            disabled={!withdraw || uploading}
            busy={busy}
            onClick={() => void revoke()}
          >
            Withdraw face permission
          </Button>
        </details>
      )}
    </Modal>
  );
}
