"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Expand,
  FileText,
  GitBranch,
  List,
  Minimize,
  X,
} from "lucide-react";
import {
  getCurrentApproval,
  getCurrentPreview,
  getReadiness,
} from "@/lib/domain/selectors";
import { day, time } from "@/lib/format";
import { useProduction } from "./production-context";
import { ChangeReview } from "./change-review";
import { ContinuityWall } from "./continuity-wall";
import { LibraryDialog } from "./example-library";
import { Button, PageHeading, Photo } from "./ui";

export function ProductionBoard({
  initialUnitId,
  initialCharacterId,
  initialReplacementId,
  refreshImpactOnOpen = false,
}: {
  initialUnitId?: string;
  initialCharacterId?: string;
  initialReplacementId?: string;
  refreshImpactOnOpen?: boolean;
}) {
  const { project } = useProduction();
  const router = useRouter();
  const consumedReturn = useRef(false);
  const [intent, setIntent] = useState({
    initialUnitId,
    initialCharacterId,
    initialReplacementId,
  });
  const [storyDay, setStoryDay] = useState<number | null>(null);
  const [list, setList] = useState(false);
  const [focus, setFocus] = useState(false);
  const [change, setChange] = useState(!!(initialUnitId || initialCharacterId));
  const [resumeImpact, setResumeImpact] = useState(refreshImpactOnOpen);
  const [library, setLibrary] = useState(false);
  const ready = getReadiness(project);
  const days = [...new Set(project.scenes.map((scene) => scene.storyDay))].sort(
    (a, b) => a - b,
  );
  const scenes = project.scenes.filter(
    (scene) => storyDay === null || scene.storyDay === storyDay,
  );
  const nextCall = [...project.occurrences].sort((a, b) =>
    a.start.localeCompare(b.start),
  )[0];
  const nextScene = project.scenes.find(
    (scene) => scene.id === nextCall?.sceneId,
  );
  const base = `/production/${project.id}`;
  useEffect(() => {
    if (
      consumedReturn.current ||
      (!initialUnitId && !initialCharacterId && !refreshImpactOnOpen) ||
      window.location.pathname !== base
    )
      return;
    const params = new URLSearchParams(window.location.search);
    const keys = ["impact", "change", "recast", "performer"];
    if (!keys.some((key) => params.has(key))) return;
    // A consumed return must not replace a later sidebar navigation.
    consumedReturn.current = true;
    for (const key of keys) params.delete(key);
    const query = params.toString();
    router.replace(
      `${base}${query ? `?${query}` : ""}${window.location.hash}`,
      { scroll: false },
    );
  }, [base, initialUnitId, initialCharacterId, refreshImpactOnOpen, router]);
  if (!project.scenes.length && !project.characters.length)
    return (
      <>
        <PageHeading title={project.title} />
        <div className="onboarding-composition">
          <div className="onboarding-script">
            <Link href={`${base}/script`} className="button button-primary">
              <FileText size={17} />
              Import your script
              <ArrowRight size={16} />
            </Link>
            <Button variant="quiet" onClick={() => setLibrary(true)}>
              Example cast & wardrobe
            </Button>
          </div>
          <div className="onboarding-steps">
            {[
              {
                n: "01",
                route: "script",
                title: "Start with the script",
              },
              {
                n: "02",
                route: "looks",
                title: "Bring in the cast",
              },
              {
                n: "03",
                route: "wardrobe",
                title: "Open the wardrobe",
              },
            ].map((step) => (
              <Link key={step.n} href={`${base}/${step.route}`}>
                <span>{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                </div>
                <ArrowRight size={19} />
              </Link>
            ))}
          </div>
        </div>
        <LibraryDialog open={library} onClose={() => setLibrary(false)} />
      </>
    );
  return (
    <div
      className={
        focus ? "production-board presentation-mode" : "production-board"
      }
    >
      {focus && (
        <Button className="exit-presentation" onClick={() => setFocus(false)}>
          <X size={16} />
          Exit presentation
        </Button>
      )}
      <PageHeading
        title={project.title}
        action={
          <>
            <Link className="button" href={`${base}/script`}>
              <FileText size={15} />
              The script
            </Link>
            <Button
              variant="primary"
              onClick={() => {
                setIntent({
                  initialUnitId: undefined,
                  initialCharacterId: undefined,
                  initialReplacementId: undefined,
                });
                setResumeImpact(false);
                setChange(true);
              }}
            >
              <GitBranch size={16} />
              Review a change
            </Button>
          </>
        }
      />
      <div className="board-layout">
        <div className="board-main">
          <div className="board-toolbar">
            <div className="segmented" aria-label="Story day filter">
              <button
                className={storyDay === null ? "active" : ""}
                aria-pressed={storyDay === null}
                onClick={() => setStoryDay(null)}
              >
                All days
              </button>
              {days.map((day) => (
                <button
                  key={day}
                  className={storyDay === day ? "active" : ""}
                  aria-pressed={storyDay === day}
                  onClick={() => setStoryDay(day)}
                >
                  Day {day}
                </button>
              ))}
            </div>
            <div className="board-tools">
              <button
                className="icon-button"
                aria-label={
                  list ? "Show visual board" : "Show accessible scene list"
                }
                aria-pressed={list}
                onClick={() => setList(!list)}
              >
                <List size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={
                  focus ? "Exit presentation mode" : "Enter presentation mode"
                }
                onClick={() => setFocus(!focus)}
              >
                {focus ? <Minimize size={17} /> : <Expand size={17} />}
              </button>
            </div>
          </div>
          {list ? (
            <div className="scene-list-board">
              <table>
                <thead>
                  <tr>
                    <th>Scene / story time</th>
                    <th>Character looks</th>
                    <th>Review</th>
                    <th>
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((scene) => (
                    <tr key={scene.id}>
                      <td>
                        <span className="mono">
                          SC {scene.number} · DAY {scene.storyDay}
                        </span>
                        <strong>{scene.title}</strong>
                      </td>
                      <td>
                        {scene.characterIds
                          .map(
                            (id) =>
                              project.characters.find((c) => c.id === id)?.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </td>
                      <td>
                        {scene.reviewed
                          ? "Breakdown reviewed"
                          : "Review script cues"}
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          href={`${base}/script?scene=${scene.id}`}
                          aria-label={`Review scene ${scene.number}`}
                        >
                          <ArrowRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : storyDay === null ? (
            <ContinuityWall project={project} />
          ) : (
            <div className="cast-stage">
              {project.characters.map((character, index) => {
                const looks = project.looks.filter(
                  (look) => look.characterId === character.id,
                );
                const look =
                  looks.find(
                    (look) =>
                      storyDay === null || look.storyDays.includes(storyDay),
                  ) || looks[0];
                const performer = project.performers.find(
                  (p) => p.id === (look?.performerId || character.performerId),
                );
                const preview = look && getCurrentPreview(look, project);
                const approval = look && getCurrentApproval(look, project);
                const absent =
                  storyDay !== null &&
                  !scenes.some((s) => s.characterIds.includes(character.id));
                return (
                  <Link
                    key={character.id}
                    href={`${base}/looks${look ? `?look=${look.id}` : ""}`}
                    className={`cast-column ${index === 0 ? "cast-lead" : ""} ${absent ? "cast-absent" : ""}`}
                  >
                    <div className="cast-image-frame">
                      <Photo
                        src={preview?.imageUrl || performer?.imageUrl}
                        alt={`${character.name}, played by ${performer?.name || "unassigned performer"}. ${preview ? "YouCam generated garment preview" : "Source photograph"}`}
                        priority={index < 3}
                      />
                      <span className="cast-open" aria-hidden="true">
                        <ArrowRight size={18} />
                      </span>
                    </div>
                    <div className="cast-caption">
                      {absent && <span className="muted">Off scene</span>}
                      <h2>{character.name}</h2>
                      <p>{performer?.name || "Add a performer"}</p>
                      <span
                        className={`cast-approval ${approval ? "approved" : ""}`}
                      >
                        {approval ? (
                          <>
                            <Check size={12} />
                            Approved
                          </>
                        ) : (
                          <>
                            <span className="status-dot" />
                            {preview ? "To review" : "No preview"}
                          </>
                        )}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <section className="call-track">
            <div>
              <CalendarDays size={18} />
              <span className="eyebrow">
                {project.mode === "film" ? "SHOOT ORDER" : "RUN OF SHOW"}
              </span>
            </div>
            {[...project.occurrences]
              .sort((a, b) => a.order - b.order)
              .map((occurrence) => (
                <Link key={occurrence.id} href={`${base}/schedule`}>
                  <span className="mono">
                    {time(occurrence.start, project.timeZone)}
                  </span>
                  <strong>
                    SC{" "}
                    {project.scenes.find((s) => s.id === occurrence.sceneId)
                      ?.number || "?"}
                  </strong>
                  <span>{day(occurrence.start, project.timeZone)}</span>
                </Link>
              ))}
          </section>
        </div>
        <aside className="board-inspector">
          <section className="inspector-next">
            <h3>Next call</h3>
            {nextCall ? (
              <>
                <span className="next-date">
                  {day(nextCall.start, project.timeZone)}
                </span>
                <h3>{nextScene?.title || nextCall.label}</h3>
                <p>
                  <span className="mono">
                    {time(nextCall.start, project.timeZone)}
                  </span>{" "}
                  · {nextCall.location}
                </p>
                <Link href={`${base}/schedule`}>
                  Open schedule
                  <ArrowRight size={14} />
                </Link>
              </>
            ) : (
              <>
                <h3>No calls yet</h3>
                <Link href={`${base}/schedule`}>
                  Add a call
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </section>
          <section className="inspector-section">
            <h3>Readiness</h3>
            <div className="readiness-list">
              <Link href={`${base}/looks`}>
                <span
                  className={
                    ready.appearanceApproved === ready.looksTotal
                      ? "check-dot complete"
                      : "check-dot"
                  }
                />
                <span>
                  Looks{" "}
                  <small>
                    {ready.appearanceApproved}/{ready.looksTotal}
                  </small>
                </span>
                <ArrowRight size={14} />
              </Link>
              {ready.beautyTotal > 0 && (
                <Link
                  href={`${base}/looks?look=${project.looks.find((look) => look.beauty)?.id || ""}&detail=makeup`}
                >
                  <span
                    className={
                      ready.beautyApproved === ready.beautyTotal
                        ? "check-dot complete"
                        : "check-dot"
                    }
                  />
                  <span>
                    Makeup{" "}
                    <small>
                      {ready.beautyApproved}/{ready.beautyTotal}
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
              )}
              <Link href={`${base}/wardrobe`}>
                <span
                  className={`check-dot ${ready.pendingFittings === 0 ? "complete" : ""}`}
                />
                <span>
                  Fittings
                  <small>{ready.pendingFittings} open</small>
                </span>
                <ArrowRight size={14} />
              </Link>
              {(ready.detailsTotal || 0) > 0 && (
                <Link
                  href={`${base}/looks?look=${project.looks.find((look) => look.details?.length)?.id || ""}&detail=${project.looks.find((look) => look.details?.length)?.details?.[0]?.kind || "hair_color"}`}
                >
                  <span
                    className={
                      ready.detailsApproved === ready.detailsTotal
                        ? "check-dot complete"
                        : "check-dot"
                    }
                  />
                  <span>
                    Hair & necklace{" "}
                    <small>
                      {ready.detailsApproved || 0}/{ready.detailsTotal}
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
              )}

              <Link href={`${base}/handoff`}>
                <span
                  className={`check-dot ${ready.pendingSourcing === 0 ? "complete" : ""}`}
                />
                <span>
                  Sourcing
                  <small>{ready.pendingSourcing} pending</small>
                </span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        </aside>
      </div>
      <details className="production-activity">
        <summary>Recent changes</summary>
        {project.events.length ? (
          project.events
            .slice(-4)
            .reverse()
            .map((event) => (
              <div className="activity-row" key={event.id}>
                <span className="activity-dot" />
                <p>{event.summary}</p>
              </div>
            ))
        ) : (
          <p className="muted">No decisions yet.</p>
        )}
      </details>
      <ChangeReview
        open={change}
        onClose={() => {
          setChange(false);
          setResumeImpact(false);
          setIntent({
            initialUnitId: undefined,
            initialCharacterId: undefined,
            initialReplacementId: undefined,
          });
        }}
        initialUnitId={intent.initialUnitId}
        initialCharacterId={intent.initialCharacterId}
        initialReplacementId={intent.initialReplacementId}
        refreshImpactOnOpen={resumeImpact}
      />
    </div>
  );
}
