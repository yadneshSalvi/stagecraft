"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, FilePlus2 } from "lucide-react";
import type { SourcingRequest } from "@/lib/types";
import { dateTime, day, money, revision } from "@/lib/format";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import { useProduction } from "./production-context";
import { suggestedSourcingWindow } from "@/lib/sourcing-window";
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
      title="Prepare a sourcing request"
      description="A local draft for exact units and dates. No message is sent to a supplier automatically."
    >
      <form className="form-stack" onSubmit={create}>
        <Field label="Recorded supplier / custodian">
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
          <legend>Physical units requested</legend>
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
            <p className="muted">
              The suggested window includes recorded preparation and allocated
              use. Add pickup or transport time with the custodian.
            </p>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setFrom(toLocalDateTime(planned.from, project.timeZone));
                setTo(toLocalDateTime(planned.to, project.timeZone));
              }}
            >
              Use current planned window
            </Button>
          </div>
        )}
        <Field label="Pickup, return, measurement, and preparation notes">
          <textarea
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Record the handoff location, exact date window, and what the custodian must verify."
          />
        </Field>
        <Notice tone={project.fixture ? "warning" : "info"}>
          {project.fixture
            ? "This fictional production creates a synthetic sourcing exercise. Its status cannot become a real supplier outcome."
            : "When a supplier responds, record the named operator, response evidence, and external reference. A request is not a reservation."}
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
            disabled={!units.length}
          >
            Create request draft
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
  requested: "Request sent / recorded externally",
  held: "Supplier hold",
  confirmed: "Supplier confirmed reservation",
  declined: "Supplier declined",
  received: "Physical receipt",
  returned: "Physical return",
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
      `Provenance: ${request.provenance === "synthetic" ? "SYNTHETIC EXERCISE — NO REAL TRANSACTION" : "MANUALLY RECORDED"}`,
      `Supplier: ${request.supplier}`,
      `Window: ${request.from} to ${request.to}`,
      ...request.unitIds.map((id) => {
        const unit = project.units.find((u) => u.id === id);
        return `${unit?.code}: ${unit?.name} · ${money(unit?.priceCents || 0, project.currency)}`;
      }),
      `Quote: ${money(request.quoteCents, project.currency)}`,
      `Quote valid through: ${request.quoteValidUntil}`,
      `Notes: ${request.note}`,
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
      title={request.supplier}
      description="An inspectable commercial record, with explicit response and custody evidence."
    >
      <div className="source-record">
        <section className="source-paper">
          <header>
            <span className="mono">SOURCING REQUEST</span>
            <span className="mono">{revision(request.sourceRevision)}</span>
          </header>
          <h3>{project.title}</h3>
          <p className="source-paper-label">
            {request.provenance === "synthetic"
              ? "SYNTHETIC EXERCISE / NO SUPPLIER TRANSACTION"
              : "MANUALLY RECORDED SUPPLIER WORKFLOW"}
          </p>
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
                  src={unit?.imageUrl}
                  alt={unit?.name || "Source garment"}
                />
                <div>
                  <span className="mono">{unit?.code}</span>
                  <h4>{unit?.name}</h4>
                  <p>{unit?.location}</p>
                  <small>Quantity 1 · one physical unit</small>
                </div>
              </div>
            );
          })}
          <div className="source-paper-notes">
            <strong>Pickup / preparation / return</strong>
            <p>{request.note}</p>
          </div>
          <footer>
            Quote valid through {day(request.quoteValidUntil, project.timeZone)}
            <br />A local request is not a live reservation.
          </footer>
        </section>
        <div className="source-response">
          <div className="section-title">
            <h3>The recorded response</h3>
            <Badge tone={request.stale ? "danger" : "brass"}>
              {request.stale ? "Scope stale" : request.status}
            </Badge>
          </div>
          {request.evidence && (
            <div className="response-evidence">
              <p>{request.evidence}</p>
              <span>
                {request.operator} ·{" "}
                {dateTime(request.updatedAt, project.timeZone)}
              </span>
              <small>Reference: {request.externalReference}</small>
            </div>
          )}
          {request.stale && (
            <Notice tone="warning">
              The production changed. Prepare a new request against the current
              units and dates before recording a hold or confirmation.
            </Notice>
          )}
          {nextStates[request.status].length > 0 ? (
            <form className="form-stack" onSubmit={save}>
              <Field label="Next recorded stage">
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
              <Field label="Operator name / role">
                <input
                  required
                  minLength={2}
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  maxLength={100}
                />
              </Field>
              <Field label="Response or custody evidence">
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  required
                  minLength={5}
                  maxLength={2500}
                  placeholder={
                    request.provenance === "synthetic"
                      ? "Clearly describe this synthetic rehearsal of the workflow. No real supplier confirmation or receipt has occurred."
                      : "Record the actual response, date, named source, and supporting evidence."
                  }
                />
              </Field>
              <Field label="External reference / evidence reference">
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                  maxLength={180}
                />
              </Field>
              <Field label="Provenance">
                <select
                  value={provenance}
                  disabled={request.provenance === "synthetic"}
                  onChange={(e) =>
                    setProvenance(e.target.value as "synthetic" | "manual")
                  }
                >
                  <option value="synthetic">Synthetic test response</option>
                  <option value="manual">
                    Actual response recorded by operator
                  </option>
                </select>
              </Field>
              {error && <Notice tone="danger">{error}</Notice>}
              <Button variant="primary" busy={busy} type="submit">
                Record this stage
                <ArrowRight size={15} />
              </Button>
            </form>
          ) : (
            <Notice>
              This record is closed. Its response and custody history remain in
              the production revisions.
            </Notice>
          )}
          <Button onClick={download}>
            <Download size={15} />
            Download request record
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
      title="Freeze a clear crew handoff"
      description="The pack retains its exact source revision and export time. Changed dependencies make it visibly superseded."
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
          <legend>Scheduled calls included</legend>
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
          Missing appearance approvals, allocations, fitting, or supplier
          evidence produces a clearly marked working pack. It cannot be
          presented as a ready production handoff.
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
            Create frozen pack
          </Button>
        </div>
      </form>
    </Modal>
  );
}
