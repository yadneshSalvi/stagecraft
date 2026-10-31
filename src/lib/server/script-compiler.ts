import type { Character, Production, Scene } from "@/lib/types";
import { ApiError } from "./errors";
import { ExtractedScriptSchema } from "./script-schema";
import {
  sourceComparisonKey as key,
  findSourceHeading,
  indexSource,
  findGroundedSourceQuote,
} from "./script-grounding";
const slug = (value: string) =>
  key(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
export interface GroundingAudit {
  modelSceneCount: number;
  groundedSceneCount: number;
  modelCueCount: number;
  groundedCueCount: number;
  droppedCueCount: number;
  normalizedCueCount: number;
  repeatedCueCount: number;
  repairedExcerptCount: number;
  repairedExcerpts: {
    sceneNumber: string;
    cueNumber: number;
    originalQuote: string;
    retainedQuote: string;
    sourceStart: number;
    sourceEnd: number;
  }[];
}
/** Model suggestions never supply IDs, offsets, approvals or operational state. */
export function compileExtraction(
  project: Production,
  text: string,
  raw: unknown,
): {
  scenes: Scene[];
  characters: Character[];
  notices: string[];
  grounding: GroundingAudit;
} {
  const extracted = ExtractedScriptSchema.parse(raw);
  const notices: string[] = [];
  const warn = (message: string) => {
    if (notices.length < 40) notices.push(message);
  };
  const characters: Character[] = [],
    characterByName = new Map<string, Character>();
  for (const item of extracted.characters) {
    if (characterByName.has(key(item.name))) {
      warn("A repeated character name was merged for review.");
      continue;
    }
    const existing = project.characters.find(
      (character) => key(character.name) === key(item.name),
    );
    let id = existing?.id || `char-${slug(item.name) || characters.length + 1}`;
    if (characters.some((character) => character.id === id))
      id += `-${characters.length + 1}`;
    const character: Character = existing
      ? { ...structuredClone(existing), id }
      : {
          id,
          name: item.name,
          description: item.description,
          performerId: "",
          direction: {
            revision: 1,
            text: "",
            palette: [],
            essential: [],
            approvedBy: null,
          },
        };
    characters.push(character);
    characterByName.set(key(item.name), character);
  }
  const matched: {
    item: (typeof extracted.scenes)[number];
    start: number;
    heading: string;
  }[] = [];
  const numbers = new Set<string>();
  let cursor = 0;
  for (const item of extracted.scenes) {
    const heading = findSourceHeading(text, item.heading, cursor);
    if (!heading) {
      warn(
        `Scene ${item.number}: the heading could not be grounded and was omitted. Review the source.`,
      );
      continue;
    }
    let number = item.number,
      suffix = 2;
    while (numbers.has(number))
      number = `${item.number.slice(0, 15)}-${suffix++}`;
    if (number !== item.number)
      warn(`A repeated scene number was labelled ${number} for review.`);
    numbers.add(number);
    matched.push({
      item: { ...item, number },
      start: heading.start,
      heading: heading.heading,
    });
    cursor = heading.end;
  }
  if (!matched.length)
    throw new ApiError(
      422,
      "SOURCE_MISMATCH",
      "No scene heading could be grounded. Include the script's original scene or act headings and try again.",
    );
  const grounding: GroundingAudit = {
    modelSceneCount: extracted.scenes.length,
    groundedSceneCount: matched.length,
    modelCueCount: extracted.scenes.reduce(
      (sum, scene) => sum + scene.requirements.length,
      0,
    ),
    groundedCueCount: 0,
    droppedCueCount: 0,
    normalizedCueCount: 0,
    repeatedCueCount: 0,
    repairedExcerptCount: 0,
    repairedExcerpts: [],
  };
  const sceneIds = new Set<string>();
  const scenes: Scene[] = matched.map(({ item, start, heading }, index) => {
    const sourceEnd = matched[index + 1]?.start ?? text.length;
    const source = indexSource(text.slice(start, sourceEnd), start);
    const characterIds: string[] = [];
    for (const name of item.characters) {
      const character = characterByName.get(key(name));
      if (character) characterIds.push(character.id);
      else
        warn(
          `Scene ${item.number}: an unresolved character reference was omitted.`,
        );
    }
    const requirements: Scene["requirements"] = [];
    for (const [cueIndex, cue] of item.requirements.entries()) {
      const character = characterByName.get(key(cue.character));
      const span = findGroundedSourceQuote(source, cue.quote);
      if (!character || !span) {
        warn(
          `Scene ${item.number}, cue ${cueIndex + 1}: unverified source or character; cue omitted for review.`,
        );
        continue;
      }
      if (!characterIds.includes(character.id)) {
        characterIds.push(character.id);
        warn(
          `Scene ${item.number}: a grounded cue's character was added to the scene for review.`,
        );
      }
      const quote = text.slice(span.start, span.end);
      if (span.repaired) {
        grounding.repairedExcerptCount++;
        grounding.repairedExcerpts.push({
          sceneNumber: item.number,
          cueNumber: cueIndex + 1,
          originalQuote: cue.quote,
          retainedQuote: quote,
          sourceStart: span.start,
          sourceEnd: span.end,
        });
        warn(
          `Scene ${item.number}, cue ${cueIndex + 1}: an abbreviated model quote was repaired to one exact contiguous source excerpt. Review that excerpt before accepting the cue.`,
        );
      }
      if (span.repeated) grounding.repeatedCueCount++;
      if (quote !== cue.quote) grounding.normalizedCueCount++;
      requirements.push({
        id: `req-${slug(item.number) || index + 1}-${cueIndex + 1}`,
        characterId: character.id,
        text: cue.explicit ? quote : cue.suggestion || quote,
        explicit: cue.explicit,
        sourceStart: span.start,
        sourceEnd: span.end,
        reviewed: false,
      });
    }
    const existing = project.scenes.find(
      (scene) => scene.number === item.number,
    );
    let id = existing?.id || `scene-${slug(item.number) || index + 1}`;
    if (sceneIds.has(id)) id += `-${index + 1}`;
    sceneIds.add(id);
    grounding.groundedCueCount += requirements.length;
    return {
      id,
      number: item.number,
      title: item.title,
      heading,
      storyDay: item.storyDay ?? 1,
      storyDaySource: item.storyDay === null ? "unspecified" : "script",
      characterIds: [...new Set(characterIds)],
      lookIds: [],
      requirements,
      sourceStart: start,
      sourceEnd,
      reviewed: false,
    };
  });
  grounding.droppedCueCount =
    grounding.modelCueCount - grounding.groundedCueCount;
  if (grounding.droppedCueCount)
    warn(
      `${grounding.droppedCueCount} of ${grounding.modelCueCount} suggested cues were ungrounded and omitted. The remaining draft is available for review.`,
    );
  if (grounding.repeatedCueCount)
    warn(
      `${grounding.repeatedCueCount} repeated quotations use their first source occurrence within the scene.`,
    );
  return { scenes, characters, notices, grounding };
}
