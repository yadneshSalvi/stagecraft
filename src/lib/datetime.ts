/** Convert a scheduled occurrence to a datetime-local field in the production zone. */
export function toLocalDateTime(value: string, timeZone: string): string {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    values.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function fromLocalDateTime(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid date and time.");
  const target = Date.parse(`${value}:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const represented = Date.parse(
      `${toLocalDateTime(new Date(instant).toISOString(), timeZone)}:00Z`,
    );
    instant += target - represented;
  }
  const iso = new Date(instant).toISOString();
  if (toLocalDateTime(iso, timeZone) !== value)
    throw new Error(
      "That local time does not exist because the clocks change. Choose another time.",
    );
  return iso;
}
