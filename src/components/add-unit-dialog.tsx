"use client";
import { useState } from "react";
import type { GarmentCategory, PhysicalUnit } from "@/lib/types";
import { fromLocalDateTime } from "@/lib/datetime";
import { uploadImage } from "@/lib/upload-client";
import { useProduction } from "./production-context";
import { Button, Field, Modal, Notice } from "./ui";

export function AddUnitDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { project, send, setProject, busy, error, setError } = useProduction();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<GarmentCategory>("outerwear");
  const [ownership, setOwnership] =
    useState<PhysicalUnit["ownership"]>("owned");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("");
  const [condition, setCondition] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [price, setPrice] = useState("0");
  const [priceSource, setPriceSource] = useState("");
  const [quoteUntil, setQuoteUntil] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [availabilitySource, setAvailabilitySource] = useState("");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [length, setLength] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saving || busy) return;
    setSaving(true);
    setError(null);
    try {
      const unit: PhysicalUnit = {
        id: `unit-${crypto.randomUUID()}`,
        code: code.trim(),
        name: name.trim(),
        category,
        imageUrl: null,
        assetId: null,
        color: color || "Not recorded",
        material: material || "Not recorded",
        supplier: supplier.trim(),
        ownership,
        location: location.trim(),
        condition: condition.trim(),
        status: "available",
        measurements: {
          chestCm: chest === "" ? null : Number(chest),
          waistCm: waist === "" ? null : Number(waist),
          lengthCm: length === "" ? null : Number(length),
        },
        fitting: {
          performerId: null,
          status: "not_measured",
          evidence: "Not fitted yet.",
          provenance: project.fixture ? "synthetic" : "manual",
        },
        availability: {
          from: fromLocalDateTime(from, project.timeZone),
          to: fromLocalDateTime(to, project.timeZone),
          source: availabilitySource,
          checkedAt: new Date().toISOString(),
          confirmed: false,
          provenance: project.fixture ? "synthetic" : "manual",
        },
        priceCents: Math.round(Number(price) * 100),
        priceSource,
        priceValidUntil: fromLocalDateTime(
          `${quoteUntil}T23:59`,
          project.timeZone,
        ),
        substitutionFamily: null,
        approvedSubstituteIds: [],
        version: 1,
      };
      const next = await send({ type: "add_unit", unit });
      if (!next) return;
      if (file) {
        const result = await uploadImage(file, next.id, "garment", unit.id);
        setProject(result.project);
      }
      onClose();
      setName("");
      setCode("");
      setFile(null);
      setRights(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The physical unit could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving && !busy) onClose();
      }}
      wide
      title="Add unit"
    >
      <form className="form-stack" onSubmit={create}>
        <div className="field-grid">
          <Field label="Unit code">
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
              placeholder="e.g. C-022"
            />
          </Field>
          <Field label="Garment name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Charcoal wool overcoat"
            />
          </Field>
        </div>
        <div className="field-grid">
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as GarmentCategory)}
            >
              <option value="outerwear">Outerwear</option>
              <option value="upper_body">Upper body</option>
              <option value="lower_body">Lower body</option>
              <option value="full_body">Full body</option>
              <option value="shoes">Shoes</option>
            </select>
          </Field>
          <Field label="Ownership">
            <select
              value={ownership}
              onChange={(e) =>
                setOwnership(e.target.value as PhysicalUnit["ownership"])
              }
            >
              <option value="owned">Owned</option>
              <option value="rental">Rental</option>
            </select>
          </Field>
        </div>
        <div className="field-grid">
          <Field label="Supplier">
            <input
              required
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Location">
            <input
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={120}
            />
          </Field>
        </div>
        <div className="field-grid">
          <Field label="Color (optional)">
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Fabric / material (optional)">
            <input
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              maxLength={120}
            />
          </Field>
        </div>
        <Field label="Condition">
          <textarea
            required
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Cleaning, alterations…"
          />
        </Field>
        <div className="measurement-fields">
          <Field label="Chest (cm)">
            <input
              type="number"
              min="1"
              max="300"
              step="0.1"
              value={chest}
              onChange={(e) => setChest(e.target.value)}
              placeholder="Unknown"
            />
          </Field>
          <Field label="Waist (cm)">
            <input
              type="number"
              min="1"
              max="300"
              step="0.1"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              placeholder="Unknown"
            />
          </Field>
          <Field label="Length (cm)">
            <input
              type="number"
              min="1"
              max="300"
              step="0.1"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="Unknown"
            />
          </Field>
        </div>
        <div className="field-grid">
          <Field label={`Price (${project.currency})`}>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              max="1000000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Valid until">
            <input
              required
              type="date"
              value={quoteUntil}
              onChange={(e) => setQuoteUntil(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Quote ref">
          <input
            required
            value={priceSource}
            onChange={(e) => setPriceSource(e.target.value)}
            maxLength={500}
            placeholder="Supplier quote ref"
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
        <Field label="Availability notes">
          <textarea
            required
            value={availabilitySource}
            onChange={(e) => setAvailabilitySource(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </Field>
        <Field label="Garment reference image (optional)">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        {file && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rights}
              required
              onChange={(e) => setRights(e.target.checked)}
            />
            I have the rights to use this image with YouCam.
          </label>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            busy={saving || busy}
            disabled={!!file && !rights}
          >
            Add unit
          </Button>
        </div>
      </form>
    </Modal>
  );
}
