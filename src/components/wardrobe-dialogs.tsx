"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, GitBranch, Ruler, Upload } from "lucide-react";
import type { PhysicalUnit, Provenance } from "@/lib/types";
import { displayFixtureText } from "@/lib/presentation-copy";
import { day, money } from "@/lib/format";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import { uploadImage } from "@/lib/upload-client";
import { useProduction } from "./production-context";
import { Badge, Button, Field, Modal, Notice, Photo } from "./ui";
export { AddUnitDialog } from "./add-unit-dialog";

export function UnitDialog({
  unit,
  onClose,
  onChange,
}: {
  unit: PhysicalUnit;
  onClose: () => void;
  onChange: () => void;
}) {
  const { project, send, setProject, busy, error, setError } = useProduction();
  const [tab, setTab] = useState("evidence");
  const [location, setLocation] = useState(unit.location);
  const [condition, setCondition] = useState(unit.condition);
  const [price, setPrice] = useState(String(unit.priceCents / 100));
  const [priceSource, setPriceSource] = useState(unit.priceSource);
  const [priceValidUntil, setPriceValidUntil] = useState(
    toLocalDateTime(unit.priceValidUntil, project.timeZone).slice(0, 10),
  );
  const [source, setSource] = useState(unit.availability.source);
  const [from, setFrom] = useState(
    toLocalDateTime(unit.availability.from, project.timeZone),
  );
  const [to, setTo] = useState(
    toLocalDateTime(unit.availability.to, project.timeZone),
  );
  const [confirmed, setConfirmed] = useState(unit.availability.confirmed);
  const [provenance, setProvenance] = useState<Provenance>(
    unit.availability.provenance,
  );
  const [fitting, setFitting] = useState(unit.fitting);
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    try {
      const result = await send({
        type: "update_unit",
        unitId: unit.id,
        location,
        condition,
        priceCents: Math.round(Number(price) * 100),
        priceSource,
        priceValidUntil: fromLocalDateTime(
          `${priceValidUntil}T23:59`,
          project.timeZone,
        ),
        availability: {
          from: fromLocalDateTime(from, project.timeZone),
          to: fromLocalDateTime(to, project.timeZone),
          source,
          checkedAt: new Date().toISOString(),
          confirmed,
          provenance,
        },
      });
      if (result) setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The evidence could not be recorded.",
      );
    }
  }
  async function saveFit(event: React.FormEvent) {
    event.preventDefault();
    const result = await send({
      type: "update_unit",
      unitId: unit.id,
      fitting,
    });
    if (result) setSaved(true);
  }
  async function upload() {
    if (!file || !rights) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadImage(file, project.id, "garment", unit.id);
      setProject(result.project);
      setFile(null);
      setRights(false);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The garment source could not be saved.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy && !uploading) {
          onClose();
          setError(null);
        }
      }}
      wide
      title={unit.name}
    >
      <div className="unit-detail r3-unit-detail">
        <aside>
          <Photo
            natural
            src={unit.imageUrl}
            alt={`${unit.name}, source garment reference`}
          />
          <div className="unit-details-id">
            <span className="mono">{unit.code}</span>
            <Badge tone={unit.status === "available" ? "neutral" : "danger"}>
              {unit.status}
            </Badge>
          </div>
          <div className="measurement-panel">
            <h3>
              <Ruler size={15} />
              Measurements
            </h3>
            {[
              { label: "Chest", value: unit.measurements.chestCm },
              { label: "Waist", value: unit.measurements.waistCm },
              { label: "Length", value: unit.measurements.lengthCm },
            ].map((m) => (
              <div key={m.label}>
                <span>{m.label}</span>
                <strong>
                  {m.value === null ? "Not measured" : `${m.value} cm`}
                </strong>
              </div>
            ))}
          </div>
          <p className="unit-source-line">
            {displayFixtureText(unit.priceSource, project.fixture)}
            <br />
            {money(unit.priceCents, project.currency)} · valid until{" "}
            {day(unit.priceValidUntil, project.timeZone)}
          </p>
          <Button onClick={onChange}>
            <GitBranch size={15} />
            Review unavailability
          </Button>
          <Link
            className="button button-quiet"
            href={`/production/${project.id}/handoff?unit=${unit.id}`}
            onClick={onClose}
          >
            Sourcing request
            <ArrowRight size={14} />
          </Link>
        </aside>
        <div>
          <div className="segmented" aria-label="Unit evidence section">
            {[
              { id: "evidence", label: "Availability" },
              { id: "fitting", label: "Fitting" },
              { id: "source", label: "Photo" },
            ].map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => {
                  setTab(item.id);
                  setSaved(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {tab === "evidence" && (
            <form className="form-stack unit-evidence-form" onSubmit={save}>
              <div className="field-grid">
                <Field label="Location">
                  <input
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={120}
                  />
                </Field>
                <Field label={`Price (${project.currency})`}>
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </Field>
              </div>
              <div className="field-grid">
                <Field label="Quote ref">
                  <input
                    value={priceSource}
                    onChange={(e) => setPriceSource(e.target.value)}
                    required
                    maxLength={500}
                  />
                </Field>
                <Field label="Valid until">
                  <input
                    type="date"
                    value={priceValidUntil}
                    onChange={(e) => setPriceValidUntil(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Condition">
                <textarea
                  required
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </Field>
              <div className="field-grid">
                <Field label={`Available from (${project.timeZone})`}>
                  <input
                    type="datetime-local"
                    value={from}
                    required
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </Field>
                <Field label="Available to">
                  <input
                    type="datetime-local"
                    value={to}
                    required
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Evidence">
                <textarea
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  required
                  minLength={5}
                  maxLength={500}
                />
              </Field>
              <Field label="Source">
                <select
                  value={provenance}
                  onChange={(e) => setProvenance(e.target.value as Provenance)}
                >
                  <option value="synthetic">Example</option>
                  <option value="manual">Manual</option>
                  <option value="observed">Observed</option>
                </select>
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Availability confirmed
              </label>
              <Button variant="primary" busy={busy} type="submit">
                Save
              </Button>
            </form>
          )}
          {tab === "fitting" && (
            <form className="form-stack unit-evidence-form" onSubmit={saveFit}>
              <Field label="Performer">
                <select
                  value={fitting.performerId || ""}
                  onChange={(e) =>
                    setFitting({
                      ...fitting,
                      performerId: e.target.value || null,
                    })
                  }
                >
                  <option value="">No performer fitted</option>
                  {project.performers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fit">
                <select
                  value={fitting.status}
                  onChange={(e) =>
                    setFitting({
                      ...fitting,
                      status: e.target
                        .value as PhysicalUnit["fitting"]["status"],
                    })
                  }
                >
                  <option value="not_measured">Not fitted</option>
                  <option value="provisional">Provisional</option>
                  <option value="scheduled">Fitting booked</option>
                  <option value="confirmed">Fitted</option>
                  <option value="alteration">Needs alteration</option>
                </select>
              </Field>
              <Field label="Source">
                <select
                  value={fitting.provenance}
                  onChange={(e) =>
                    setFitting({
                      ...fitting,
                      provenance: e.target.value as Provenance,
                    })
                  }
                >
                  <option value="synthetic">Example</option>
                  <option value="manual">Manual</option>
                  <option value="observed">Observed</option>
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  required
                  value={fitting.evidence}
                  onChange={(e) =>
                    setFitting({ ...fitting, evidence: e.target.value })
                  }
                  minLength={5}
                  maxLength={2400}
                  placeholder="Who fitted it, what was checked"
                />
              </Field>
              <Button variant="primary" busy={busy} type="submit">
                Save fitting
              </Button>
            </form>
          )}
          {tab === "source" && (
            <div className="form-stack unit-evidence-form">
              <Notice>A new image resets dependent approvals.</Notice>
              <Field
                label="Garment reference image"
                hint="Garment alone, clearly visible · ≤10 MB"
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />
                I have the rights to use this image with YouCam.
              </label>
              <Button
                variant="primary"
                disabled={!file || !rights}
                busy={uploading}
                onClick={() => void upload()}
              >
                <Upload size={15} />
                Save image
              </Button>
            </div>
          )}
          {saved && <Notice tone="success">Saved.</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </div>
    </Modal>
  );
}
