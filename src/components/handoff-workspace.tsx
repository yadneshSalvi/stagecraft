"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  FilePlus2,
  Package,
  Plus,
  ReceiptText,
  Truck,
} from "lucide-react";
import type { SourcingRequest } from "@/lib/types";
import { day, money, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, PageHeading } from "./ui";
import {
  NewSourcingDialog,
  SourcingDialog,
  CreatePackDialog,
} from "./sourcing-dialogs";

export function HandoffWorkspace() {
  const { project } = useProduction();
  const search = useSearchParams();
  const [newRequest, setNewRequest] = useState(!!search.get("unit"));
  const [requestId, setRequestId] = useState<string | null>(null);
  const [newPack, setNewPack] = useState(false);
  const selected = project.sourcing.find((r) => r.id === requestId);
  const counts = {
    requested: project.sourcing.filter((r) =>
      ["requested", "held"].includes(r.status),
    ).length,
    confirmed: project.sourcing.filter(
      (r) => r.status === "confirmed" && !r.stale,
    ).length,
    received: project.sourcing.filter(
      (r) => r.status === "received" && !r.stale,
    ).length,
  };
  const tone = (request: SourcingRequest) =>
    request.stale
      ? "danger"
      : ["received", "returned"].includes(request.status)
        ? "success"
        : request.status === "confirmed"
          ? "info"
          : "warning";
  return (
    <>
      <PageHeading
        eyebrow="THE HANDOFF / FROM INTENT TO PREPARATION"
        title="Make the next call a clear one."
        action={
          <>
            <Button onClick={() => setNewRequest(true)}>
              <Plus size={15} />
              Prepare sourcing request
            </Button>
            <Button variant="primary" onClick={() => setNewPack(true)}>
              <FilePlus2 size={16} />
              Create a crew pack
            </Button>
          </>
        }
      >
        A request, a supplier confirmation, and a physical receipt are different
        moments. Record each one.
      </PageHeading>
      <div className="handoff-track">
        <div>
          <ClipboardList size={18} />
          <span>
            Requested / held<strong>{counts.requested}</strong>
          </span>
        </div>
        <ArrowRight size={16} />
        <div>
          <ReceiptText size={18} />
          <span>
            Confirmed reservations<strong>{counts.confirmed}</strong>
          </span>
        </div>
        <ArrowRight size={16} />
        <div>
          <Package size={18} />
          <span>
            Physically received<strong>{counts.received}</strong>
          </span>
        </div>
        <p>Local records carry their own evidence and provenance.</p>
      </div>
      <section className="sourcing-section">
        <div className="section-title">
          <h2>The sourcing book</h2>
          <span className="muted">
            Manual response workflow · no live supplier integration
          </span>
        </div>
        {project.sourcing.length ? (
          <div className="sourcing-grid">
            {project.sourcing.map((request) => (
              <button
                className={`sourcing-document ${request.stale ? "stale-document" : ""}`}
                key={request.id}
                onClick={() => setRequestId(request.id)}
              >
                <div className="sourcing-doc-head">
                  <span className="mono">
                    SOURCING / {revision(request.sourceRevision)}
                  </span>
                  <Badge tone={tone(request)}>
                    {request.stale ? "Needs renewed review" : request.status}
                  </Badge>
                </div>
                <h3>{request.supplier}</h3>
                <div className="sourcing-units">
                  {request.unitIds.map((id) => {
                    const unit = project.units.find((u) => u.id === id);
                    return (
                      <p key={id}>
                        <span className="mono">{unit?.code || "UNIT"}</span>
                        {unit?.name || id}
                      </p>
                    );
                  })}
                </div>
                <div className="sourcing-doc-facts">
                  <span>
                    {day(request.from, project.timeZone)} —{" "}
                    {day(request.to, project.timeZone)}
                  </span>
                  <strong>{money(request.quoteCents, project.currency)}</strong>
                </div>
                <p className="sourcing-provenance">
                  {request.provenance === "synthetic"
                    ? "Synthetic exercise · no supplier transaction"
                    : `Manual record${request.operator ? ` · ${request.operator}` : ""}`}
                </p>
                <span className="document-action">
                  Open the record
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="From a selected garment to an obtainable one."
            action={
              <Button onClick={() => setNewRequest(true)}>
                <Plus size={15} />
                Prepare the first request
              </Button>
            }
          >
            Create a request using exact unit IDs and date windows. Record a
            real response with its source, or label a rehearsal as synthetic.
          </EmptyState>
        )}
      </section>
      <section className="packs-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">FROZEN AT A KNOWN REVISION</p>
            <h2>The crew’s working pages</h2>
          </div>
          <Button onClick={() => setNewPack(true)}>
            <BookOpen size={15} />
            Create crew pack
          </Button>
        </div>
        {project.packs.length ? (
          <div className="pack-list">
            {[...project.packs].reverse().map((pack) => (
              <Link
                href={`/production/${project.id}/handoff/${pack.id}`}
                className="pack-row"
                key={pack.id}
              >
                <div className="pack-paper-icon">
                  <BookOpen size={24} />
                  <span className="mono">{revision(pack.sourceRevision)}</span>
                </div>
                <div>
                  <div className="inline-badges">
                    <Badge
                      tone={
                        pack.state === "superseded"
                          ? "danger"
                          : pack.warnings.length
                            ? "warning"
                            : "success"
                      }
                    >
                      {pack.state === "superseded"
                        ? "Superseded"
                        : pack.warnings.length
                          ? "Working pack · evidence pending"
                          : "Current pack"}
                    </Badge>
                  </div>
                  <h3>{pack.title}</h3>
                  <p>
                    {pack.occurrenceIds.length} scheduled calls · Created{" "}
                    {day(pack.generatedAt, project.timeZone)} · Source{" "}
                    {revision(pack.sourceRevision)}
                  </p>
                </div>
                <ArrowRight size={19} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="pack-empty">
            <BookOpen size={30} />
            <div>
              <h3>A clear page for every call.</h3>
              <p>
                Freeze the approved look, exact unit references, preparation
                notes, and outstanding evidence into a mobile and printable crew
                pack.
              </p>
            </div>
          </div>
        )}
      </section>
      <div className="handoff-note">
        <Truck size={20} />
        <p>
          Receipt and return have their own events. A source request never
          becomes a physical outcome just because it was prepared here.
        </p>
      </div>
      <NewSourcingDialog
        open={newRequest}
        onClose={() => setNewRequest(false)}
        initialUnitId={search.get("unit") || undefined}
      />
      {selected && (
        <SourcingDialog request={selected} onClose={() => setRequestId(null)} />
      )}
      <CreatePackDialog open={newPack} onClose={() => setNewPack(false)} />
    </>
  );
}
