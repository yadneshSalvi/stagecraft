import type {
  Character,
  Production,
  Scene,
  SceneRequirement,
  ScriptRevision,
} from "../types";
import { requireFact } from "./errors";
import { canonicalJson, sha256 } from "./hash";

export interface ScriptDiff {
  addedSceneIds: string[];
  removedSceneIds: string[];
  changedSceneIds: string[];
  preservedReviewedSceneIds: string[];
  addedCharacterIds: string[];
  removedCharacterIds: string[];
  warnings: string[];
}

const sourceText = (
  script: ScriptRevision | null,
  requirement: SceneRequirement,
) => script?.text.slice(requirement.sourceStart, requirement.sourceEnd) ?? "";

export function validateSceneSources(
  script: ScriptRevision,
  scenes: Scene[],
  characters: Character[],
): void {
  requireFact(
    new Set(scenes.map((scene) => scene.id)).size === scenes.length,
    "DUPLICATE_SCENE",
    "Script scenes need unique stable identities.",
  );
  requireFact(
    new Set(characters.map((character) => character.id)).size ===
      characters.length,
    "DUPLICATE_CHARACTER",
    "Script characters need unique stable identities.",
  );
  const requirementIds = new Set<string>();
  for (const scene of scenes) {
    requireFact(
      Number.isInteger(scene.sourceStart) &&
        Number.isInteger(scene.sourceEnd) &&
        scene.sourceStart >= 0 &&
        scene.sourceEnd > scene.sourceStart &&
        scene.sourceEnd <= script.text.length,
      "INVALID_SOURCE_SPAN",
      `${scene.title}'s source range must refer to the imported script.`,
    );
    requireFact(
      Number.isSafeInteger(scene.storyDay) && scene.storyDay > 0,
      "INVALID_STORY_DAY",
      "Story day must be a positive integer, independent of the shooting date.",
    );
    for (const characterId of scene.characterIds)
      requireFact(
        characters.some((character) => character.id === characterId),
        "UNRESOLVED_CHARACTER",
        `${scene.title} references an unmapped character ${characterId}.`,
      );
    for (const requirement of scene.requirements) {
      requireFact(
        !requirementIds.has(requirement.id),
        "DUPLICATE_REQUIREMENT",
        "Script requirements need unique stable identities.",
      );
      requirementIds.add(requirement.id);
      requireFact(
        characters.some(
          (character) => character.id === requirement.characterId,
        ),
        "UNRESOLVED_CHARACTER",
        `Requirement ${requirement.id} needs a mapped character.`,
      );
      requireFact(
        Number.isInteger(requirement.sourceStart) &&
          Number.isInteger(requirement.sourceEnd) &&
          requirement.sourceStart >= scene.sourceStart &&
          requirement.sourceEnd <= scene.sourceEnd &&
          (requirement.explicit
            ? requirement.sourceEnd > requirement.sourceStart
            : requirement.sourceEnd >= requirement.sourceStart),
        "INVALID_SOURCE_SPAN",
        `Requirement ${requirement.id} needs a source range inside its scene. Inferred cues remain suggestions.`,
      );
    }
  }
}

/** Reconcile stable IDs without overwriting designer corrections with a new extraction. */
export function mergeScriptRevision(
  production: Production,
  script: ScriptRevision,
  incomingScenes: Scene[],
  incomingCharacters: Character[],
): { scenes: Scene[]; characters: Character[]; diff: ScriptDiff } {
  requireFact(
    script.rightsConfirmed,
    "SCRIPT_RIGHTS_REQUIRED",
    "Confirm permission to process and use this script before adoption.",
  );
  requireFact(
    script.sha256 === sha256(script.text),
    "SCRIPT_HASH_MISMATCH",
    "The script checksum does not match its exact imported text.",
  );
  validateSceneSources(script, incomingScenes, incomingCharacters);
  const removedSceneIds = production.scenes
    .filter(
      (scene) => !incomingScenes.some((incoming) => incoming.id === scene.id),
    )
    .map((scene) => scene.id);
  for (const sceneId of removedSceneIds)
    requireFact(
      !production.occurrences.some(
        (occurrence) => occurrence.sceneId === sceneId,
      ) && !production.looks.some((look) => look.sceneIds.includes(sceneId)),
      "SCRIPT_SCENE_REMOVED",
      `Scene ${sceneId} is still used by a look or schedule. Remap those dependencies before removing it.`,
      409,
    );
  const removedCharacterIds = production.characters
    .filter(
      (character) =>
        !incomingCharacters.some((incoming) => incoming.id === character.id),
    )
    .map((character) => character.id);
  for (const characterId of removedCharacterIds)
    requireFact(
      !production.looks.some((look) => look.characterId === characterId),
      "SCRIPT_CHARACTER_REMOVED",
      `Character ${characterId} still has look recipes. Review its dependencies before removing it.`,
      409,
    );
  const diff: ScriptDiff = {
    addedSceneIds: incomingScenes
      .filter((scene) => !production.scenes.some((old) => old.id === scene.id))
      .map((scene) => scene.id),
    removedSceneIds,
    changedSceneIds: [],
    preservedReviewedSceneIds: [],
    addedCharacterIds: incomingCharacters
      .filter(
        (character) =>
          !production.characters.some((old) => old.id === character.id),
      )
      .map((character) => character.id),
    removedCharacterIds,
    warnings: [],
  };
  const scenes = incomingScenes.map((incoming): Scene => {
    const previous = production.scenes.find(
      (scene) => scene.id === incoming.id,
    );
    if (!previous)
      return {
        ...structuredClone(incoming),
        reviewed: false,
        requirements: incoming.requirements.map((requirement) => ({
          ...requirement,
          reviewed: false,
        })),
        lookIds: [],
      };
    const merged = structuredClone(incoming);
    merged.lookIds = production.looks
      .filter((look) => look.sceneIds.includes(incoming.id))
      .map((look) => look.id);
    let evidenceChanged = false;
    if (previous.reviewed) {
      merged.title = previous.title;
      merged.storyDay = previous.storyDay;
      merged.storyDaySource = "reviewed";
      if (
        incoming.storyDaySource === "script" &&
        incoming.storyDay !== previous.storyDay
      ) {
        evidenceChanged = true;
        diff.warnings.push(
          `${previous.number}: the new script states a different story day; the reviewed correction was retained pending review.`,
        );
      }
      diff.preservedReviewedSceneIds.push(previous.id);
      if (
        previous.title !== incoming.title ||
        previous.storyDay !== incoming.storyDay
      )
        diff.warnings.push(
          `${previous.number}: preserved its reviewed title and story day; the extraction differs.`,
        );
    }
    const requirements = incoming.requirements.map((incomingRequirement) => {
      const old = previous.requirements.find(
        (requirement) => requirement.id === incomingRequirement.id,
      );
      if (!old?.reviewed)
        return { ...structuredClone(incomingRequirement), reviewed: false };
      const unchangedSource =
        sourceText(production.script, old) ===
        sourceText(script, incomingRequirement);
      if (!unchangedSource) {
        evidenceChanged = true;
        diff.warnings.push(
          `${old.id}: source evidence changed; retained the correction for review.`,
        );
      }
      return {
        ...structuredClone(old),
        sourceStart: incomingRequirement.sourceStart,
        sourceEnd: incomingRequirement.sourceEnd,
        reviewed: unchangedSource,
      };
    });
    for (const old of previous.requirements.filter(
      (requirement) =>
        requirement.reviewed &&
        !incoming.requirements.some(
          (candidate) => candidate.id === requirement.id,
        ),
    )) {
      const text = sourceText(production.script, old);
      const segment = script.text.slice(
        incoming.sourceStart,
        incoming.sourceEnd,
      );
      const match = text ? segment.indexOf(text) : -1;
      const unambiguous = match >= 0 && segment.indexOf(text, match + 1) === -1;
      requirements.push({
        ...structuredClone(old),
        sourceStart: unambiguous
          ? incoming.sourceStart + match
          : incoming.sourceStart,
        sourceEnd: unambiguous
          ? incoming.sourceStart + match + text.length
          : incoming.sourceStart,
        explicit: unambiguous && old.explicit,
        reviewed: unambiguous,
      });
      if (!unambiguous) {
        evidenceChanged = true;
        diff.warnings.push(
          `${old.id}: missing source cue retained as an unreviewed suggestion.`,
        );
      }
    }
    merged.requirements = requirements;
    const semantic = (scene: Scene) => ({
      storyDay: scene.storyDay,
      storyDaySource: scene.reviewed
        ? "reviewed"
        : (scene.storyDaySource ?? "unspecified"),
      heading: scene.heading,
      characters: scene.characterIds,
      requirements: scene.requirements.map(({ id, text, explicit }) => ({
        id,
        text,
        explicit,
      })),
    });
    const changed =
      evidenceChanged ||
      canonicalJson(semantic(previous)) !== canonicalJson(semantic(merged));
    merged.reviewed =
      previous.reviewed &&
      !changed &&
      requirements.every((requirement) => requirement.reviewed);
    if (changed) diff.changedSceneIds.push(incoming.id);
    return merged;
  });
  const characters = incomingCharacters.map((incoming): Character => {
    const previous = production.characters.find(
      (character) => character.id === incoming.id,
    );
    if (previous) return structuredClone(previous);
    const performerId = production.performers.some(
      (performer) => performer.id === incoming.performerId,
    )
      ? incoming.performerId
      : "";
    return {
      ...structuredClone(incoming),
      performerId,
      direction: { ...structuredClone(incoming.direction), approvedBy: null },
    };
  });
  return { scenes, characters, diff };
}

export function diffScript(
  production: Production,
  script: ScriptRevision,
  scenes: Scene[],
  characters: Character[],
): ScriptDiff {
  return mergeScriptRevision(production, script, scenes, characters).diff;
}
