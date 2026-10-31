"use client";
import { useState } from "react";
import { ArrowRight, Plus, Upload, UserRound } from "lucide-react";
import type { Character, Look, Performer } from "@/lib/types";
import { commandProject, requestPreview } from "@/lib/client";
import { uploadImage } from "@/lib/upload-client";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
import { InitialCasting } from "./initial-casting";

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
        setMessage("Uploading and validating the private source…");
        const result = await uploadImage(
          file,
          current.id,
          "performer",
          performerId,
        );
        setProject(result.project);
        setFile(null);
        setConsent(false);
        setMessage(
          "Source saved. Existing actor-specific evidence was reviewed for invalidation.",
        );
      } else
        setMessage(
          "Performer added. A permitted source is needed before generation.",
        );
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
      setMessage(
        "Consent withdrawn. New derivations are blocked and dependent actor evidence is no longer current.",
      );
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
    <Modal
      open={open}
      onClose={close}
      wide
      title="The people behind the characters"
      description="Keep performer identity, story roles, and source permissions clear."
    >
      <div className="cast-manager">
        <aside>
          <p className="eyebrow">PERFORMERS</p>
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
              <Photo src={performer.imageUrl} alt="" />
              <span>
                {performer.name}
                <small>
                  {performer.synthetic
                    ? "Synthetic adult"
                    : "Private performer"}
                </small>
              </span>
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
                  <UserRound size={16} /> A new performer
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
              <Field label="Create a character for this performer (optional)">
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
                This is a synthetic adult reference, rather than a real
                performer.
              </label>
            </>
          ) : (
            <>
              <div className="cast-source-summary">
                <Photo
                  src={selected?.imageUrl}
                  alt={`${selected?.name}, source image`}
                />
                <div>
                  <h3>{selected?.name}</h3>
                  <p>
                    {castFor.length
                      ? castFor.map((c) => c.name).join(" / ")
                      : "Available for casting"}
                  </p>
                  <Badge
                    tone={selected?.consent.granted ? "success" : "warning"}
                  >
                    {selected?.consent.granted
                      ? "Source permission recorded"
                      : "Permission needed"}
                  </Badge>
                  <small>Capture version {selected?.captureVersion}</small>
                  {selected?.synthetic && (
                    <small>Synthetic adult · no real participant</small>
                  )}
                </div>
              </div>
              {selected && <InitialCasting performerId={selected.id} />}
              <Notice>
                A replacement source creates new actor evidence. Previous
                previews remain historical; they do not inherit the new source’s
                approval.
              </Notice>
            </>
          )}
          <Field
            label={
              adding
                ? "Source photograph (optional for now)"
                : "Replace source photograph"
            }
            hint="Adult, single person; straight-on full body, clear face and limbs, neutral pose. JPEG, PNG, or WebP up to 10 MB."
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
              I have permission and image rights for this adult source,
              including processing by YouCam for private production previews.
            </label>
          )}
          <Notice>
            Uploads are private to this browser-owned production and expire
            after 30 days. Provider processing has a separate retention policy;
            withdrawal blocks future derivations. Delete the production to
            request removal of its private application media.
          </Notice>
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button
            variant="primary"
            type="submit"
            busy={uploading || busy}
            disabled={(!adding && !file) || (!!file && !consent)}
          >
            <Upload size={16} />
            {adding ? "Add performer & source" : "Save private source"}
          </Button>
          {!adding && selected?.consent.granted && (
            <details className="consent-withdraw">
              <summary>Withdraw source permission</summary>
              <p>
                This blocks new previews and invalidates actor-specific
                evidence. Historical events remain traceable.
              </p>
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
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (lookId: string) => void;
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
      const performer = result.performers.find(
        (person) => person.id === character.performerId,
      );
      if (
        (performer?.librarySourceId || result.fixture) &&
        (unit.librarySourceId || result.fixture)
      ) {
        setAttaching(true);
        try {
          await requestPreview(result, look.id, "recorded");
          await refresh();
        } catch {
          setError(
            "The look is saved. A matching recording could not be attached; its preview controls remain available in the studio.",
          );
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
      title="A look for a story state"
      description="Choose exact references. You can refine makeup, hair, and continuity notes in the studio."
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
        <Field label="Physical garment unit">
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
        <fieldset className="scene-choice">
          <legend>Appears in these scenes</legend>
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
            <p className="muted">
              Import and review a script to establish scenes first.
            </p>
          )}
        </fieldset>
        {(!project.characters.length || !project.units.length) && (
          <Notice tone="warning">
            Add a character and performer in Cast & sources, and a physical unit
            in Wardrobe, before creating this look.
          </Notice>
        )}
        {character &&
          !project.performers.some((p) => p.id === character.performerId) && (
            <Notice tone="warning">
              Assign a performer through the production’s recast review before
              creating this look.
            </Notice>
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
              !character ||
              !unit ||
              !sceneIds.length ||
              !project.performers.some((p) => p.id === character?.performerId)
            }
          >
            Create look
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
