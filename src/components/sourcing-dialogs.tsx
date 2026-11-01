"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, FilePlus2 } from "lucide-react";
import type { SourcingRequest } from "@/lib/types";
import { dateTime, day, money, revision } from "@/lib/format";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import { useProduction } from "./production-context";
import { suggestedSourcingWindow } from "@/lib/sourcing-window";
import { displayFixtureText } from "@/lib/presentation-copy";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";

export function NewSourcingDialog(props: {
  open: boolean;
  onClose: () => void;
  initialUnitId?: string;
}) {
  return props.open ? <NewSourcingSession {...props} /> : null;
}
function NewSourcingSession({
  open,
  onClose,
  initialUnitId,
}: {
  open: boolean;
  onClose: () => void;
  initialUnitId?: string;
}) {
  const { project, send, busy, error, setError } = useProduction();
  const firstUnit =
    project.units.find((u) => u.id === initialUnitId) || project.units[0];
  const [supplier, setSupplier] = useState(firstUnit?.supplier || "");
  const [units, setUnits] = useState<string[]>(
    initialUnitId ? [initialUnitId] : [],
  );
  const planned = suggestedSourcingWindow(project, units);
  const [from, setFrom] = useState(
    planned ? toLocalDateTime(planned.from, project.timeZone) : "",
  );
  const [to, setTo] = useState(
    planned ? toLocalDateTime(planned.to, project.timeZone) : "",
  );
  const [note, setNote] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      const next = await send({
        type: "create_sourcing",
        unitIds: units,
        supplier,
        from: fromLocalDateTime(from, project.timeZone),
        to: fromLocalDateTime(to, project.timeZone),
        note,
      });
      if (next) onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The request could not be prepared.",
      );
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Sourcing request"
    >
      <form className="form-stack" onSubmit={create}>
        <Field label="Supplier">
          <select
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setUnits([]);
            }}
            required
          >
            <option value="">Choose a supplier</option>
            {[...new Set(project.units.map((u) => u.supplier))].map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="unit-choice">
          <legend>Units</legend>
          {project.units
            .filter((u) => u.supplier === supplier)
            .map((unit) => (
              <label className="checkbox-field" key={unit.id}>
                <input
                  type="checkbox"
                  checked={units.includes(unit.id)}
                  onChange={(e) =>
                    setUnits(
                      e.target.checked
                        ? [...units, unit.id]
                        : units.filter((id) => id !== unit.id),
                    )
                  }
                />
                <span>
                  <span className="mono">{unit.code}</span> {unit.name}
                  <small>
                    {money(unit.priceCents, project.currency)} · {unit.status}
                  </small>
                </span>
              </label>
            ))}
        </fieldset>
        <div className="field-grid">
          <Field label={`From (${project.timeZone})`}>
            <input
              type="datetime-local"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Through">
            <input
              type="datetime-local"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        {planned && (
          <div className="sourcing-window-hint">
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setFrom(toLocalDateTime(planned.from, project.timeZone));
                setTo(toLocalDateTime(planned.to, project.timeZone));
              }}
            >
              Use planned window
            </Button>
          </div>
        )}
        <Field label="Notes">
          <textarea
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Pickup point, dates, what to check"
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            busy={busy}
            disabled={!units.length}
          >
            Create draft
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const nextStates: Record<
  SourcingRequest["status"],
  SourcingRequest["status"][]
> = {
  draft: ["requested", "cancelled"],
  requested: ["held", "confirmed", "declined", "cancelled"],
  held: ["confirmed", "declined", "cancelled"],
  confirmed: ["received", "cancelled"],
  received: ["returned"],
  declined: ["requested", "cancelled"],
  returned: [],
  cancelled: [],
};
const labels: Record<SourcingRequest["status"], string> = {
  draft: "Draft",
  requested: "Requested",
  held: "Held",
  confirmed: "Confirmed",
  declined: "Declined",
  received: "Received",
  returned: "Returned",
  cancelled: "Cancelled",
};
export function SourcingDialog({
  request,
  onClose,
}: {
  request: SourcingRequest;
  onClose: () => void;
}) {
  const { project, send, busy, error } = useProduction();
  const [status, setStatus] = useState<SourcingRequest["status"]>(
    nextStates[request.status][0] || request.status,
  );
  const [operator, setOperator] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reference, setReference] = useState("");
  const [provenance, setProvenance] = useState<"synthetic" | "manual">(
    request.provenance,
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const next = await send({
      type: "update_sourcing",
      requestId: request.id,
      status,
      operator,
      evidence,
      externalReference: reference,
      provenance,
    });
    if (next) {
      setStatus(nextStates[status][0] || status);
      setEvidence("");
      setReference("");
    }
  }
  function download() {
    const lines = [
      `STAGECRAFT · ${project.title}`,
      `SOURCING ${request.status.toUpperCase()} · ${revision(request.sourceRevision)}`,
      `Provenance: ${request.provenance === "synthetic" ? "Example" : "MANUALLY RECORDED"}`,
      `Supplier: ${request.supplier}`,
      `Window: ${request.from} to ${request.to}`,
      ...request.unitIds.map((id) => {
        const unit = project.units.find((u) => u.id === id);
        return `${unit?.code}: ${unit?.name} · ${money(unit?.priceCents || 0, project.currency)}`;
      }),
      `Quote: ${money(request.quoteCents, project.currency)}`,
      `Quote valid through: ${request.quoteValidUntil}`,
      `Notes: ${displayFixtureText(request.note, project.fixture)}`,
      `Operator: ${request.operator || "Not recorded"}`,
      `Evidence: ${request.evidence || "No response recorded"}`,
      `External reference: ${request.externalReference || "None"}`,
      request.stale
        ? "SUPERSEDED SCOPE — RECHECK BEFORE USE"
        : "A request is not a supplier confirmation or physical receipt.",
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `stagecraft-sourcing-${request.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
      title={displayFixtureText(request.supplier, project.fixture)}
    >
      <div className="source-record">
        <section className="source-paper">
          <header>
            <span className="mono">Sourcing request</span>
          </header>
          <h3>{project.title}</h3>
          <div className="source-paper-window">
            <span>
              {day(request.from, project.timeZone)} —{" "}
              {day(request.to, project.timeZone)}
            </span>
            <strong>{money(request.quoteCents, project.currency)}</strong>
          </div>
          {request.unitIds.map((id) => {
            const unit = project.units.find((u) => u.id === id);
            return (
              <div className="source-paper-unit" key={id}>
                <Photo
                  natural
                  src={unit?.imageUrl}
                  alt={unit?.name || "Source garment"}
                />
                <div>
                  <span className="mono">{unit?.code}</span>
                  <h4>{unit?.name}</h4>
                  <p>{unit?.location}</p>
                </div>
              </div>
            );
          })}
          <div className="source-paper-notes">
            <strong>Notes</strong>
            <p>{displayFixtureText(request.note, project.fixture)}</p>
          </div>
          <footer>
            Quote valid through {day(request.quoteValidUntil, project.timeZone)}
          </footer>
        </section>
        <div className="source-response">
          <div className="section-title">
            <h3>Response</h3>
            <Badge tone={request.stale ? "danger" : "brass"}>
              {request.stale ? "Scope stale" : request.status}
            </Badge>
          </div>
          {request.evidence && (
            <div className="response-evidence">
              <p>{displayFixtureText(request.evidence, project.fixture)}</p>
              <span>
                {request.operator} ·{" "}
                {dateTime(request.updatedAt, project.timeZone)}
              </span>
              <small>Reference: {request.externalReference}</small>
            </div>
          )}
          {request.stale && (
            <Notice tone="warning">
              Production changed. Prepare a new request.
            </Notice>
          )}
          {nextStates[request.status].length > 0 ? (
            <form className="form-stack" onSubmit={save}>
              <Field label="Next stage">
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as SourcingRequest["status"])
                  }
                >
                  {nextStates[request.status].map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Operator">
                <input
                  required
                  minLength={2}
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  maxLength={100}
                />
              </Field>
              <Field label="Evidence">
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  required
                  minLength={5}
                  maxLength={2500}
                  placeholder={
                    request.provenance === "synthetic"
                      ? "What happened"
                      : "Response, date, source"
                  }
                />
              </Field>
              <Field label="Reference">
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                  maxLength={180}
                />
              </Field>
              <Field label="Source">
                <select
                  value={provenance}
                  disabled={request.provenance === "synthetic"}
                  onChange={(e) =>
                    setProvenance(e.target.value as "synthetic" | "manual")
                  }
                >
                  <option value="synthetic">Example</option>
                  <option value="manual">Real response</option>
                </select>
              </Field>
              {error && <Notice tone="danger">{error}</Notice>}
              <Button variant="primary" busy={busy} type="submit">
                Save stage
                <ArrowRight size={15} />
              </Button>
            </form>
          ) : (
            <Notice>Closed.</Notice>
          )}
          <Button onClick={download}>
            <Download size={15} />
            Download
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function CreatePackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { project, send, busy, error } = useProduction();
  const router = useRouter();
  const [title, setTitle] = useState("Costume & makeup call pack");
  const [ids, setIds] = useState(project.occurrences.map((o) => o.id));
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const next = await send({ type: "create_pack", occurrenceIds: ids, title });
    if (next) {
      onClose();
      const pack = next.packs.at(-1);
      if (pack) router.push(`/production/${project.id}/handoff/${pack.id}`);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="New crew pack"
    >
      <form className="form-stack" onSubmit={create}>
        <Field label="Pack title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
          />
        </Field>
        <fieldset className="scene-choice">
          <legend>Calls</legend>
          {project.occurrences.map((occurrence) => (
            <label className="checkbox-field" key={occurrence.id}>
              <input
                type="checkbox"
                checked={ids.includes(occurrence.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, occurrence.id]
                      : ids.filter((id) => id !== occurrence.id),
                  )
                }
              />
              <span>
                {occurrence.label}
                <small>
                  {dateTime(occurrence.start, project.timeZone)} ·{" "}
                  {occurrence.location}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <Notice tone="warning">
          Missing evidence marks this a working pack.
        </Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            busy={busy}
            disabled={!ids.length}
          >
            <FilePlus2 size={16} />
            Create pack
          </Button>
        </div>
      </form>
    </Modal>
  );
}
