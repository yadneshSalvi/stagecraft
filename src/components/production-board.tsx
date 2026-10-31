"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Expand,
  FileText,
  GitBranch,
  List,
  Minimize,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  getCurrentApproval,
  getCurrentPreview,
  getReadiness,
} from "@/lib/domain/selectors";
import { day, time, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { ChangeReview } from "./change-review";
import { ContinuityWall } from "./continuity-wall";
import { ProvenanceChip } from "./provenance-chip";
import { ExampleDecisions } from "./example-decisions";
import { LibraryDialog } from "./example-library";
import { Button, PageHeading, Photo } from "./ui";

export function ProductionBoard({
  initialUnitId,
  initialCharacterId,
  initialReplacementId,
}: {
  initialUnitId?: string;
  initialCharacterId?: string;
  initialReplacementId?: string;
}) {
  const { project } = useProduction();
  const [storyDay, setStoryDay] = useState<number | null>(null);
  const [list, setList] = useState(false);
  const [focus, setFocus] = useState(false);
  const [change, setChange] = useState(!!(initialUnitId || initialCharacterId));
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
  const cue =
    project.units.find((unit) => unit.id === "unit-coat-oxblood") ||
    project.units[0];
  if (!project.scenes.length && !project.characters.length)
    return (
      <>
        <PageHeading
          eyebrow="THE PRODUCTION / A BLANK PAGE"
          title={project.title}
        >
          Every working book begins with a story.
        </PageHeading>
        <div className="onboarding-composition">
          <div className="onboarding-script">
            <span className="mono">PRODUCTION NO. 001</span>
            <h2>
              A new world.
              <br />
              Your first cue.
            </h2>
            <p>
              Bring in a script you have permission to use. Review the scene
              breakdown, then connect the cast and wardrobe.
            </p>
            <Link href={`${base}/script`} className="button button-primary">
              <FileText size={17} />
              Import your script
              <ArrowRight size={16} />
            </Link>
            <Button variant="quiet" onClick={() => setLibrary(true)}>
              Explore the example cast & wardrobe
            </Button>
          </div>
          <div className="onboarding-steps">
            {[
              {
                n: "01",
                route: "script",
                title: "Start with the script",
                text: "Source-linked scene and costume cues, ready for your review.",
              },
              {
                n: "02",
                route: "looks",
                title: "Bring in the cast",
                text: "Private, permitted source photos for actor-specific previews.",
              },
              {
                n: "03",
                route: "wardrobe",
                title: "Open the wardrobe",
                text: "Exact physical units, measurements, and availability evidence.",
              },
            ].map((step) => (
              <Link key={step.n} href={`${base}/${step.route}`}>
                <span>{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
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
        eyebrow="THE PRODUCTION / WORKING BOOK"
        title={project.title}
        action={
          <>
            <Link className="button" href={`${base}/script`}>
              <FileText size={15} />
              The script
            </Link>
            <Button variant="primary" onClick={() => setChange(true)}>
              <GitBranch size={16} />
              Review a change
            </Button>
          </>
        }
      >
        {project.subtitle}
      </PageHeading>
      <div className="production-meta">
        <span>
          <Users size={14} />
          {project.characters.length} characters
        </span>
        <span>
          <FileText size={14} />
          {project.scenes.length} scenes
        </span>
        <span>{days.length} story days</span>
        <span className="meta-divider" />
        <span>
          {ready.appearanceApproved} of {ready.looksTotal} looks visually
          approved
        </span>
        {project.fixture && <ProvenanceChip kind="synthetic" />}
      </div>
      <div className="board-layout">
        <div className="board-main">
          <div className="board-toolbar">
            <div className="segmented" aria-label="Story day filter">
              <button
                className={storyDay === null ? "active" : ""}
                aria-pressed={storyDay === null}
                onClick={() => setStoryDay(null)}
              >
                The whole story
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
                      <span className="cast-image-kind">
                        {preview
                          ? preview.provenance === "recorded_provider"
                            ? "RECORDED YOUCAM"
                            : "YOUCAM PREVIEW"
                          : performer?.synthetic
                            ? "SYNTHETIC SOURCE"
                            : "SOURCE IMAGE"}
                      </span>
                      <span className="cast-open" aria-hidden="true">
                        <ArrowRight size={18} />
                      </span>
                    </div>
                    <div className="cast-caption">
                      <span className="mono">
                        0{index + 1} /{" "}
                        {absent
                          ? "OFF SCENE"
                          : look?.title || "DIRECTION TO COME"}
                      </span>
                      <h2>{character.name}</h2>
                      <p>{performer?.name || "Add a performer"}</p>
                      <span
                        className={`cast-approval ${approval ? "approved" : ""}`}
                      >
                        {approval ? (
                          <>
                            <Check size={12} />
                            Appearance approved
                          </>
                        ) : (
                          <>
                            <span className="status-dot" />
                            {preview
                              ? "Awaiting your review"
                              : "Preview needed"}
                          </>
                        )}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="board-caption">
            <span>
              <Sparkles size={13} />
              Independent actor previews, together in one board.
            </span>
            <span>Original sources stay inspectable.</span>
          </div>
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
          <ExampleDecisions />
          <section className="inspector-next">
            <p className="eyebrow">NEXT ON THE CALL SHEET</p>
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
                <h3>The next call is yours.</h3>
                <Link href={`${base}/schedule`}>
                  Add an occurrence
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </section>
          <section className="inspector-section">
            <p className="eyebrow">THE WORK BEFORE CURTAIN</p>
            <h3>
              {ready.ready ? "Evidence in place." : "A few details to settle."}
            </h3>
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
                  Appearance approvals
                  <small>
                    {ready.appearanceApproved} / {ready.looksTotal} current
                    looks
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
                    Makeup detail approvals
                    <small>
                      {ready.beautyApproved} / {ready.beautyTotal} configured
                      details
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
              )}
              <Link href={`${base}/wardrobe`}>
                <span className="check-dot" />
                <span>
                  Physical fitting
                  <small>{ready.pendingFittings} evidence gaps</small>
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
                    Hair & accessory approvals
                    <small>
                      {ready.detailsApproved || 0} / {ready.detailsTotal}{" "}
                      configured details
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
              )}

              <Link href={`${base}/handoff`}>
                <span className="check-dot" />
                <span>
                  Sourcing & crew
                  <small>
                    {ready.pendingSourcing} pending sourcing records
                  </small>
                </span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>
          {cue && (
            <section className="motif-note">
              <span className="eyebrow">A DETAIL THAT CARRIES THE STORY</span>
              <Photo src={cue.imageUrl} alt={cue.name} />
              <h3>{cue.name}</h3>
              <span className="mono">{cue.code} · ONE PHYSICAL UNIT</span>
              <p>
                {project.fixture
                  ? "From the arrival to the last bow. A recurring detail becomes a production dependency."
                  : "This item connects creative choices to the calls that need it."}
              </p>
              <Button variant="quiet" onClick={() => setChange(true)}>
                <GitBranch size={14} />
                Explore a change
                <ArrowRight size={14} />
              </Button>
            </section>
          )}
          <div className="inspector-proof">
            <ShieldCheck size={18} />
            <p>
              Visual approval confirms an appearance. Physical fit and supplier
              readiness need their own evidence.
            </p>
          </div>
        </aside>
      </div>
      <section className="production-activity">
        <div className="section-title">
          <h2>In the working book</h2>
          <span className="mono">{revision(project.revision)} · SAVED</span>
        </div>
        {project.events.length ? (
          project.events
            .slice(-4)
            .reverse()
            .map((event) => (
              <div className="activity-row" key={event.id}>
                <span className="activity-dot" />
                <p>{event.summary}</p>
                <span className="mono">{revision(event.revision)}</span>
              </div>
            ))
        ) : (
          <p className="muted">
            Your first decision will appear here with its revision and author.
          </p>
        )}
      </section>
      <ChangeReview
        open={change}
        onClose={() => setChange(false)}
        initialUnitId={initialUnitId}
        initialCharacterId={initialCharacterId}
        initialReplacementId={initialReplacementId}
      />
    </div>
  );
}
