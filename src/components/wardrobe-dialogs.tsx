"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, GitBranch, Ruler, Upload } from "lucide-react";
import type { PhysicalUnit, Provenance } from "@/lib/types";
import { day, money, provenanceLabel } from "@/lib/format";
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
      description={`${unit.code} · one physical unit · ${unit.ownership === "rental" ? "rental inventory" : "owned inventory"}`}
    >
      <div className="unit-detail">
        <aside>
          <Photo
            src={unit.imageUrl}
            alt={`${unit.name}, source garment reference`}
          />
          <span className="image-caption">SOURCE GARMENT REFERENCE</span>
          <div className="unit-details-id">
            <span className="mono">
              {unit.code} / V{unit.version}
            </span>
            <Badge tone={unit.status === "available" ? "neutral" : "danger"}>
              {unit.status}
            </Badge>
          </div>
          <div className="measurement-panel">
            <h3>
              <Ruler size={15} />
              Recorded garment dimensions
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
            <p>
              Dimensions screen a candidate. They do not establish a physical
              fitting.
            </p>
          </div>
          <p className="unit-source-line">
            {unit.priceSource}
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
            Prepare a sourcing request
            <ArrowRight size={14} />
          </Link>
        </aside>
        <div>
          <div className="segmented" aria-label="Unit evidence section">
            {[
              { id: "evidence", label: "Availability & custody" },
              { id: "fitting", label: "Fitting" },
              { id: "source", label: "Source photo" },
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
                <Field label="Current location">
                  <input
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={120}
                  />
                </Field>
                <Field label={`Recorded price (${project.currency})`}>
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
                <Field label="Price source / quote reference">
                  <input
                    value={priceSource}
                    onChange={(e) => setPriceSource(e.target.value)}
                    required
                    maxLength={500}
                  />
                </Field>
                <Field label="Price valid through">
                  <input
                    type="date"
                    value={priceValidUntil}
                    onChange={(e) => setPriceValidUntil(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Condition / preparation notes">
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
                <Field label="Available through">
                  <input
                    type="datetime-local"
                    value={to}
                    required
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Source, named operator, and evidence">
                <textarea
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  required
                  minLength={5}
                  maxLength={500}
                />
              </Field>
              <Field label="Evidence provenance">
                <select
                  value={provenance}
                  onChange={(e) => setProvenance(e.target.value as Provenance)}
                >
                  <option value="synthetic">Synthetic exercise</option>
                  <option value="manual">Named operator’s manual record</option>
                  <option value="observed">Observed custodian evidence</option>
                </select>
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                The evidence above confirms this availability window.
              </label>
              <Notice>
                This records availability evidence. A supplier request,
                reservation, and physical receipt are recorded separately in
                Handoff.
              </Notice>
              <Button variant="primary" busy={busy} type="submit">
                Save unit evidence
              </Button>
            </form>
          )}
          {tab === "fitting" && (
            <form className="form-stack unit-evidence-form" onSubmit={saveFit}>
              <Notice>
                Record who observed the fitting, for which performer, and when.
                Include movement or alteration notes in the evidence.
              </Notice>
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
              <Field label="Fitting state">
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
                  <option value="not_measured">
                    Not measured / not fitted
                  </option>
                  <option value="provisional">Provisionally compatible</option>
                  <option value="scheduled">Fitting scheduled</option>
                  <option value="confirmed">Fit confirmed with evidence</option>
                  <option value="alteration">Requires alteration</option>
                </select>
              </Field>
              <Field label="Evidence provenance">
                <select
                  value={fitting.provenance}
                  onChange={(e) =>
                    setFitting({
                      ...fitting,
                      provenance: e.target.value as Provenance,
                    })
                  }
                >
                  <option value="synthetic">
                    Synthetic exercise — no physical outcome
                  </option>
                  <option value="manual">Manual practitioner record</option>
                  <option value="observed">Actual observed fitting</option>
                </select>
              </Field>
              <Field label="Practitioner, date, observations, and evidence">
                <textarea
                  required
                  value={fitting.evidence}
                  onChange={(e) =>
                    setFitting({ ...fitting, evidence: e.target.value })
                  }
                  minLength={5}
                  maxLength={2400}
                  placeholder="Who observed this? What was checked? Record any movement or alteration limits."
                />
              </Field>
              <Button variant="primary" busy={busy} type="submit">
                Record fitting evidence
              </Button>
            </form>
          )}
          {tab === "source" && (
            <div className="form-stack unit-evidence-form">
              <Notice>
                A new garment image changes the render input. Dependent previews
                will need a fresh review.
              </Notice>
              <Field
                label="Garment reference image"
                hint="An isolated, clearly visible garment. JPEG, PNG, or WebP under 10 MB."
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
                I have permission to use this garment image and process it with
                YouCam.
              </label>
              <Button
                variant="primary"
                disabled={!file || !rights}
                busy={uploading}
                onClick={() => void upload()}
              >
                <Upload size={15} />
                Save source image
              </Button>
            </div>
          )}
          {saved && (
            <Notice tone="success">
              Evidence saved as a new production revision.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <p className="fine-print">
            Current source: {provenanceLabel(unit.availability.provenance)}.
            Original and amended records remain traceable through production
            revisions.
          </p>
        </div>
      </div>
    </Modal>
  );
}
