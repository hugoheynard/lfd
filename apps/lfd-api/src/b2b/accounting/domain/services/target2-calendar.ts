import { addDays, weekdayOf } from "@lfd/contracts";

/**
 * **Le calendrier TARGET2** — les jours où le système de règlement de l'Euro
 * est ouvert, et donc ceux où une échéance SEPA peut tomber.
 *
 * Fermé le samedi, le dimanche, le 1er janvier, le Vendredi saint, le lundi de
 * Pâques, le 1er mai, le 25 et le 26 décembre (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, § 3). Ce ne sont
 * PAS les fériés français : le 14 juillet ou le 15 août sont des jours ouvrés
 * TARGET2, et une banque française y règle.
 *
 * Fonction pure, sans port : les fêtes mobiles se calculent (Pâques), les
 * autres sont fixes. Une liste d'années écrites à la main finirait par
 * s'arrêter un 31 décembre sans que rien ne le dise.
 *
 * Les jours sont des jours LOCAUX `AAAA-MM-JJ` — jamais un instant : une
 * échéance est une date, et la passer par un `Date` la ferait glisser d'un
 * jour selon le fuseau.
 */

const SATURDAY = 6;
const SUNDAY = 0;

/** Les fermetures à date fixe, en `MM-JJ`. */
const FIXED_CLOSINGS: ReadonlySet<string> = new Set(["01-01", "05-01", "12-25", "12-26"]);

/** Vendredi saint = Pâques − 2 ; lundi de Pâques = Pâques + 1. */
const GOOD_FRIDAY_OFFSET = -2;
const EASTER_MONDAY_OFFSET = 1;

/**
 * Le dimanche de Pâques (grégorien) d'une année — algorithme anonyme dit de
 * Meeus/Jones/Butcher, la forme corrigée de celui de Gauss, exacte pour toute
 * année grégorienne.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** TARGET2 est-il ouvert ce jour-là ? */
export function isTarget2BusinessDay(day: string): boolean {
  const weekday = weekdayOf(day);
  if (weekday === SATURDAY || weekday === SUNDAY) {
    return false;
  }
  if (FIXED_CLOSINGS.has(day.slice(5))) {
    return false;
  }
  const easter = easterSunday(Number(day.slice(0, 4)));
  return (
    day !== addDays(easter, GOOD_FRIDAY_OFFSET) && day !== addDays(easter, EASTER_MONDAY_OFFSET)
  );
}

/** Ce jour s'il est ouvré, sinon le premier jour ouvré qui suit. */
export function onOrAfterBusinessDay(day: string): string {
  let candidate = day;
  while (!isTarget2BusinessDay(candidate)) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

/** Le `count`-ième jour ouvré AVANT ce jour (ce jour exclu). */
export function businessDaysBefore(day: string, count: number): string {
  let candidate = day;
  let remaining = count;
  while (remaining > 0) {
    candidate = addDays(candidate, -1);
    if (isTarget2BusinessDay(candidate)) {
      remaining -= 1;
    }
  }
  return candidate;
}
