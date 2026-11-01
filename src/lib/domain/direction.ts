import type {
  ChangeImpact,
  DirectionReferenceAcknowledgement,
  DirectionReferenceReview,
  Production,
} from "../types";
import { fingerprint } from "./hash";

/** Checks current intent against explicit removed references, including after adoption. */
function findCreativeReferenceFlags(
  production: Production,
  lookIds: string[],
  removedUnitIds: string[],
): NonNullable<ChangeImpact["creativeFlags"]> {
  const looks = production.looks.filter((look) => lookIds.includes(look.id));
  return production.characters
    .filter((character) =>
      looks.some((look) => look.characterId === character.id),
    )
    .flatMap((character) => {
      const text = [
        character.direction.text,
        ...character.direction.essential,
        ...character.direction.palette,
      ]
        .join(" ")
        .toLowerCase();
      return production.units
        .filter((unit) => removedUnitIds.includes(unit.id))
        .flatMap((unit) => {
          const references = [
            unit.name,
            unit.code,
            unit.color,
            unit.material,
          ].filter(
            (value) =>
              value.trim().length > 2 && text.includes(value.toLowerCase()),
          );
          return references.length
            ? [
                {
                  characterId: character.id,
                  unitId: unit.id,
                  references: [...new Set(references)],
                },
              ]
            : [];
        });
    });
}

/** A review target exists only after this exact physical reference was removed. */
export function getDirectionReferenceReview(
  production: Production,
  characterId: string,
  unitId: string,
): DirectionReferenceReview | undefined {
  const character = production.characters.find(
    (item) => item.id === characterId,
  );
  const unit = production.units.find((item) => item.id === unitId);
  if (!character || !unit) return undefined;
  const looks = production.looks
    .filter(
      (look) =>
        look.characterId === characterId &&
        look.removedUnitIds?.includes(unitId) &&
        !look.unitIds.includes(unitId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const lookIds = looks.map((look) => look.id);
  const flag = findCreativeReferenceFlags(production, lookIds, [unitId])[0];
  if (!flag) return undefined;
  const directionHash = fingerprint(character.direction);
  return {
    ...flag,
    lookIds,
    directionRevision: character.direction.revision,
    directionHash,
    sourceRevision: production.revision,
    referenceHash: fingerprint({
      contract: "stagecraft-direction-reference-v1",
      characterId,
      directionHash,
      unit: {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        color: unit.color,
        material: unit.material,
      },
      references: flag.references,
      looks: looks.map(
        ({ id, revision, sceneIds, unitIds, activeCandidateId }) => ({
          id,
          revision,
          sceneIds: [...sceneIds].sort(),
          unitIds: [...unitIds].sort(),
          activeCandidateId: activeCandidateId ?? null,
        }),
      ),
    }),
  };
}

export function getCurrentDirectionAcknowledgement(
  production: Production,
  characterId: string,
  unitId: string,
): DirectionReferenceAcknowledgement | undefined {
  const review = getDirectionReferenceReview(production, characterId, unitId);
  if (!review) return undefined;
  return [
    ...(production.characters.find((item) => item.id === characterId)
      ?.directionAcknowledgements ?? []),
  ]
    .reverse()
    .find(
      (acknowledgement) =>
        acknowledgement.characterId === characterId &&
        acknowledgement.unitId === unitId &&
        acknowledgement.directionRevision === review.directionRevision &&
        acknowledgement.directionHash === review.directionHash &&
        acknowledgement.referenceHash === review.referenceHash &&
        acknowledgement.acknowledgedRevision ===
          acknowledgement.sourceRevision + 1 &&
        acknowledgement.acknowledgedRevision <= production.revision &&
        !!acknowledgement.acknowledgedBy.trim() &&
        !!acknowledgement.rationale.trim(),
    );
}

/** An acknowledgement resolves only its exact current removed-reference scope. */
export function getCreativeReferenceFlags(
  production: Production,
  lookIds: string[],
  removedUnitIds: string[],
): NonNullable<ChangeImpact["creativeFlags"]> {
  return findCreativeReferenceFlags(production, lookIds, removedUnitIds).filter(
    (flag) => {
      const acknowledgement = getCurrentDirectionAcknowledgement(
        production,
        flag.characterId,
        flag.unitId,
      );
      return (
        !acknowledgement ||
        production.looks
          .filter(
            (look) =>
              lookIds.includes(look.id) &&
              look.characterId === flag.characterId,
          )
          .some((look) => !acknowledgement.lookIds.includes(look.id))
      );
    },
  );
}

export function getCurrentCreativeReferenceFlags(
  production: Production,
): NonNullable<ChangeImpact["creativeFlags"]> {
  const flags = production.looks.flatMap((look) =>
    getCreativeReferenceFlags(
      production,
      [look.id],
      (look.removedUnitIds ?? []).filter((id) => !look.unitIds.includes(id)),
    ),
  );
  return [
    ...new Map(
      flags.map((flag) => [`${flag.characterId}:${flag.unitId}`, flag]),
    ).values(),
  ];
}
