"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Route,
  ShieldCheck,
} from "lucide-react";
import type { Occurrence, ProductionMode } from "@/lib/types";
import { day, time, money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, Notice, PageHeading } from "./ui";
import { AllocationReview } from "./allocation-review";
import { OccurrenceDialog, TransitionDialog } from "./schedule-dialogs";
import { ScheduleDraft } from "./schedule-draft";

export function ScheduleWorkspace() {
  const { project, send, busy } = useProduction();
  const [edit, setEdit] = useState<Occurrence | "new" | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [focusResult, setFocusResult] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const result = project.allocationResult;
  const occurrences = [...project.occurrences].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const dates = [
    ...new Set(occurrences.map((o) => day(o.start, project.timeZone))),
  ];
  const mode = project.mode;
  return (
    <>
      <PageHeading
        eyebrow="THE CALL SHEET / PHYSICAL COMMITMENTS"
        title="A place. A time. A real garment."
        action={
          <>
            {project.scenes.some(
              (scene) =>
                !project.occurrences.some((call) => call.sceneId === scene.id),
            ) && (
              <Button onClick={() => setDrafting(true)}>
                <CalendarDays size={15} />
                Draft calls from script
              </Button>
            )}
            <Button onClick={() => setEdit("new")}>
              <Plus size={15} />
              Add a call
            </Button>
            <Button
              variant="primary"
              busy={busy}
              onClick={async () => {
                if (await send({ type: "solve_allocation" }))
                  setFocusResult((value) => value + 1);
              }}
            >
              <ShieldCheck size={16} />
              Check the allocation
            </Button>
          </>
        }
      >
        Story chronology and production order are separate. Physical units can
        only be in one place at a time.
      </PageHeading>
      {drafting && <ScheduleDraft onClose={() => setDrafting(false)} />}
      <div className="schedule-controls">
        <div className="segmented" aria-label="Production scheduling mode">
          {[
            { id: "film", label: "Film shoot" },
            { id: "live_performance", label: "Live performance" },
          ].map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? "active" : ""}
              aria-pressed={mode === item.id}
              disabled={busy}
              onClick={() =>
                void send({
                  type: "update_production",
                  mode: item.id as ProductionMode,
                })
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <span>
          <Clock3 size={13} />
          All times in {project.timeZone}
        </span>
        <span className="mono">
          HARD BUDGET {money(project.budgetCents, project.currency)}
        </span>
      </div>
      {mode === "live_performance" && (
        <Notice tone="warning">
          Live changes require performer-specific timing and crew capacity.
          Unknown duration remains unverified.{" "}
          <button
            className="inline-action"
            onClick={() => setTransitionOpen(true)}
          >
            Add a change transition →
          </button>
        </Notice>
      )}
      {!occurrences.length ? (
        <EmptyState
          title="Give the story a call time."
          action={
            <Button variant="primary" onClick={() => setEdit("new")}>
              <CalendarDays size={16} />
              Schedule the first call
            </Button>
          }
        >
          Choose a reviewed scene, production date, time window, and location. A
          story day never automatically becomes a shoot date.
        </EmptyState>
      ) : (
        <div className="schedule-layout">
          <section className="call-sheet">
            {dates.map((date) => (
              <div className="call-day" key={date}>
                <header>
                  <CalendarDays size={16} />
                  <h2>{date}</h2>
                  <span className="mono">
                    {mode === "film" ? "SHOOTING ORDER" : "RUN OF SHOW"}
                  </span>
                </header>
                {occurrences
                  .filter((o) => day(o.start, project.timeZone) === date)
                  .map((occurrence) => {
                    const scene = project.scenes.find(
                      (s) => s.id === occurrence.sceneId,
                    );
                    const looks = project.looks.filter(
                      (l) =>
                        scene?.lookIds.includes(l.id) ||
                        l.sceneIds.includes(occurrence.sceneId),
                    );
                    const blocked = result?.findings.filter(
                      (f) =>
                        f.severity === "conflict" &&
                        f.occurrenceIds.includes(occurrence.id),
                    );
                    return (
                      <article className="call-row" key={occurrence.id}>
                        <div className="call-time">
                          <strong>
                            {time(occurrence.start, project.timeZone)}
                          </strong>
                          <span>{time(occurrence.end, project.timeZone)}</span>
                        </div>
                        <div className="call-marker">
                          <span />
                        </div>
                        <div className="call-detail">
                          <div className="call-topline">
                            <span className="mono">
                              SC {scene?.number || "UNMAPPED"} · STORY DAY{" "}
                              {scene?.storyDay || "?"}
                            </span>
                            <Badge
                              tone={blocked?.length ? "danger" : "neutral"}
                            >
                              {blocked?.length
                                ? "Resource conflict"
                                : occurrence.kind}
                            </Badge>
                          </div>
                          <h3>{scene?.title || occurrence.label}</h3>
                          <p>
                            <MapPin size={12} />
                            {occurrence.location}
                          </p>
                          <div className="call-looks">
                            {looks.map((look) => (
                              <Link
                                key={look.id}
                                href={`/production/${project.id}/looks?look=${look.id}`}
                              >
                                {
                                  project.characters.find(
                                    (c) => c.id === look.characterId,
                                  )?.name
                                }
                                <span>
                                  {look.unitIds
                                    .map(
                                      (id) =>
                                        project.units.find((u) => u.id === id)
                                          ?.code,
                                    )
                                    .filter(Boolean)
                                    .join(" + ")}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${scene?.title || occurrence.label} call`}
                          onClick={() => setEdit(occurrence)}
                        >
                          <Pencil size={15} />
                        </button>
                      </article>
                    );
                  })}
              </div>
            ))}
          </section>
          <aside className="allocation-summary">
            <p className="eyebrow">RESOURCE CHECK</p>
            <h2>
              A plan the wardrobe
              <br />
              can support.
            </h2>
            <p>
              Check exact units against overlap, availability windows, hard
              budget, preparation, and performer transitions.
            </p>
            <div className="allocation-metrics">
              <div>
                <span>Scheduled calls</span>
                <strong>{project.occurrences.length}</strong>
              </div>
              <div>
                <span>Physical units in inventory</span>
                <strong>{project.units.length}</strong>
              </div>
              <div>
                <span>Current allocations</span>
                <strong>
                  {
                    project.allocations.filter((a) => a.state === "allocated")
                      .length
                  }
                </strong>
              </div>
            </div>
            <Notice>
              Provisional availability and unobserved fitting remain evidence
              gaps even when a time-and-unit assignment is feasible.
            </Notice>
            <Link href={`/production/${project.id}/wardrobe`}>
              Review physical unit evidence
              <ArrowRight size={14} />
            </Link>
          </aside>
        </div>
      )}
      {result && (
        <AllocationReview result={result} focusRequest={focusResult} />
      )}
      {(mode === "live_performance" || project.transitions.length > 0) && (
        <section className="transition-section">
          <div className="section-title">
            <h2>Performer change transitions</h2>
            <Button onClick={() => setTransitionOpen(true)}>
              <Plus size={14} />
              Add transition
            </Button>
          </div>
          {project.transitions.map((transition) => (
            <div className="transition-row" key={transition.id}>
              <Route size={18} />
              <div>
                <strong>
                  {
                    project.performers.find(
                      (p) => p.id === transition.performerId,
                    )?.name
                  }
                </strong>
                <p>
                  {
                    project.occurrences.find(
                      (o) => o.id === transition.fromOccurrenceId,
                    )?.label
                  }{" "}
                  →{" "}
                  {
                    project.occurrences.find(
                      (o) => o.id === transition.toOccurrenceId,
                    )?.label
                  }
                </p>
                <small>{transition.note}</small>
              </div>
              <Badge
                tone={transition.evidence === "observed" ? "info" : "warning"}
              >
                {transition.minutes === null
                  ? "Duration unknown"
                  : `${transition.minutes} min · ${transition.evidence}`}
              </Badge>
            </div>
          ))}
        </section>
      )}
      {edit && (
        <OccurrenceDialog occurrence={edit} onClose={() => setEdit(null)} />
      )}
      <TransitionDialog
        open={transitionOpen}
        onClose={() => setTransitionOpen(false)}
      />
    </>
  );
}
