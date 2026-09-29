/**
 * Une **heure de journée** `HH:MM`, heure de Paris — jamais un instant. Le
 * calcul de tournée compte en minutes (ou secondes) depuis minuit : les
 * fenêtres du carnet et l'heure de départ au plus tôt parlent la même langue.
 */

const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** `HH:MM` → minutes depuis minuit ; `null` si ce n'est pas une heure. */
export function minutesOfDay(value: string): number | null {
  const match = CLOCK_TIME.exec(value);
  if (match === null) {
    return null;
  }
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/**
 * Minutes depuis minuit → `HH:MM`. Au-delà de minuit, l'heure reprend à
 * `00:00` : une tournée qui finit à 00:40 le dit ainsi.
 */
export function clockTimeOf(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / MINUTES_PER_HOUR);
  const rest = wrapped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
