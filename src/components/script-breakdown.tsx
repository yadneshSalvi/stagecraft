"use client";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Quote,
  Sparkles,
  Upload,
} from "lucide-react";
import type {
  Character,
  Scene,
  SceneRequirement,
  ScriptRevision,
} from "@/lib/types";
import { api } from "@/lib/client";
import { displayFixtureText } from "@/lib/presentation-copy";
import { useProduction } from "./production-context";
import { CharacterScope } from "./character-scope";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeading,
} from "./ui";

interface ScriptDraft {
  id: string;
  baseRevision: number;
  status: "review";
  script: ScriptRevision;
  scenes: Scene[];
  characters: Character[];
  notices: string[];
}
export function ScriptBreakdown() {
  const { project, send, setProject, busy, error, setError } = useProduction();
  const search = useSearchParams();
  const [sceneId, setSceneId] = useState(
    search.get("scene") || project.scenes[0]?.id || "",
  );
  const [importing, setImporting] = useState(!project.script);
  const [title, setTitle] = useState(project.title);
  const [label, setLabel] = useState("Draft 1");
  const [text, setText] = useState("");
  const [rights, setRights] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [highlight, setHighlight] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const markRef = useRef<HTMLElement>(null);
  const scene =
    project.scenes.find((s) => s.id === sceneId) || project.scenes[0];
  useEffect(() => {
    if (highlight)
      markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);
  async function extract(event: React.FormEvent) {
    event.preventDefault();
    setExtracting(true);
    setError(null);
    try {
      const result = await api<{ draft: ScriptDraft }>(
        `/api/projects/${project.id}/script`,
        {
          method: "POST",
          body: JSON.stringify({
            text,
            title,
            label,
            rightsConfirmed: rights,
            expectedRevision: project.revision,
            commandId: crypto.randomUUID(),
          }),
        },
      );
      setDraft(result.draft);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The script could not be analyzed.",
      );
    } finally {
      setExtracting(false);
    }
  }
  async function adopt() {
    if (!draft) return;
    setAdopting(true);
    setError(null);
    try {
      const result = await api<{ project: typeof project }>(
        `/api/projects/${project.id}/script/adopt`,
        {
          method: "POST",
          body: JSON.stringify({
            draftId: draft.id,
            expectedRevision: project.revision,
            commandId: crypto.randomUUID(),
          }),
        },
      );
      setProject(result.project);
      setSceneId(result.project.scenes[0]?.id || "");
      setImporting(false);
      setDraft(null);
      setText("");
      setRights(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The breakdown could not be adopted.",
      );
    } finally {
      setAdopting(false);
    }
  }
  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 200_000) {
      setError("Use plain text under 200 KB and 60,000 characters.");
      return;
    }
    const value = await file.text();
    if (value.length > 60_000) {
      setError("Use plain text under 60,000 characters.");
      return;
    }
    setText(value);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }
  return (
    <>
      <Link className="back-link" href={`/production/${project.id}`}>
        <ArrowLeft size={14} />
        Back to production
      </Link>
      <PageHeading
        title="Script"
        action={
          <Button
            onClick={() => {
              setImporting(true);
              setError(null);
            }}
          >
            <Upload size={15} />
            {project.script ? "Import a revision" : "Import script"}
          </Button>
        }
      />
      {!project.script ? (
        <EmptyState
          title="No script yet"
          action={
            <Button variant="primary" onClick={() => setImporting(true)}>
              <FileText size={17} />
              Import script
            </Button>
          }
        />
      ) : (
        <>
          <div className="script-meta">
            <span>
              {displayFixtureText(project.script.label, project.fixture)}
            </span>
            <span className="mono">
              {project.scenes.filter((s) => s.reviewed).length}/
              {project.scenes.length} reviewed
            </span>
          </div>
          <div className="breakdown-layout">
            <nav className="scene-nav" aria-label="Script scenes">
              {project.scenes.map((s) => (
                <button
                  className={s.id === scene?.id ? "selected" : ""}
                  key={s.id}
                  onClick={() => {
                    setSceneId(s.id);
                    setHighlight({ start: s.sourceStart, end: s.sourceEnd });
                  }}
                >
                  <span className="mono">{s.number}</span>
                  <span>
                    {s.title}
                    <small>
                      Day {s.storyDay}
                      {s.storyDaySource === "unspecified" ? "?" : ""}
                    </small>
                  </span>
                  {s.reviewed && <Check size={13} />}
                </button>
              ))}
            </nav>
            <section
              className="script-paper"
              aria-label="Original script source"
              tabIndex={0}
            >
              {!project.script.text
                .trimStart()
                .toLowerCase()
                .startsWith(project.script.title.trim().toLowerCase()) && (
                <h2>{project.script.title}</h2>
              )}
              <pre>
                {highlight &&
                highlight.start >= 0 &&
                highlight.end <= project.script.text.length ? (
                  <>
                    {project.script.text.slice(0, highlight.start)}
                    <mark ref={markRef}>
                      {project.script.text.slice(
                        highlight.start,
                        highlight.end,
                      )}
                    </mark>
                    {project.script.text.slice(highlight.end)}
                  </>
                ) : (
                  project.script.text
                )}
              </pre>
            </section>
            {scene && (
              <SceneReview
                key={`${scene.id}-${project.revision}`}
                scene={scene}
                source={project.script.text}
                onHighlight={(requirement) =>
                  setHighlight({
                    start: requirement.sourceStart,
                    end: requirement.sourceEnd,
                  })
                }
                onSave={async (title, storyDay, requirements) => {
                  await send({
                    type: "review_scene",
                    sceneId: scene.id,
                    title,
                    storyDay,
                    requirements,
                  });
                }}
                busy={busy}
              />
            )}
          </div>
        </>
      )}
      <CharacterScope />
      <Modal
        open={importing}
        onClose={() => {
          if (!extracting && !adopting) {
            setImporting(false);
            setError(null);
          }
        }}
        wide
        title={draft ? "Review breakdown" : "Import script"}
      >
        {draft ? (
          <div className="draft-review">
            <div className="draft-summary">
              <div>
                <h3>{draft.script.title}</h3>
                <p>
                  {draft.scenes.length} scenes · {draft.characters.length}{" "}
                  characters ·{" "}
                  {draft.scenes.reduce(
                    (sum, s) => sum + s.requirements.length,
                    0,
                  )}{" "}
                  costume cues
                </p>
              </div>
            </div>
            {draft.notices.length > 0 && (
              <details className="draft-notices">
                <summary>Notes ({draft.notices.length})</summary>
                <ul>
                  {draft.notices.map((notice, index) => (
                    <li key={index}>{notice}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="draft-scenes">
              {draft.scenes.map((s) => (
                <article key={s.id}>
                  <span className="mono">
                    SC {s.number} · Day {s.storyDay}
                    {s.storyDaySource === "unspecified" ? "?" : ""}
                  </span>
                  <h4>{s.title}</h4>
                  <p>{s.heading}</p>
                  <ul>
                    {s.requirements.map((r) => (
                      <li key={r.id}>
                        <Badge tone={r.explicit ? "info" : "warning"}>
                          {r.explicit ? "Script" : "Inferred"}
                        </Badge>
                        {r.text}
                        <blockquote>
                          {draft.script.text.slice(r.sourceStart, r.sourceEnd)}
                        </blockquote>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="modal-actions">
              <Button onClick={() => setDraft(null)} disabled={adopting}>
                Revise input
              </Button>
              <Button
                variant="primary"
                busy={adopting}
                onClick={() => void adopt()}
              >
                Adopt breakdown
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        ) : (
          <form className="form-stack" onSubmit={extract}>
            <div className="field-grid">
              <Field label="Script title">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  maxLength={120}
                />
              </Field>
              <Field label="Revision label">
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  required
                  maxLength={80}
                />
              </Field>
            </div>
            <Field label="Plain text or Fountain (optional)">
              <input
                type="file"
                accept=".txt,.fountain,text/plain"
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
            </Field>
            <Field
              label="Script text"
              hint={`${text.length.toLocaleString()} / 60,000`}
            >
              <textarea
                className="script-import-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
                minLength={50}
                maxLength={60_000}
                placeholder={
                  "INT. THEATRE FOYER — NIGHT\n\nNORA enters in an oxblood velvet coat, still carrying a suitcase.\n\nNORA\nOne last performance. Then we go."
                }
              />
            </Field>
            <label className="checkbox-field">
              <input
                type="checkbox"
                required
                checked={rights}
                onChange={(event) => setRights(event.target.checked)}
              />
              I have the rights to process this script with AI.
            </label>
            <div className="modal-actions">
              <Button
                type="button"
                onClick={() => setImporting(false)}
                disabled={extracting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                busy={extracting}
                disabled={!rights || text.length < 50}
              >
                <Sparkles size={16} />
                {extracting ? "Reading…" : "Prepare a breakdown"}
              </Button>
            </div>
          </form>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </Modal>
    </>
  );
}

function SceneReview({
  scene,
  source,
  onHighlight,
  onSave,
  busy,
}: {
  scene: Scene;
  source: string;
  onHighlight: (r: SceneRequirement) => void;
  onSave: (
    title: string,
    storyDay: number,
    requirements: SceneRequirement[],
  ) => Promise<void>;
  busy: boolean;
}) {
  const { project } = useProduction();
  const [title, setTitle] = useState(scene.title);
  const [storyDay, setStoryDay] = useState(scene.storyDay);
  const [requirements, setRequirements] = useState(scene.requirements);
  return (
    <section className="scene-review">
      <div className="section-title">
        <h2>Scene {scene.number}</h2>
        <Badge tone={scene.reviewed ? "success" : "warning"}>
          {scene.reviewed ? "Reviewed" : "Needs review"}
        </Badge>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(
            title,
            storyDay,
            requirements.map((r) => ({ ...r, reviewed: true })),
          );
        }}
      >
        <Field label="Scene title">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={120}
          />
        </Field>
        {scene.storyDaySource === "unspecified" && (
          <Notice tone="warning">Story day not in the script</Notice>
        )}
        <Field
          label={
            scene.storyDaySource === "unspecified"
              ? "Proposed story day"
              : "Story day"
          }
        >
          <input
            type="number"
            min="1"
            max="9999"
            value={storyDay}
            onChange={(event) => setStoryDay(Number(event.target.value))}
            required
          />
        </Field>
        <div className="scene-cues">
          <h3>Costume cues</h3>
          {requirements.map((requirement, index) => (
            <article
              className={requirement.explicit ? "cue-explicit" : "cue-inferred"}
              key={requirement.id}
            >
              <div>
                <Badge tone={requirement.explicit ? "info" : "warning"}>
                  {requirement.explicit ? "Script" : "Inferred"}
                </Badge>
                <span>
                  {
                    project.characters.find(
                      (c) => c.id === requirement.characterId,
                    )?.name
                  }
                </span>
              </div>
              <label className="sr-only" htmlFor={`cue-${requirement.id}`}>
                Cue {index + 1}
              </label>
              <textarea
                id={`cue-${requirement.id}`}
                value={requirement.text}
                onChange={(event) =>
                  setRequirements(
                    requirements.map((r) =>
                      r.id === requirement.id
                        ? { ...r, text: event.target.value }
                        : r,
                    ),
                  )
                }
                maxLength={1600}
                rows={3}
              />
              <button
                type="button"
                className="cue-source"
                onClick={() => onHighlight(requirement)}
              >
                <Quote size={12} />
                <span>
                  {source.slice(requirement.sourceStart, requirement.sourceEnd)}
                </span>
                <ArrowLeft size={12} />
              </button>
            </article>
          ))}
          {!requirements.length && <p className="muted">No cues.</p>}
        </div>
        <Button variant="primary" type="submit" busy={busy}>
          <Check size={16} />
          Confirm scene
        </Button>
      </form>
    </section>
  );
}
