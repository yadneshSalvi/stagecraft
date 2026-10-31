/** Gemini may reject otherwise valid nested bounds as an over-complex schema.
 * Remove provider-only bounds without mutating the strict application schema. */
export function simplifyGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplifyGeminiSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "maxItems",
              "minItems",
              "maximum",
              "minimum",
              "maxLength",
              "minLength",
            ].includes(key),
        )
        .map(([key, child]) => [key, simplifyGeminiSchema(child)]),
    );
  return value;
}
