"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  MapPin,
  Printer,
  RefreshCcw,
} from "lucide-react";
import { getCurrentApproval, getCurrentPreview } from "@/lib/domain/selectors";
import { dateTime, day, time, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { displayApproval, displayFixtureText } from "@/lib/presentation-copy";
import { Badge, Button, EmptyState, Notice, Photo } from "./ui";
import { CrewBeautyEvidence } from "./crew-beauty-evidence";
import { CrewDetailEvidence } from "./crew-detail-evidence";
import "./round3-wardrobe-handoff.css";

export function CrewPackView({ packId }: { packId: string }) {
  const { project, send, busy } = useProduction();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const pack = project.packs.find((p) => p.id === packId);
  if (!pack)
    return (
      <EmptyState
        title="Pack not found"
        action={
          <Link
            className="button button-primary"
            href={`/production/${project.id}/handoff`}
          >
            Return to Handoff
          </Link>
        }
      />
    );
  const warnings = pack.warnings
    .map((warning) => displayFixtureText(warning, project.fixture))
    .filter(Boolean);
  const snapshot = pack.snapshot;
  const frozenProject = {
    ...project,
    ...snapshot,
    ...snapshot.appearanceContext,
    appearanceCandidates: snapshot.appearanceCandidates || [],
    detailReferences: snapshot.detailReferences || [],
    revision: pack.sourceRevision,
  };
  const zone = snapshot.timeZone || project.timeZone;
  const characters = snapshot.characters || project.characters;
  const permissionMissing = snapshot.performers.some(
    (p) =>
      !project.performers.find((current) => current.id === p.id)?.consent
        .granted,
  );
  const facePermissionMissing = snapshot.performers.some(
    (person) =>
      person.faceCapture?.consent.granted &&
      !project.performers.find((current) => current.id === person.id)
        ?.faceCapture?.consent.granted,
  );
  async function refreshPack() {
    const next = await send({
      type: "create_pack",
      title: pack!.title.replace(/^Working pack · /, ""),
      occurrenceIds: pack!.occurrenceIds,
    });
    if (next?.packs.at(-1))
      router.push(`/production/${project.id}/handoff/${next.packs.at(-1)!.id}`);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="crew-pack-page">
      <div className="pack-toolbar no-print">
        <Link href={`/production/${project.id}/handoff`}>
          <ArrowLeft size={15} />
          Handoff
        </Link>
        <div>
          <Button onClick={() => void copy()}>
            <Copy size={14} />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={15} />
            Print / save PDF
          </Button>
        </div>
      </div>
      {pack.state === "superseded" && (
        <div className="pack-stale-banner no-print">
          <Notice tone="danger">Superseded</Notice>
          <Button onClick={() => void refreshPack()} busy={busy}>
            <RefreshCcw size={15} />
            Create a current pack
          </Button>
        </div>
      )}
      {(permissionMissing || facePermissionMissing) && (
        <Notice tone="warning">
          Permission withdrawn; some images hidden.
        </Notice>
      )}
      <article className="crew-document">
        <header className="crew-document-header">
          <div>
            <span className="paper-brand">STAGECRAFT</span>
          </div>
          <div>
            <strong>
              {pack.state === "superseded"
                ? "Superseded"
                : warnings.length
                  ? "Evidence pending"
                  : "Current"}
            </strong>
          </div>
        </header>
        <div className="crew-title">
          <h1>{pack.title.replace(/^Working pack · /, "")}</h1>
          <p>
            Frozen {dateTime(pack.generatedAt, zone)} · {zone} ·{" "}
            {pack.occurrenceIds.length} calls
          </p>
        </div>
        {warnings.length > 0 && (
          <CrewReadiness key={pack.id} warnings={warnings} />
        )}
        {[...snapshot.occurrences]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((occurrence) => {
            const scene = snapshot.scenes.find(
              (s) => s.id === occurrence.sceneId,
            );
            const looks = snapshot.looks.filter((l) =>
              l.sceneIds.includes(occurrence.sceneId),
            );
            return (
              <section className="crew-call" key={occurrence.id}>
                <header>
                  <div>
                    <span className="mono">
                      SCENE {scene?.number} /{" "}
                      {scene?.storyDaySource === "unspecified"
                        ? "PROVISIONAL STORY DAY"
                        : "STORY DAY"}{" "}
                      {scene?.storyDay}
                    </span>
                    <h2>{scene?.title || occurrence.label}</h2>
                  </div>
                  <div>
                    <strong>
                      {day(occurrence.start, zone)} ·{" "}
                      {time(occurrence.start, zone)}
                    </strong>
                    <span>
                      <MapPin size={13} />
                      {occurrence.location}
                    </span>
                    <small>Until {time(occurrence.end, zone)}</small>
                  </div>
                </header>
                {looks.map((look) => {
                  const performer = snapshot.performers.find(
                    (p) => p.id === look.performerId,
                  );
                  const character = characters.find(
                    (c) => c.id === look.characterId,
                  );
                  const preview = getCurrentPreview(look, frozenProject);
                  const approval = getCurrentApproval(look, frozenProject);
                  const units = snapshot.units.filter((u) =>
                    look.unitIds.includes(u.id),
                  );
                  const consent = project.performers.find(
                    (p) => p.id === look.performerId,
                  )?.consent.granted;
                  return (
                    <article className="crew-look" key={look.id}>
                      <figure>
                        <Photo
                          natural
                          priority
                          src={
                            consent
                              ? preview?.imageUrl || performer?.imageUrl
                              : null
                          }
                          alt={`${character?.name || look.title}: ${preview ? "generated garment preview" : "source portrait"}`}
                        />
                        {(!consent || !preview) && (
                          <figcaption>
                            {consent
                              ? "Source — not approved"
                              : "Permission withdrawn"}
                          </figcaption>
                        )}
                      </figure>
                      <div className="crew-look-details">
                        <p className="crew-print-context">
                          SC {scene?.number} · {day(occurrence.start, zone)} ·{" "}
                          {time(occurrence.start, zone)}
                        </p>
                        <div className="crew-look-heading">
                          <div>
                            <span className="mono">{look.title}</span>
                            <h3>{character?.name || look.title}</h3>
                            <p>{performer?.name}</p>
                          </div>
                          <Badge
                            tone={approval && consent ? "success" : "warning"}
                          >
                            {!consent
                              ? "Permission withdrawn"
                              : approval
                                ? "Approved"
                                : "Not approved"}
                          </Badge>
                        </div>
                        {approval && (
                          <p className="crew-approval-line">
                            {displayApproval(approval).approvedBy} ·{" "}
                            {displayApproval(approval).rationale}
                          </p>
                        )}
                        <CrewBeautyEvidence
                          look={look}
                          currentPerformer={project.performers.find(
                            (person) => person.id === look.performerId,
                          )}
                        />
                        <CrewDetailEvidence
                          look={look}
                          currentPerformer={project.performers.find(
                            (person) => person.id === look.performerId,
                          )}
                          frozenProject={frozenProject}
                        />
                        <div className="crew-units">
                          {units.map((unit) => {
                            const allocated = snapshot.allocations?.some(
                              (a) =>
                                a.occurrenceId === occurrence.id &&
                                a.unitId === unit.id &&
                                a.state === "allocated",
                            );
                            const fit =
                              unit.fitting.performerId === look.performerId &&
                              unit.fitting.status === "confirmed" &&
                              ["manual", "observed"].includes(
                                unit.fitting.provenance,
                              ) &&
                              !!unit.fitting.evidence.trim();
                            return (
                              <div key={unit.id}>
                                <span
                                  className="paper-check"
                                  aria-label={
                                    allocated
                                      ? "Allocated"
                                      : "Allocation not current"
                                  }
                                >
                                  {allocated && <Check size={11} />}
                                </span>
                                <div>
                                  <strong>
                                    {unit.code} · {unit.name}
                                  </strong>
                                  <p>
                                    Collect from {unit.location} ·{" "}
                                    {displayFixtureText(
                                      unit.supplier,
                                      project.fixture,
                                    )}
                                  </p>
                                  <small>
                                    {fit ? "Fitted" : "Fitting needed"} ·{" "}
                                    {displayFixtureText(
                                      unit.condition,
                                      project.fixture,
                                    )}
                                  </small>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <dl className="crew-directions">
                          <div>
                            <dt>MAKEUP</dt>
                            <dd>{look.makeup.notes || "—"}</dd>
                          </div>
                          <div>
                            <dt>HAIR</dt>
                            <dd>{look.hair || "—"}</dd>
                          </div>
                          <div>
                            <dt>ACCESSORIES</dt>
                            <dd>{look.accessories || "—"}</dd>
                          </div>
                          <div>
                            <dt>CONTINUITY</dt>
                            <dd>
                              {displayFixtureText(look.note, project.fixture) ||
                                "—"}
                            </dd>
                          </div>
                        </dl>
                        <p className="crew-preparation">
                          <Clock3 size={13} />
                          {look.preparationMinutes === null
                            ? "Preparation time unknown"
                            : `${look.preparationMinutes} min prep (${look.preparationEvidence})`}
                        </p>
                      </div>
                    </article>
                  );
                })}
                {!looks.length && (
                  <p className="crew-no-look">No look for this call.</p>
                )}
              </section>
            );
          })}
        <footer className="crew-document-footer">
          <strong>
            {snapshot.title} / {revision(pack.sourceRevision)}
          </strong>
          <span className="mono">
            FROZEN {dateTime(pack.generatedAt, zone)} ·{" "}
            {pack.state === "superseded"
              ? "SUPERSEDED"
              : "CHECK ONLINE BEFORE USE"}
          </span>
        </footer>
      </article>
      <p className="pack-privacy-note no-print">
        Link works only in this browser.
      </p>
    </div>
  );
}

function CrewReadiness({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return (
    <section
      className="crew-warnings"
      aria-label="Unresolved crew requirements"
    >
      <div className="crew-warnings-summary">
        <div>
          <h2>Readiness</h2>
          <p>
            {warnings.length} open {warnings.length === 1 ? "item" : "items"}
          </p>
        </div>
        <button
          type="button"
          className="crew-warnings-toggle no-print"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide requirements" : "Show requirements"}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="crew-warnings-details" id={detailsId} hidden={!expanded}>
        <ul>
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
