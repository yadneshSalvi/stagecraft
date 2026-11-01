"use client";
import { useState } from "react";
import { ArrowRight, Plus, Upload, UserRound } from "lucide-react";
import type { Character, Look, Performer } from "@/lib/types";
import { commandProject, requestPreview } from "@/lib/client";
import { uploadImage } from "@/lib/upload-client";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
import { InitialCasting } from "./initial-casting";
import { RecordedPairGuide, useRecordedLibrary } from "./recorded-pair-guide";

export function CastManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { project, send, setProject, busy, error, setError } = useProduction();
  const [selectedId, setSelectedId] = useState(project.performers[0]?.id || "");
  const [adding, setAdding] = useState(!project.performers.length);
  const [name, setName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const selected =
    project.performers.find((p) => p.id === selectedId) ||
    project.performers[0];
  const castFor = project.characters.filter(
    (c) => c.performerId === selected?.id,
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (uploading || busy) return;
    setError(null);
    setUploading(true);
    setMessage("");
    try {
      let current = project;
      let performerId = selected?.id;
      if (adding) {
        performerId = `performer-${crypto.randomUUID()}`;
        const performer: Performer = {
          id: performerId,
          name: name.trim(),
          pronouns: pronouns.trim(),
          imageUrl: null,
          assetId: null,
          captureVersion: 1,
          synthetic,
          consent: {
            granted: consent,
            purpose: "Private production appearance previews",
            publicDemo: false,
            recordedAt: consent ? new Date().toISOString() : null,
          },
          measurements: { chestCm: null, waistCm: null, heightCm: null },
        };
        const next = await send({ type: "add_performer", performer });
        if (!next) return;
        current = next;
        setSelectedId(performerId);
        setAdding(false);
        if (characterName.trim()) {
          const character: Character = {
            id: `char-${crypto.randomUUID()}`,
            name: characterName.trim(),
            description: "User-created character",
            performerId,
            direction: {
              revision: 1,
              text: "",
              palette: ["#D4AE6A", "#253048", "#E6DFD1"],
              essential: [],
              approvedBy: null,
            },
          };
          const result = await commandProject(current, {
            type: "add_character",
            character,
          });
          current = result.project;
          setProject(current);
        }
        setSelectedId(performerId);
        setAdding(false);
        setName("");
        setPronouns("");
        setCharacterName("");
      }
      if (file && performerId) {
        setMessage("Uploading…");
        const result = await uploadImage(
          file,
          current.id,
          "performer",
          performerId,
        );
        setProject(result.project);
        setFile(null);
        setConsent(false);
        setMessage("Photo saved.");
      } else setMessage("Performer added.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The performer source could not be saved.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function revoke() {
    if (!selected) return;
    const next = await send({
      type: "withdraw_consent",
      performerId: selected.id,
    });
    if (next) {
      setWithdraw(false);
      setMessage("Permission withdrawn.");
    }
  }
  function close() {
    if (!uploading && !busy) {
      onClose();
      setError(null);
      setMessage("");
      setWithdraw(false);
    }
  }
  return (
    <Modal open={open} onClose={close} wide title="Cast & sources">
      <div className="cast-manager">
        <aside>
          <h3>Performers</h3>
          {project.performers.map((performer) => (
            <button
              key={performer.id}
              className={
                !adding && performer.id === selected?.id ? "selected" : ""
              }
              onClick={() => {
                setSelectedId(performer.id);
                setAdding(false);
                setFile(null);
                setConsent(false);
                setMessage("");
                setWithdraw(false);
              }}
            >
              <Photo natural src={performer.imageUrl} alt="" />
              <span>{performer.name}</span>
            </button>
          ))}
          <Button
            onClick={() => {
              setAdding(true);
              setFile(null);
              setConsent(false);
              setMessage("");
            }}
          >
            <Plus size={15} />
            Add performer
          </Button>
        </aside>
        <form className="form-stack" onSubmit={save}>
          {adding ? (
            <>
              <div className="section-title">
                <h3>
                  <UserRound size={16} /> New performer
                </h3>
              </div>
              <div className="field-grid">
                <Field label="Performer name">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </Field>
                <Field label="Pronouns (optional)">
                  <input
                    value={pronouns}
                    onChange={(event) => setPronouns(event.target.value)}
                    maxLength={60}
                  />
                </Field>
              </div>
              <Field label="Character (optional)">
                <input
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                  maxLength={100}
                  placeholder="e.g. The stage manager"
                />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={synthetic}
                  onChange={(event) => setSynthetic(event.target.checked)}
                />
                Synthetic reference
              </label>
            </>
          ) : (
            <>
              <div className="cast-source-summary">
                <Photo
                  natural
                  src={selected?.imageUrl}
                  alt={`${selected?.name}, source image`}
                />
                <div>
                  <h3>{selected?.name}</h3>
                  <p>
                    {castFor.length
                      ? castFor.map((c) => c.name).join(" / ")
                      : "Uncast"}
                  </p>
                  <Badge
                    tone={selected?.consent.granted ? "success" : "warning"}
                  >
                    {selected?.consent.granted
                      ? "Permitted"
                      : "Permission needed"}
                  </Badge>
                </div>
              </div>
              {selected && <InitialCasting performerId={selected.id} />}
              <Notice>
                A new photo resets this performer’s costume approvals.
              </Notice>
            </>
          )}
          <Field
            label={adding ? "Photo (optional)" : "Replace photo"}
            hint="One adult, full body, front-facing · ≤10 MB"
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setMessage("");
              }}
            />
          </Field>
          {file && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              I have the rights to use this image with YouCam.
            </label>
          )}
          <Notice>Private to this browser. Deleted after 30 days.</Notice>
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button
            variant="primary"
            type="submit"
            busy={uploading || busy}
            disabled={(!adding && !file) || (!!file && !consent)}
          >
            <Upload size={16} />
            {adding ? "Add performer" : "Save photo"}
          </Button>
          {!adding && selected?.consent.granted && (
            <details className="consent-withdraw">
              <summary>Withdraw source permission</summary>
              <p>Blocks new previews; clears this performer’s approvals.</p>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={withdraw}
                  onChange={(event) => setWithdraw(event.target.checked)}
                />
                Withdraw permission for {selected.name}.
              </label>
              <Button
                variant="danger"
                disabled={!withdraw}
                busy={busy}
                onClick={() => void revoke()}
                type="button"
              >
                Withdraw permission
              </Button>
            </details>
          )}
        </form>
      </div>
    </Modal>
  );
}

export function NewLookDialog({
  open,
  onClose,
  onCreated,
  onOpenLibrary,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (lookId: string) => void;
  onOpenLibrary?: (performerId: string) => void;
}) {
  const { project, send, busy, error, refresh, setError } = useProduction();
  const [attaching, setAttaching] = useState(false);
  const [characterId, setCharacterId] = useState(
    project.characters[0]?.id || "",
  );
  const [unitId, setUnitId] = useState(project.units[0]?.id || "");
  const [title, setTitle] = useState("");
  const [sceneIds, setSceneIds] = useState<string[]>([]);
  const character = project.characters.find((c) => c.id === characterId);
  const unit = project.units.find((u) => u.id === unitId);
  const recordedLibrary = useRecordedLibrary({
    performerId: character?.performerId || undefined,
    unitId,
    category: unit?.category,
    enabled: open && !!character?.performerId && !!unitId,
  });
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!character || !unit || attaching) return;
    const selectedScenes = project.scenes.filter((s) =>
      sceneIds.includes(s.id),
    );
    const look: Look = {
      id: `look-${crypto.randomUUID()}`,
      title: title.trim(),
      characterId,
      performerId: character.performerId,
      revision: 1,
      sceneIds,
      storyDays: [...new Set(selectedScenes.map((s) => s.storyDay))],
      unitIds: [unitId],
      category: unit.category,
      silhouette: "",
      makeup: {
        notes: "",
        palette: [],
        skinSmoothStrength: 0,
        skinSmoothColorIntensity: 0,
      },
      hair: "",
      accessories: "",
      preparationMinutes: null,
      preparationEvidence: "unknown",
      previews: [],
      approvals: [],
      note: "",
      reviewReason: null,
    };
    const result = await send({ type: "create_look", look });
    if (result) {
      if (recordedLibrary.catalog?.selection?.ready) {
        setAttaching(true);
        try {
          await requestPreview(result, look.id, "recorded");
          await refresh();
        } catch {
          setError("Look saved. No saved preview matched.");
        } finally {
          setAttaching(false);
        }
      }
      onClose();
      onCreated?.(look.id);
      setTitle("");
      setSceneIds([]);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy && !attaching) onClose();
      }}
      title="New look"
    >
      <form className="form-stack" onSubmit={create}>
        <Field label="Look title">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={100}
            placeholder="e.g. The final bow"
          />
        </Field>
        <Field label="Character">
          <select
            value={characterId}
            onChange={(event) => {
              setCharacterId(event.target.value);
              setSceneIds([]);
            }}
            required
          >
            <option value="">Choose a character</option>
            {project.characters.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name} ·{" "}
                {project.performers.find((p) => p.id === c.performerId)?.name ||
                  "Performer unassigned"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Garment unit">
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            required
          >
            <option value="">Choose a garment</option>
            {project.units.map((u) => (
              <option value={u.id} key={u.id}>
                {u.code} · {u.name}
              </option>
            ))}
          </select>
        </Field>
        {character?.performerId && unitId && (
          <RecordedPairGuide
            library={recordedLibrary}
            onSelectUnit={setUnitId}
            onOpenLibrary={onOpenLibrary}
            disabled={busy || attaching}
          />
        )}
        <fieldset className="scene-choice">
          <legend>Scenes</legend>
          {project.scenes
            .filter((scene) => scene.characterIds.includes(characterId))
            .map((scene) => (
              <label className="checkbox-field" key={scene.id}>
                <input
                  type="checkbox"
                  checked={sceneIds.includes(scene.id)}
                  disabled={project.looks.some(
                    (existing) =>
                      existing.characterId === characterId &&
                      existing.sceneIds.includes(scene.id),
                  )}
                  onChange={(event) =>
                    setSceneIds(
                      event.target.checked
                        ? [...sceneIds, scene.id]
                        : sceneIds.filter((id) => id !== scene.id),
                    )
                  }
                />
                <span>
                  <span className="mono">SC {scene.number}</span> {scene.title}
                  {project.looks.some(
                    (existing) =>
                      existing.characterId === characterId &&
                      existing.sceneIds.includes(scene.id),
                  ) && " · already has a look"}
                </span>
              </label>
            ))}
          {!project.scenes.length && (
            <p className="muted">Import a script first.</p>
          )}
        </fieldset>
        {(!project.characters.length || !project.units.length) && (
          <Notice tone="warning">Add cast and a wardrobe unit first.</Notice>
        )}
        {character &&
          !project.performers.some((p) => p.id === character.performerId) && (
            <Notice tone="warning">Assign a performer first.</Notice>
          )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            busy={busy || attaching}
            disabled={
              recordedLibrary.loading ||
              !character ||
              !unit ||
              !sceneIds.length ||
              !project.performers.some((p) => p.id === character?.performerId)
            }
          >
            {recordedLibrary.loading ? "Checking…" : "Create look"}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
