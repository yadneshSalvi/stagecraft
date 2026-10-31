import type { Production } from "./types";

/** A suggested custody window includes recorded prep and allocated use, never an invented transport buffer. */
export function suggestedSourcingWindow(
  production: Production,
  unitIds: string[] = [],
): { from: string; to: string } | null {
  const starts: number[] = [],
    ends: number[] = [];
  for (const call of production.occurrences) {
    const looks = production.looks.filter(
      (look) =>
        look.sceneIds.includes(call.sceneId) &&
        (!unitIds.length || look.unitIds.some((id) => unitIds.includes(id))),
    );
    if (unitIds.length && !looks.length) continue;
    const preparation = Math.max(
      0,
      ...looks.map((look) => look.preparationMinutes ?? 0),
    );
    starts.push(Date.parse(call.start) - preparation * 60_000);
    ends.push(Date.parse(call.end));
  }
  for (const assignment of production.allocations) {
    if (
      assignment.state !== "allocated" ||
      (unitIds.length && !unitIds.includes(assignment.unitId))
    )
      continue;
    starts.push(Date.parse(assignment.start));
    ends.push(Date.parse(assignment.end));
  }
  const finiteStarts = starts.filter(Number.isFinite),
    finiteEnds = ends.filter(Number.isFinite);
  if (!finiteStarts.length || !finiteEnds.length) return null;
  return {
    from: new Date(Math.min(...finiteStarts)).toISOString(),
    to: new Date(Math.max(...finiteEnds)).toISOString(),
  };
}
