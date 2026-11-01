"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { commandProject } from "@/lib/client";
import { useProduction } from "./production-context";
import { Button, Field } from "./ui";

export function InitialCasting({ performerId }: { performerId: string }) {
  const { project, setProject, setError, refresh, busy } = useProduction();
  const available = project.characters.filter(
    (character) =>
      !project.performers.some((person) => person.id === character.performerId),
  );
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const characterId = available.some((character) => character.id === selected)
    ? selected
    : available[0]?.id || "";
  async function assign() {
    if (!characterId || saving || busy) return;
    setSaving(true);
    setError(null);
    try {
      const proposed = await commandProject(project, {
        type: "propose_change",
        kind: "recast",
        subjectId: characterId,
        replacementId: performerId,
        seeded: project.fixture,
      });
      setProject(proposed.project);
      const proposal = proposed.project.proposals.at(-1);
      const option = proposal?.options.find(
        (option) =>
          option.replacementPerformerId === performerId && option.feasible,
      );
      if (!proposal || !option)
        throw new Error("Review the casting proposal on the production board.");
      const result = await commandProject(proposed.project, {
        type: "adopt_repair",
        proposalId: proposal.id,
        optionId: option.id,
      });
      setProject(result.project);
      setSelected("");
    } catch (cause) {
      await refresh().catch(() => {});
      setError(
        cause instanceof Error
          ? cause.message
          : "The casting decision could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!available.length) return null;
  return (
    <section className="initial-casting">
      <Field label="Cast as">
        <select
          value={characterId}
          onChange={(event) => setSelected(event.target.value)}
        >
          {available.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </Field>
      <Button
        type="button"
        busy={saving}
        disabled={busy}
        onClick={() => void assign()}
      >
        Cast
        <ArrowRight size={14} />
      </Button>
    </section>
  );
}
