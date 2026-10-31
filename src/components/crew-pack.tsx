"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  MapPin,
  Printer,
  RefreshCcw,
} from "lucide-react";
import { getCurrentApproval, getCurrentPreview } from "@/lib/domain/selectors";
import { dateTime, day, time, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, Notice, Photo } from "./ui";
import { CrewBeautyEvidence } from "./crew-beauty-evidence";
import { CrewDetailEvidence } from "./crew-detail-evidence";

export function CrewPackView({ packId }: { packId: string }) {
  const { project, send, busy } = useProduction();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const pack = project.packs.find((p) => p.id === packId);
  if (!pack)
    return (
      <EmptyState
        title="This pack isn’t in this working book."
        action={
          <Link
            className="button button-primary"
            href={`/production/${project.id}/handoff`}
          >
            Return to Handoff
          </Link>
        }
      >
        It may belong to another private production or have been deleted.
      </EmptyState>
    );
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
          The handoff book
        </Link>
        <div>
          <Button onClick={() => void copy()}>
            <Copy size={14} />
            {copied ? "Private link copied" : "Copy private link"}
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={15} />
            Print / save PDF
          </Button>
        </div>
      </div>
      {pack.state === "superseded" && (
        <div className="pack-stale-banner no-print">
          <Notice tone="danger" title="This pack has been superseded.">
            A dependency changed after it was frozen. Review the current working
            book and generate a new pack before the call.
          </Notice>
          <Button onClick={() => void refreshPack()} busy={busy}>
            <RefreshCcw size={15} />
            Create a current pack
          </Button>
        </div>
      )}
      {(permissionMissing || facePermissionMissing) && (
        <Notice tone="warning">
          Source permission has been withdrawn for a performer. Images are
          hidden from this online pack. Previously downloaded copies cannot be
          recalled.
        </Notice>
      )}
      <article className="crew-document">
        <header className="crew-document-header">
          <div>
            <span className="paper-brand">STAGECRAFT</span>
            <p className="mono">COSTUME / HAIR / MAKEUP</p>
          </div>
          <div>
            <span className="mono">SOURCE {revision(pack.sourceRevision)}</span>
            <strong>
              {pack.state === "superseded"
                ? "SUPERSEDED COPY"
                : pack.warnings.length
                  ? "WORKING PACK — EVIDENCE PENDING"
                  : "CURRENT CREW PACK"}
            </strong>
          </div>
        </header>
        <div className="crew-title">
          <p className="eyebrow">{snapshot.title}</p>
          <h1>{pack.title.replace(/^Working pack · /, "")}</h1>
          <p>
            Frozen {dateTime(pack.generatedAt, zone)} · {zone} ·{" "}
            {pack.occurrenceIds.length} scheduled calls
          </p>
        </div>
        {pack.warnings.length > 0 && (
          <section className="crew-warnings">
            <h2>Before this can be called ready</h2>
            <p>
              These are unresolved requirements in this exact source revision.
            </p>
            <ul>
              {pack.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </section>
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
                          priority
                          src={
                            consent
                              ? preview?.imageUrl || performer?.imageUrl
                              : null
                          }
                          alt={`${character?.name || look.title}: ${preview ? "generated garment preview" : "source portrait"}`}
                        />
                        <figcaption>
                          {consent
                            ? preview
                              ? `${preview.provenance === "recorded_provider" ? "RECORDED " : ""}YOUCAM PREVIEW`
                              : "SOURCE — NOT AN APPROVED PREVIEW"
                            : "SOURCE PERMISSION WITHDRAWN"}
                        </figcaption>
                      </figure>
                      <div className="crew-look-details">
                        <p className="crew-print-context">
                          SC {scene?.number} · {day(occurrence.start, zone)} ·{" "}
                          {time(occurrence.start, zone)} · SOURCE{" "}
                          {revision(pack.sourceRevision)} ·{" "}
                          {pack.state === "superseded"
                            ? "SUPERSEDED COPY"
                            : pack.warnings.length
                              ? "WORKING PACK"
                              : "CURRENT CREW PACK"}
                        </p>
                        <div className="crew-look-heading">
                          <div>
                            <span className="mono">
                              {look.title.toUpperCase()} / RECIPE{" "}
                              {revision(look.revision)}
                            </span>
                            <h3>{character?.name || look.title}</h3>
                            <p>
                              {performer?.name}
                              {performer?.synthetic
                                ? " · synthetic adult performer"
                                : ""}
                            </p>
                          </div>
                          <Badge
                            tone={approval && consent ? "success" : "warning"}
                          >
                            {!consent
                              ? "Source permission withdrawn"
                              : approval
                                ? "Appearance approved"
                                : "Appearance not approved"}
                          </Badge>
                        </div>
                        {approval && (
                          <p className="crew-approval-line">
                            Approval at source revision by {approval.approvedBy}{" "}
                            · {approval.rationale}
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
                                    {unit.supplier}
                                  </p>
                                  <small>
                                    {fit
                                      ? "Physical fitting evidence recorded"
                                      : "Physical fitting requires evidence"}{" "}
                                    · {unit.condition}
                                  </small>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <dl className="crew-directions">
                          <div>
                            <dt>MAKEUP</dt>
                            <dd>
                              {look.makeup.notes ||
                                "Application notes not yet recorded."}
                            </dd>
                          </div>
                          <div>
                            <dt>HAIR</dt>
                            <dd>
                              {look.hair || "Hair direction not yet recorded."}
                            </dd>
                          </div>
                          <div>
                            <dt>ACCESSORIES</dt>
                            <dd>
                              {look.accessories ||
                                "No accessory direction recorded."}
                            </dd>
                          </div>
                          <div>
                            <dt>CONTINUITY</dt>
                            <dd>
                              {look.note || "No additional continuity note."}
                            </dd>
                          </div>
                        </dl>
                        <p className="crew-preparation">
                          <Clock3 size={13} />
                          {look.preparationMinutes === null
                            ? "Preparation time unknown"
                            : `${look.preparationMinutes} min preparation · ${look.preparationEvidence}`}
                          . Actual changeover time requires separate
                          observation.
                        </p>
                      </div>
                    </article>
                  );
                })}
                {!looks.length && (
                  <p className="crew-no-look">
                    No look is linked to this call. The working book needs a
                    costume decision.
                  </p>
                )}
              </section>
            );
          })}
        <footer className="crew-document-footer">
          <strong>
            {snapshot.title} / {revision(pack.sourceRevision)}
          </strong>
          <p>
            Generated appearance previews are not evidence of physical fit or
            exact garment reproduction. Rendered makeup is explicitly labelled;
            other makeup and hair notes remain application direction. A printed
            or saved copy is frozen and cannot update itself.
          </p>
          <span className="mono">
            FROZEN {new Date(pack.generatedAt).toISOString()} ·{" "}
            {pack.state === "superseded"
              ? "SUPERSEDED"
              : "CHECK ONLINE BEFORE USE"}
          </span>
        </footer>
      </article>
      <p className="pack-privacy-note no-print">
        This link opens only in the browser that owns the production. Print or
        save a PDF deliberately when handing the frozen pages to crew.
      </p>
    </div>
  );
}
