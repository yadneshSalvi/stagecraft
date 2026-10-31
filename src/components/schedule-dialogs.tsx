"use client";
import { useState } from "react";
import type { Occurrence, Transition } from "@/lib/types";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/datetime";
import { useProduction } from "./production-context";
import { Button, Field, Modal, Notice } from "./ui";

export function OccurrenceDialog({
  occurrence,
  onClose,
}: {
  occurrence: Occurrence | "new";
  onClose: () => void;
}) {
  const { project, send, busy, error, setError } = useProduction();
  const existing = occurrence === "new" ? null : occurrence;
  const [sceneId, setSceneId] = useState(
    existing?.sceneId || project.scenes[0]?.id || "",
  );
  const [location, setLocation] = useState(existing?.location || "");
  const [start, setStart] = useState(
    existing ? toLocalDateTime(existing.start, project.timeZone) : "",
  );
  const [end, setEnd] = useState(
    existing ? toLocalDateTime(existing.end, project.timeZone) : "",
  );
  const [kind, setKind] = useState<Occurrence["kind"]>(
    existing?.kind || (project.mode === "film" ? "shoot" : "performance"),
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const scene = project.scenes.find((s) => s.id === sceneId);
      const value: Occurrence = {
        id: existing?.id || `occ-${crypto.randomUUID()}`,
        sceneId,
        label: existing?.label || `${scene?.title || "Scene"} · ${kind}`,
        kind,
        start: fromLocalDateTime(start, project.timeZone),
        end: fromLocalDateTime(end, project.timeZone),
        location,
        order: existing?.order || project.occurrences.length + 1,
      };
      const result = await send({
        type: "update_occurrence",
        occurrence: value,
      });
      if (result) onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Choose valid call times.",
      );
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={existing ? "Revise the call" : "A new production call"}
      description={`Enter times in ${project.timeZone}. Story chronology remains independent.`}
    >
      <form className="form-stack" onSubmit={save}>
        <Field label="Script scene">
          <select
            value={sceneId}
            onChange={(event) => setSceneId(event.target.value)}
            required
          >
            {project.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                SC {scene.number} · {scene.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="field-grid">
          <Field label="Starts">
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field label="Ends">
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Location">
          <input
            required
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={140}
            placeholder="e.g. Main stage / Unit A"
          />
        </Field>
        <Field label="Call type">
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as Occurrence["kind"])
            }
          >
            <option value="shoot">Shoot</option>
            <option value="performance">Performance</option>
            <option value="rehearsal">Rehearsal</option>
            <option value="fitting">Fitting</option>
          </select>
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {!project.scenes.length && (
          <Notice tone="warning">
            Import a script scene before scheduling a call.
          </Notice>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!project.scenes.length}
            busy={busy}
          >
            Save scheduled call
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TransitionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { project, send, busy, error } = useProduction();
  const [performerId, setPerformerId] = useState(
    project.performers[0]?.id || "",
  );
  const [from, setFrom] = useState(project.occurrences[0]?.id || "");
  const [to, setTo] = useState(project.occurrences[1]?.id || "");
  const [minutes, setMinutes] = useState("");
  const [crew, setCrew] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<Transition["evidence"]>("unknown");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const transition: Transition = {
      id: `transition-${crypto.randomUUID()}`,
      performerId,
      fromOccurrenceId: from,
      toOccurrenceId: to,
      minutes: minutes === "" ? null : Number(minutes),
      evidence: minutes === "" ? "unknown" : evidence,
      crewResource: crew.trim() || null,
      crewCapacity: 1,
      note,
    };
    const next = await send({ type: "update_transition", transition });
    if (next) onClose();
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Record a real change requirement"
      description="Transitions are directional and performer-specific. Unknown time is never treated as zero."
    >
      <form className="form-stack" onSubmit={save}>
        <Field label="Performer">
          <select
            value={performerId}
            onChange={(event) => setPerformerId(event.target.value)}
          >
            {project.performers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From occurrence">
          <select
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          >
            {project.occurrences.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To occurrence">
          <select value={to} onChange={(event) => setTo(event.target.value)}>
            {project.occurrences.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="field-grid">
          <Field label="Required minutes (blank = unknown)">
            <input
              type="number"
              min="0"
              max="720"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
          <Field label="Evidence type">
            <select
              value={evidence}
              onChange={(event) =>
                setEvidence(event.target.value as Transition["evidence"])
              }
            >
              <option value="unknown">Unknown</option>
              <option value="estimate">Recorded estimate</option>
              <option value="observed">Observed in rehearsal</option>
            </select>
          </Field>
        </div>
        <Field label="Exclusive crew / station resource (optional)">
          <input
            value={crew}
            onChange={(event) => setCrew(event.target.value)}
            maxLength={100}
            placeholder="e.g. Dresser A / makeup chair 1"
          />
        </Field>
        <Field label="Evidence, observer, and context">
          <textarea
            required
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1600}
            placeholder="Record what was observed or how the estimate was made. Label synthetic exercises explicitly."
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
            disabled={!from || !to || from === to}
          >
            Record transition
          </Button>
        </div>
      </form>
    </Modal>
  );
}
