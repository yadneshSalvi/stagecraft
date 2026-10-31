/** An expected, actionable domain rejection. No state has changed when thrown. */
export class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export function requireFact(
  condition: unknown,
  code: string,
  message: string,
  status = 422,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}

export function findRecord<T extends { id: string }>(
  records: T[],
  id: string,
  label: string,
): T {
  const record = records.find((candidate) => candidate.id === id);
  if (!record)
    throw new DomainError("NOT_FOUND", `${label} ${id} was not found.`, 404);
  return record;
}
