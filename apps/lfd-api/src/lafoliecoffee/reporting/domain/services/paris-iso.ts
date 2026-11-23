import { instantToLocal } from "@lfd/contracts";

const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const MINUTES_PER_HOUR = 60;

/**
 * **Un instant en ISO 8601 à l'heure de Paris, avec son décalage**
 * (`2026-11-03T08:41:00+01:00`) : la Direction lit l'heure de la boutique, et
 * le décalage rend l'instant exact sans qu'elle connaisse les bascules
 * d'heure d'été. Précision à la seconde.
 */
export function parisIso(instant: Date): string {
  const atSecond = new Date(Math.floor(instant.getTime() / SECOND_MS) * SECOND_MS);
  return isoAt(atSecond, atSecond.getUTCSeconds());
}

/**
 * {@link parisIso} **tronqué à la minute** — l'heure de passation d'une
 * commande : croisée au jour, au mode et aux articles, une heure à la seconde
 * désignerait plus facilement un habitué (plan de l'export, § 7).
 */
export function parisIsoToMinute(instant: Date): string {
  return isoAt(new Date(Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS), 0);
}

/** `seconds` est celle de l'UTC : un décalage de fuseau compte des minutes entières. */
function isoAt(instant: Date, seconds: number): string {
  const local = instantToLocal(instant);
  const minuteOfInstant = Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS;
  const offset = Math.round(
    (Date.parse(`${local.day}T${local.time}:00Z`) - minuteOfInstant) / MINUTE_MS,
  );
  return `${local.day}T${local.time}:${pad(seconds)}${offsetLabel(offset)}`;
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / MINUTES_PER_HOUR))}:${pad(absolute % MINUTES_PER_HOUR)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
