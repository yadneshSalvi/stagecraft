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
import { useProduction } from "./production-context";
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
      setError(
        "Please use a plain text script under 200 KB and 60,000 characters.",
      );
      return;
    }
    const value = await file.text();
    if (value.length > 60_000) {
      setError(
        "This working book supports script extracts up to 60,000 characters. Import a bounded set of scenes.",
      );
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
        eyebrow="THE SCRIPT / SOURCE-LINKED BREAKDOWN"
        title="Begin with the words."
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
      >
        Story facts stay linked to their source. Creative inferences stay open
        for review.
      </PageHeading>
      {!project.script ? (
        <EmptyState
          title="Give the production its first words."
          action={
            <Button variant="primary" onClick={() => setImporting(true)}>
              <FileText size={17} />
              Import a permitted script
            </Button>
          }
        >
          Paste a licensed script or upload a plain-text extract. Structured AI
          will suggest scene boundaries, characters, and costume cues for your
          review.
        </EmptyState>
      ) : (
        <>
          <div className="script-meta">
            <Badge
              tone={
                project.script.provenance === "synthetic" ? "brass" : "info"
              }
            >
              {project.script.provenance === "synthetic"
                ? "Original synthetic script"
                : "AI-assisted extraction"}
            </Badge>
            <span>{project.script.label}</span>
            <span className="mono">
              {project.scenes.filter((s) => s.reviewed).length} /{" "}
              {project.scenes.length} SCENES REVIEWED
            </span>
          </div>
          <div className="breakdown-layout">
            <nav className="scene-nav" aria-label="Script scenes">
              <p className="eyebrow">SCENES</p>
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
                      {s.storyDaySource === "unspecified"
                        ? "PROPOSED DAY"
                        : "STORY DAY"}{" "}
                      {s.storyDay}
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
              <header>
                <span className="mono">
                  {project.script.label.toUpperCase()}
                </span>
                <span className="mono">SOURCE DOCUMENT</span>
              </header>
              <h2>{project.script.title}</h2>
              <p className="script-author">
                {project.script.provenance === "synthetic"
                  ? "An original fictional script for the STAGECRAFT example"
                  : "Imported with rights attestation"}
              </p>
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
              <footer>
                <span className="mono">SOURCE SHA256</span>
                <code>{project.script.sha256.slice(0, 20)}…</code>
              </footer>
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
      <Modal
        open={importing}
        onClose={() => {
          if (!extracting && !adopting) {
            setImporting(false);
            setError(null);
          }
        }}
        wide
        title={
          draft ? "The script, ready for your review." : "Bring in the script."
        }
        description={
          draft
            ? "These are proposed boundaries and cues. Adopt the breakdown, then review and correct each scene against its source."
            : "Paste a script you have permission to process. AI suggestions never become production approvals automatically."
        }
      >
        {draft ? (
          <div className="draft-review">
            <div className="draft-summary">
              <div>
                <span className="mono">PROPOSED BREAKDOWN</span>
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
              <Badge tone="warning">Unreviewed extraction</Badge>
            </div>
            {draft.notices.map((notice, index) => (
              <Notice key={index} tone="warning">
                {notice}
              </Notice>
            ))}
            <div className="draft-scenes">
              {draft.scenes.map((s) => (
                <article key={s.id}>
                  <span className="mono">
                    SC {s.number} ·{" "}
                    {s.storyDaySource === "unspecified"
                      ? "CHRONOLOGY UNKNOWN · PROPOSED DAY"
                      : "PROPOSED DAY"}{" "}
                    {s.storyDay}
                  </span>
                  <h4>{s.title}</h4>
                  {s.storyDaySource === "unspecified" && (
                    <Notice tone="warning">
                      The script does not establish this scene’s story day. This
                      number is a provisional grouping for your review.
                    </Notice>
                  )}
                  <p>{s.heading}</p>
                  <ul>
                    {s.requirements.map((r) => (
                      <li key={r.id}>
                        <Badge tone={r.explicit ? "info" : "warning"}>
                          {r.explicit ? "Explicit cue" : "Inference"}
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
            <Notice>
              Existing reviewed scene titles and cue corrections are preserved
              by stable scene mapping. Any unresolved mapping or invalid source
              span blocks adoption.
            </Notice>
            <div className="modal-actions">
              <Button onClick={() => setDraft(null)} disabled={adopting}>
                Revise input
              </Button>
              <Button
                variant="primary"
                busy={adopting}
                onClick={() => void adopt()}
              >
                Adopt as unreviewed breakdown
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
            <Field label="Upload plain text or Fountain (optional)">
              <input
                type="file"
                accept=".txt,.fountain,text/plain"
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
            </Field>
            <Field
              label="Script text"
              hint={`${text.length.toLocaleString()} / 60,000 characters. Scene headings and character names help preserve source links.`}
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
              I have permission to use and process this script with the
              application’s AI providers.
            </label>
            <Notice>
              Story days are inferred where not explicit. They do not create
              shoot dates. The script is treated as data, never as instructions
              to the application.
            </Notice>
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
                {extracting
                  ? "Reading scenes and source cues…"
                  : "Prepare a breakdown"}
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
        <span className="eyebrow">SCENE {scene.number} / REVIEW</span>
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
          <Notice tone="warning" title="Story chronology is unknown.">
            The script does not establish a story day here. Review the proposed
            number against your continuity decisions before saving this scene.
          </Notice>
        )}
        <Field
          label={
            scene.storyDaySource === "unspecified"
              ? "Proposed story day"
              : "Story day"
          }
          hint="Fictional chronology. Scheduling is managed separately."
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
          <h3>Costume & appearance cues</h3>
          {requirements.map((requirement, index) => (
            <article
              className={requirement.explicit ? "cue-explicit" : "cue-inferred"}
              key={requirement.id}
            >
              <div>
                <Badge tone={requirement.explicit ? "info" : "warning"}>
                  {requirement.explicit ? "In the script" : "AI inference"}
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
          {!requirements.length && (
            <p className="muted">
              No explicit appearance cues were extracted for this scene.
            </p>
          )}
        </div>
        <Button variant="primary" type="submit" busy={busy}>
          <Check size={16} />
          Confirm this scene & its cues
        </Button>
        <p className="fine-print">
          Confirmation records your reviewed title, chronology, and every cue
          shown above. It does not approve a rendered look.
        </p>
      </form>
    </section>
  );
}
