"use client";
import { useEffect, useRef, useState } from "react";
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
import type { Occurrence, Production, ProductionMode } from "@/lib/types";
import { getAllocationDecisionSummary } from "@/lib/domain/allocation-context";
import { day, time, money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, Notice, PageHeading } from "./ui";
import { AllocationReview } from "./allocation-review";
import { OccurrenceDialog, TransitionDialog } from "./schedule-dialogs";
import { ScheduleDraft } from "./schedule-draft";
import { ExampleDecisions } from "./example-decisions";

export function ScheduleWorkspace() {
  const { project, send, busy } = useProduction();
  const [edit, setEdit] = useState<Occurrence | "new" | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [focusResult, setFocusResult] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [recheckRevision, setRecheckRevision] = useState(0);
  const recheckedRevision = useRef(0);
  const decisions = getAllocationDecisionSummary(project);
  const firstMissingLook = decisions.missingLookIds[0];
  const reviewHref = `/production/${project.id}/looks${firstMissingLook ? `?look=${encodeURIComponent(firstMissingLook)}` : ""}`;
  const afterDecisions = (next: Production) =>
    setRecheckRevision(next.revision);
  useEffect(() => {
    if (
      !recheckRevision ||
      busy ||
      project.revision < recheckRevision ||
      recheckedRevision.current === recheckRevision
    )
      return;
    recheckedRevision.current = recheckRevision;
    void send({ type: "solve_allocation" }).then((next) => {
      if (next) setFocusResult((value) => value + 1);
    });
  }, [busy, project.revision, recheckRevision, send]);
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
      <div className="schedule-heading">
        <PageHeading
          title="Schedule"
          action={
            <>
              {project.scenes.some(
                (scene) =>
                  !project.occurrences.some(
                    (call) => call.sceneId === scene.id,
                  ),
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
                variant={result ? "default" : "primary"}
                busy={busy}
                onClick={async () => {
                  if (await send({ type: "solve_allocation" }))
                    setFocusResult((value) => value + 1);
                }}
              >
                <ShieldCheck size={16} />
                Check allocation
              </Button>
            </>
          }
        />
      </div>
      {result && (
        <AllocationReview
          result={result}
          focusRequest={focusResult}
          onDecisionsRecorded={afterDecisions}
        />
      )}
      {!result && decisions.missingLookIds.length > 0 && (
        <div className="schedule-approval-nudge">
          <span>
            {decisions.missingLookIds.length} looks need approval first.
          </span>
          <Link className="button" href={reviewHref}>
            Review looks
          </Link>
          <ExampleDecisions compact onRecorded={afterDecisions} />
        </div>
      )}
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
          {project.timeZone}
        </span>
        <span className="mono">
          Budget {money(project.budgetCents, project.currency)}
        </span>
      </div>
      {mode === "live_performance" && (
        <Notice tone="warning">
          Add change times between calls.{" "}
          <button
            className="inline-action"
            onClick={() => setTransitionOpen(true)}
          >
            Add transition →
          </button>
        </Notice>
      )}
      {!occurrences.length ? (
        <EmptyState
          title="No calls yet"
          action={
            <Button variant="primary" onClick={() => setEdit("new")}>
              <CalendarDays size={16} />
              Add a call
            </Button>
          }
        />
      ) : (
        <div className="schedule-layout">
          <section className="call-sheet">
            {dates.map((date) => (
              <div className="call-day" key={date}>
                <header>
                  <CalendarDays size={16} />
                  <h2>{date}</h2>
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
                              SC {scene?.number || "UNMAPPED"} · Day{" "}
                              {scene?.storyDay || "?"}
                            </span>
                            <Badge
                              tone={blocked?.length ? "danger" : "neutral"}
                            >
                              {blocked?.length ? "Conflict" : occurrence.kind}
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
            <h2>Allocation</h2>
            <div className="allocation-metrics">
              <div>
                <span>Calls</span>
                <strong>{project.occurrences.length}</strong>
              </div>
              <div>
                <span>Units</span>
                <strong>{project.units.length}</strong>
              </div>
              <div>
                <span>Allocated</span>
                <strong>
                  {
                    project.allocations.filter((a) => a.state === "allocated")
                      .length
                  }
                </strong>
              </div>
            </div>
            <Link href={`/production/${project.id}/wardrobe`}>
              Wardrobe
              <ArrowRight size={14} />
            </Link>
          </aside>
        </div>
      )}
      {(mode === "live_performance" || project.transitions.length > 0) && (
        <section className="transition-section">
          <div className="section-title">
            <h2>Change transitions</h2>
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
