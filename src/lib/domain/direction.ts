import type { ChangeImpact, Production } from "../types";

/** Checks current intent against explicit removed references, including after adoption. */
export function getCreativeReferenceFlags(
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
