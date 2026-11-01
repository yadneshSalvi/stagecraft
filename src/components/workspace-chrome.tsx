"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Grid2X2,
  Drama,
  CalendarDays,
  Shirt,
  BookOpen,
  ChevronDown,
  Check,
  LoaderCircle,
  Settings2,
  CircleHelp,
  X,
  Download,
  Trash2,
} from "lucide-react";
import { useProduction } from "./production-context";
import { Brand } from "./brand";
import { Badge, Button, Field, Modal, Notice } from "./ui";
import { revision } from "@/lib/format";
import { deleteProject } from "@/lib/client";

export function WorkspaceChrome({ children }: { children: ReactNode }) {
  const { project, busy, error, clearError, send, setError } = useProduction();
  const pathname = usePathname();
  const router = useRouter();
  const [settings, setSettings] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [budget, setBudget] = useState(String(project.budgetCents / 100));
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const base = `/production/${project.id}`;
  const links = [
    { suffix: "", label: "Production", icon: Grid2X2 },
    { suffix: "/looks", label: "Looks", icon: Drama },
    { suffix: "/schedule", label: "Schedule", icon: CalendarDays },
    { suffix: "/wardrobe", label: "Wardrobe", icon: Shirt },
    { suffix: "/handoff", label: "Handoff", icon: BookOpen },
  ];
  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    const result = await send({
      type: "update_production",
      title,
      budgetCents: Math.round(Number(budget) * 100),
    });
    if (result) setSettings(false);
  }
  async function erase() {
    setDeleting(true);
    try {
      await deleteProject(project.id);
      router.push("/productions");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The production could not be deleted.",
      );
      setDeleting(false);
    }
  }
  return (
    <div className="workspace">
      <aside className="navigation-rail">
        <Brand compact />
        <nav aria-label="Production navigation">
          {links.map((link) => {
            const active = link.suffix
              ? pathname.startsWith(base + link.suffix)
              : pathname === base || pathname === `${base}/script`;
            return (
              <Link
                key={link.label}
                href={base + link.suffix}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                <link.icon size={21} strokeWidth={1.5} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="rail-bottom">
          <button
            onClick={() => {
              setTitle(project.title);
              setBudget(String(project.budgetCents / 100));
              setSettings(true);
            }}
          >
            <Settings2 size={20} />
            <span>Settings</span>
          </button>
          <Link href="/evidence" aria-label="Evidence and help">
            <CircleHelp size={20} />
          </Link>
          <span
            className="rail-monogram"
            title="Your private browser workspace"
          >
            YOU
          </span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <Link className="production-switcher" href="/productions">
            <span className="production-icon">S</span>
            <span>
              {project.title}
              <small>
                {project.mode === "film"
                  ? "FILM PRODUCTION"
                  : "LIVE PERFORMANCE"}
              </small>
            </span>
            <ChevronDown size={14} />
          </Link>
          <div className="topbar-state">
            <Badge tone="brass">{revision(project.revision)}</Badge>
            <span className="save-state" role="status">
              {busy ? (
                <>
                  <LoaderCircle size={13} className="spin" /> Saving revision
                </>
              ) : (
                <>
                  <Check size={13} /> All changes saved
                </>
              )}
            </span>
            {project.fixture && (
              <span className="sample-pill">EXAMPLE PRODUCTION</span>
            )}
          </div>
        </header>
        <main id="main-content" className="workspace-content">
          {error && !settings && (
            <div className="global-alert">
              <Notice tone="danger">{error}</Notice>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={clearError}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            {project.fixture
              ? "A fictional production · Synthetic cast and inventory"
              : "Private production · Access belongs to this browser"}
          </span>
          <Link href="/evidence">
            Evidence &amp; limits <span aria-hidden="true">↗</span>
          </Link>
        </footer>
      </div>
      <Modal
        open={settings}
        onClose={() => {
          if (!busy && !deleting) setSettings(false);
        }}
        title="The production desk"
        description="Manage this working book, export its records, or remove your private data."
      >
        <form onSubmit={saveSettings} className="form-stack">
          <Field label="Production title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field
            label={`Hard wardrobe budget (${project.currency})`}
            hint="A repair or allocation must stay within this recorded budget."
          >
            <input
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </Field>
          <div className="modal-actions">
            <Button type="button" onClick={() => setSettings(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" busy={busy}>
              Save settings
            </Button>
          </div>
        </form>
        <div className="settings-data">
          <h3>Your production data</h3>
          <p className="muted">
            Export contains the working book and its evidence references.
            Original private media remains protected by this browser’s access.
          </p>
          <a
            className="button"
            href={`/api/projects/${project.id}/export`}
            download
          >
            <Download size={16} />
            Export production JSON
          </a>
          <details>
            <summary>Delete this production</summary>
            <p>
              Delete the production, private uploads, and generated media. This
              action cannot be undone. Type <strong>{project.title}</strong> to
              enable deletion.
            </p>
            <input
              aria-label="Confirm production title to delete"
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
            />
            <Button
              variant="danger"
              disabled={deleteText !== project.title}
              busy={deleting}
              onClick={() => void erase()}
            >
              <Trash2 size={16} />
              Delete production and private data
            </Button>
          </details>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Modal>
    </div>
  );
}
