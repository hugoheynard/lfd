/**
 * Conversion **heure locale d'Europe/Paris ↔ instant UTC**, en fonctions pures.
 *
 * Pourquoi ici et pas dans `infra/` : c'est une règle **métier** (« les horaires
 * du commercial sont ceux de Paris »), déterministe et sans I/O. Elle se teste
 * sans Nest, sans base et sans horloge.
 *
 * Pourquoi pas une lib : `Intl` porte déjà la base de fuseaux de Node. Une
 * dépendance de plus n'apporterait ici que du poids.
 *
 * Les deux pièges du sujet, traités explicitement :
 * - **Heure d'été (mars)** — 02:30 n'existe pas ce jour-là. `localToInstant`
 *   rend `null` plutôt qu'un instant décalé en silence ; l'appelant saute le
 *   créneau (cf. `slotsFor`).
 * - **Heure d'hiver (octobre)** — 02:30 existe deux fois. On retient la
 *   **première** occurrence (convention : l'offset d'avant le basculement).
 */

/** Le seul fuseau du métier. Les horaires saisis par le commercial sont les siens. */
export const BUSINESS_TIME_ZONE = "Europe/Paris";

const MINUTE_MS = 60 * 1000;

/** Une lecture locale : le jour (`AAAA-MM-JJ`) et l'heure (`HH:MM`). */
export interface LocalMoment {
  readonly day: string;
  readonly time: string;
}

const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Les composantes locales d'un instant, en nombres. */
interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** Décompose un instant en composantes **locales** via `Intl` (pas de lib de dates). */
function partsOf(instant: Date): LocalParts {
  const found = new Map<string, string>();
  for (const part of FORMATTER.formatToParts(instant)) {
    found.set(part.type, part.value);
  }
  const read = (key: string): number => Number(found.get(key) ?? "0");
  // `hour: "2-digit"` en hour12:false rend « 24 » à minuit sur certains runtimes.
  const hour = read("hour") % 24;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Décalage local − UTC, en minutes, **à cet instant précis** (donc DST-exact). */
function offsetMinutesAt(instant: Date): number {
  const p = partsOf(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - instant.getTime()) / MINUTE_MS;
}

/** La lecture locale (jour + heure) d'un instant. */
export function instantToLocal(instant: Date): LocalMoment {
  const p = partsOf(instant);
  return { day: formatDay(p.year, p.month, p.day), time: formatTime(p.hour, p.minute) };
}

/**
 * L'instant correspondant à une heure locale de Paris — ou `null` si cette heure
 * **n'existe pas** (le jour du passage à l'heure d'été).
 *
 * Deux passes : on estime l'offset à partir d'une lecture naïve, on corrige, puis
 * on **vérifie** en reconvertissant. C'est cette vérification qui détecte les
 * heures inexistantes, plutôt que de rendre un instant faux sans le dire.
 */
export function localToInstant(day: string, time: string): Date | null {
  const naive = naiveUtc(day, time);
  if (naive === null) {
    return null;
  }
  const firstGuess = new Date(naive - offsetMinutesAt(new Date(naive)) * MINUTE_MS);
  const candidate = new Date(naive - offsetMinutesAt(firstGuess) * MINUTE_MS);
  if (!matches(candidate, day, time)) {
    return null;
  }
  // Heure ambiguë (bascule d'octobre) : la même heure locale existe une heure
  // plus tôt. On retient la **première** occurrence — convention usuelle, et la
  // seule qui soit stable quel que soit le chemin d'estimation.
  const earlier = new Date(candidate.getTime() - 60 * MINUTE_MS);
  return matches(earlier, day, time) ? earlier : candidate;
}

/** L'instant se relit-il exactement comme la lecture locale demandée ? */
function matches(instant: Date, day: string, time: string): boolean {
  const back = instantToLocal(instant);
  return back.day === day && back.time === time;
}

/** Ajoute des minutes à un instant (sans muter l'original). */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}

/** Ajoute des jours **calendaires** à un jour local `AAAA-MM-JJ`. */
export function addDays(day: string, days: number): string {
  const parts = day.split("-").map(Number);
  const [year, month, dayOfMonth] = parts;
  if (year === undefined || month === undefined || dayOfMonth === undefined) {
    return day;
  }
  const shifted = new Date(Date.UTC(year, month - 1, dayOfMonth + days));
  return formatDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Le jour de la semaine (0 = dimanche … 6 = samedi) d'un jour local. */
export function weekdayOf(day: string): number {
  const parts = day.split("-").map(Number);
  const [year, month, dayOfMonth] = parts;
  if (year === undefined || month === undefined || dayOfMonth === undefined) {
    return 0;
  }
  return new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
}

/** `HH:MM` en minutes depuis minuit — l'unité de calcul des règles. */
export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** L'inverse : des minutes depuis minuit vers `HH:MM`. */
export function timeOfMinutes(minutes: number): string {
  return formatTime(Math.floor(minutes / 60), minutes % 60);
}

/** L'instant UTC d'une lecture locale **prise au pied de la lettre** (sans fuseau). */
function naiveUtc(day: string, time: string): number | null {
  const dayParts = day.split("-").map(Number);
  const [year, month, dayOfMonth] = dayParts;
  const [hours, minutes] = time.split(":").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    dayOfMonth === undefined ||
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(year + month + dayOfMonth + hours + minutes)
  ) {
    return null;
  }
  return Date.UTC(year, month - 1, dayOfMonth, hours, minutes);
}

function formatDay(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function formatTime(hour: number, minute: number): string {
  return `${pad(hour, 2)}:${pad(minute, 2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
