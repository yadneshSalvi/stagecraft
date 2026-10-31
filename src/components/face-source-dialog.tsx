"use client";
import { useRef, useState } from "react";
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
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !permitted || uploading || busy) return;
    setUploading(true);
    setError(null);
    setMessage("Uploading and validating the separate face source…");
    try {
      const result = await uploadImage(file, project.id, "face", performerId);
      setProject(result.project);
      setFile(null);
      setPermitted(false);
      if (input.current) input.current.value = "";
      setMessage(
        "Face source saved privately. Beauty evidence now needs a fresh review; the garment source and its approval stay separate.",
      );
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
      setMessage(
        "Face permission withdrawn. New beauty derivations are blocked and existing beauty evidence is invalid. Garment permission remains separate.",
      );
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!uploading && !busy) onClose();
      }}
      title="A source for the makeup detail"
      description={`${performer?.name || "Performer"} · independently versioned face capture`}
    >
      <div className="face-source-preview">
        <Photo
          original
          src={face?.consent.granted ? face.imageUrl : null}
          alt={
            face?.consent.granted
              ? `${performer?.name}, separate face source`
              : ""
          }
        />
        <div>
          <Badge tone={face?.consent.granted ? "brass" : "warning"}>
            {face?.consent.granted
              ? face.synthetic
                ? "Synthetic face source"
                : "Private face source"
              : "Face permission needed"}
          </Badge>
          <h3>{performer?.name}</h3>
          <p>
            {face ? `Face capture ${face.version}. ` : ""}Choose a clear,
            front-facing image with the face unobstructed. This image is stored
            and reviewed separately from the costume source.
          </p>
        </div>
      </div>
      <form onSubmit={save} className="form-stack">
        <Field
          label="Face source image"
          hint="JPEG, PNG, or WebP under 10 MB. At least 512 px on the long edge and 384 px on the short edge."
        >
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setMessage("");
            }}
          />
        </Field>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={permitted}
            onChange={(event) => setPermitted(event.target.checked)}
          />
          I have permission and image rights to store this face source and send
          it to YouCam for this production’s makeup previews.
        </label>
        <Notice>
          Uploads and results are private to this browser’s production and
          expire after 30 days. A face-source change requires new makeup
          evidence.
        </Notice>
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
            Save private face source
          </Button>
        </div>
      </form>
      {face?.consent.granted && (
        <details className="source-withdrawal">
          <summary>Withdraw face-source permission</summary>
          <p>
            Stops future makeup derivations and invalidates this performer’s
            beauty previews and approvals. Previously downloaded copies cannot
            be recalled.
          </p>
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
