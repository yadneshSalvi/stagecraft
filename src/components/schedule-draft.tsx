"use client";
import { useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { fromLocalDateTime } from "@/lib/datetime";
import { useProduction } from "./production-context";
import { Button, Field, Modal, Notice } from "./ui";

export function ScheduleDraft({ onClose }: { onClose: () => void }) {
  const { project, send, busy, error, setError } = useProduction();
  const [start, setStart] = useState("");
  const [sceneMinutes, setSceneMinutes] = useState(30);
  const [gapMinutes, setGapMinutes] = useState(15);
  const [location, setLocation] = useState("");
  const missing = project.scenes.filter(
    (scene) => !project.occurrences.some((call) => call.sceneId === scene.id),
  );
  async function draft(event: React.FormEvent) {
    event.preventDefault();
    try {
      const next = await send({
        type: "draft_schedule",
        start: fromLocalDateTime(start, project.timeZone),
        sceneMinutes,
        gapMinutes,
        location,
      });
      if (next) onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Choose a valid schedule start.",
      );
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Draft calls"
    >
      <form className="form-stack" onSubmit={draft}>
        <p>
          <CalendarDays size={16} /> {missing.length} unscheduled scenes ·{" "}
          {project.timeZone}
        </p>
        <Field label="First production call">
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
        </Field>
        <div className="field-grid">
          <Field label="Minutes per scene">
            <input
              type="number"
              value={sceneMinutes}
              min={1}
              max={720}
              onChange={(event) => setSceneMinutes(Number(event.target.value))}
              required
            />
          </Field>
          <Field label="Minutes between scenes">
            <input
              type="number"
              value={gapMinutes}
              min={0}
              max={240}
              onChange={(event) => setGapMinutes(Number(event.target.value))}
              required
            />
          </Field>
        </div>
        <Field label="Initial location">
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={200}
            required
            placeholder="e.g. Main stage"
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
            disabled={!missing.length}
          >
            Draft {missing.length} calls <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
