"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Plus,
  FolderOpen,
  LockKeyhole,
  MoveUpRight,
} from "lucide-react";
import { createProject, listProjects, type ProjectSummary } from "@/lib/client";
import { dateTime, revision } from "@/lib/format";
import { Button, Field, Modal, Notice, Photo } from "./ui";

export function ProductionEntry({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"example" | "blank" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  async function start(mode: "example" | "blank") {
    if (busy) return;
    setBusy(mode);
    setError(null);
    try {
      const { project } = await createProject(mode, title.trim() || undefined);
      router.push(`/production/${project.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The production could not be opened.",
      );
      setBusy(null);
    }
  }
  return (
    <div className={`production-entry ${compact ? "entry-compact" : ""}`}>
      <div className="button-row">
        <Button
          variant="primary"
          busy={busy === "example"}
          disabled={!!busy}
          onClick={() => start("example")}
        >
          {compact ? "Open example production" : "Step inside the production"}
          <ArrowRight size={17} />
        </Button>
        <Button
          variant="quiet"
          disabled={!!busy}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
        >
          Start your own
          <Plus size={16} />
        </Button>
      </div>
      {!compact && (
        <p className="entry-note">
          <LockKeyhole size={12} /> Your private copy. No sign-up required.
        </p>
      )}
      {error && !open && <Notice tone="danger">{error}</Notice>}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="A new production"
        description="Start with your script, your cast, and a wardrobe you can account for."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void start("blank");
          }}
          className="form-stack"
        >
          <Field label="Production title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="A working title is enough"
              required
              maxLength={120}
              autoFocus
            />
          </Field>
          <Notice>
            Your workspace belongs to this browser. Keep this browser’s cookies
            to return to it. You can export or delete your production at any
            time.
          </Notice>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              disabled={!!busy}
            >
              Cancel
            </Button>
            <Button variant="primary" busy={busy === "blank"} type="submit">
              Create production
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then(({ projects }) => {
        if (!cancelled) setProjects(projects);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!loaded)
    return (
      <p className="muted" role="status">
        Opening your working books…
      </p>
    );
  if (!projects.length)
    return (
      <div className="new-production-note">
        <FolderOpen size={22} />
        <div>
          <h2>Your next story starts here.</h2>
          <p>
            Your saved productions will appear in this browser. Open the example
            to explore a complete working book, or begin with a blank page.
          </p>
        </div>
      </div>
    );
  return (
    <div className="project-list">
      {projects.map((project) => (
        <Link
          className="project-row"
          href={`/production/${project.id}`}
          key={project.id}
        >
          <Photo
            src={project.fixture ? "/assets/theatre-atmosphere.webp" : null}
            alt="Theatre auditorium"
            fit="cover"
          />
          <div>
            <p className="eyebrow">
              {project.fixture ? "EXAMPLE PRODUCTION" : "YOUR PRODUCTION"} /{" "}
              {revision(project.revision)}
            </p>
            <h2>{project.title}</h2>
            <p>
              {project.characterCount} characters · {project.sceneCount} scenes
              · Saved {dateTime(project.updatedAt, project.timeZone)}
            </p>
          </div>
          <MoveUpRight size={22} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
