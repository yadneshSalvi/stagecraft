"use client";
import Link from "next/link";
import { displayFixtureText } from "@/lib/presentation-copy";
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
} from "lucide-react";
import type { SourcingRequest } from "@/lib/types";
import { day, money } from "@/lib/format";
import { useProduction } from "./production-context";
import { Badge, Button, EmptyState, PageHeading } from "./ui";
import "./round3-wardrobe-handoff.css";
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
    <div className="r3-handoff">
      <PageHeading
        title="Handoff"
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
      />
      <div className="handoff-track">
        <div>
          <ClipboardList size={18} />
          <span>
            Requested<strong>{counts.requested}</strong>
          </span>
        </div>
        <ArrowRight size={16} />
        <div>
          <ReceiptText size={18} />
          <span>
            Confirmed<strong>{counts.confirmed}</strong>
          </span>
        </div>
        <ArrowRight size={16} />
        <div>
          <Package size={18} />
          <span>
            Received<strong>{counts.received}</strong>
          </span>
        </div>
      </div>
      <section className="sourcing-section">
        <div className="section-title">
          <h2>Sourcing</h2>
          {project.sourcing.length > 0 && (
            <Link
              className="button"
              href={`/production/${project.id}/handoff/orders`}
            >
              <ReceiptText size={15} />
              Export supplier orders
            </Link>
          )}
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
                  <Badge tone={tone(request)}>
                    {request.stale ? "Needs re-review" : request.status}
                  </Badge>
                </div>
                <h3>{displayFixtureText(request.supplier, project.fixture)}</h3>
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
                {request.provenance !== "synthetic" && request.operator && (
                  <p className="sourcing-operator">{request.operator}</p>
                )}
                <span className="document-action">
                  Open
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No sourcing requests"
            action={
              <Button onClick={() => setNewRequest(true)}>
                <Plus size={15} />
                Prepare the first request
              </Button>
            }
          />
        )}
      </section>
      <section className="packs-section">
        <div className="section-title">
          <h2>Crew packs</h2>
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
                </div>
                <div>
                  <div className="inline-badges">
                    <Badge
                      tone={
                        pack.state === "superseded"
                          ? "danger"
                          : pack.warnings.filter((warning) =>
                                displayFixtureText(warning, project.fixture),
                              ).length
                            ? "warning"
                            : "success"
                      }
                    >
                      {pack.state === "superseded"
                        ? "Superseded"
                        : pack.warnings.filter((warning) =>
                              displayFixtureText(warning, project.fixture),
                            ).length
                          ? "Evidence pending"
                          : "Current"}
                    </Badge>
                  </div>
                  <h3>{pack.title.replace(/^Working pack · /, "")}</h3>
                  <p>
                    {pack.occurrenceIds.length} calls ·{" "}
                    {day(pack.generatedAt, project.timeZone)}
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
              <h3>No crew packs</h3>
            </div>
          </div>
        )}
      </section>
      <NewSourcingDialog
        open={newRequest}
        onClose={() => setNewRequest(false)}
        initialUnitId={search.get("unit") || undefined}
      />
      {selected && (
        <SourcingDialog request={selected} onClose={() => setRequestId(null)} />
      )}
      <CreatePackDialog open={newPack} onClose={() => setNewPack(false)} />
    </div>
  );
}
