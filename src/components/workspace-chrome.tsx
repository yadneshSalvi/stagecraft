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
import { Button, Field, Modal, Notice } from "./ui";
import { getReadiness } from "@/lib/domain/selectors";
import { ExampleDecisions } from "./example-decisions";
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
          <Link href="/evidence" aria-label="Evidence & limits">
            <CircleHelp size={20} />
          </Link>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <Link className="production-switcher" href="/productions">
            <span className="production-icon">S</span>
            <span>{project.title}</span>
            <ChevronDown size={14} />
          </Link>
          <div className="topbar-state">
            {project.fixture &&
              pathname === base &&
              getReadiness(project).appearanceApproved === 0 && (
                <ExampleDecisions compact />
              )}
            <span className="save-state" role="status">
              {busy ? (
                <>
                  <LoaderCircle size={13} className="spin" /> Saving…
                </>
              ) : (
                <>
                  <Check size={13} /> Saved
                </>
              )}
            </span>
            {project.fixture && <span className="sample-pill">Example</span>}
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
      </div>
      <Modal
        open={settings}
        onClose={() => {
          if (!busy && !deleting) setSettings(false);
        }}
        title="Settings"
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
          <Field label={`Wardrobe budget (${project.currency})`}>
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
          <h3>Data</h3>
          <a
            className="button"
            href={`/api/projects/${project.id}/export`}
            download
          >
            <Download size={16} />
            Export production JSON
          </a>
          {project.fixture && <ExampleDecisions />}
          <Link className="settings-evidence" href="/evidence">
            Evidence &amp; limits ↗
          </Link>
          <details>
            <summary>Delete this production</summary>
            <p>
              Cannot be undone. Type <strong>{project.title}</strong> to
              confirm.
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
              Delete production
            </Button>
          </details>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Modal>
    </div>
  );
}
