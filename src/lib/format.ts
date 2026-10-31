import type { Provenance } from "./types";
export const money = (cents: number, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
export const day = (value: string, timeZone = "Europe/London") =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(value));
export const time = (value: string, timeZone = "Europe/London") =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
export const dateTime = (value: string, timeZone = "Europe/London") =>
  `${day(value, timeZone)} · ${time(value, timeZone)}`;
export const revision = (value: number) => `R${String(value).padStart(2, "0")}`;
export const provenanceLabel = (value: Provenance) =>
  ({
    synthetic: "Synthetic example",
    recorded_provider: "Recorded YouCam preview",
    live_provider: "YouCam preview",
    manual: "Manually recorded",
    observed: "Observed evidence",
    ai_suggestion: "AI suggestion",
  })[value];
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
