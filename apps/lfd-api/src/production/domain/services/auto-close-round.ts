import { minutesOfDay, weekdayOf } from "@lfd/contracts";

import type { CloseSettingsValues } from "../entities/production-close-settings.js";

/**
 * **Le tour de l'arrêt du plan** — ce que le passage du cron (toutes les cinq minutes) décide pour
 * le lendemain (plan `documentation/production/plan-arret-du-plan.md`, §3, §4,
 * B2, S4, lot A2).
 *
 * Pur : l'heure de la maison et l'état des journées arrivent lus. Le tour ne
 * décide que ce qu'il peut décider sans demander au commerce ; savoir si le
 * lendemain porte des commandes est la question qu'il ne pose que lorsqu'il
 * le faut (`alert_if_orders`), pour ne pas la poser toutes les cinq minutes.
 */

/** Ce que l'on sait du lendemain au moment du tour. */
export interface TomorrowState {
  /** Un jour fermé du fournil (Q6) : ni arrêt, ni alerte. */
  readonly isClosedDay: boolean;
  /** Le plan est déjà arrêté — à la main (arrêt anticipé) ou par un tour précédent. */
  readonly isPlanClosed: boolean;
  /** Une tentative automatique est déjà tracée pour cette journée (B2). */
  readonly attempted: boolean;
}

/**
 * - `nothing` : rien à faire pour le lendemain ;
 * - `attempt_close` : mode automatique, l'heure est passée — tenter l'arrêt,
 *   une seule fois (la trace tranche entre deux instances) ;
 * - `alert_if_orders` : mode manuel, l'heure d'alerte est passée — prévenir,
 *   si le lendemain porte des commandes.
 */
export type TomorrowStep = "nothing" | "attempt_close" | "alert_if_orders";

/**
 * Le pas du tour pour le lendemain.
 *
 * L'heure courante est comparée à l'heure réglée, toutes deux `HH:MM` de la
 * maison : avant l'heure, rien. `close_at` ≤ 23:55 (garanti par l'agrégat, S4)
 * laisse au moins un tour du cron dans la journée.
 */
export function tomorrowStep(
  settings: CloseSettingsValues,
  time: string,
  tomorrow: TomorrowState,
): TomorrowStep {
  if (tomorrow.isClosedDay || tomorrow.isPlanClosed) {
    return "nothing";
  }
  if (settings.mode === "auto") {
    return !tomorrow.attempted && reached(time, settings.closeAt) ? "attempt_close" : "nothing";
  }
  return reached(time, settings.alertAt) ? "alert_if_orders" : "nothing";
}

/**
 * Le rattrapage (S4) : le plan d'AUJOURD'HUI n'est pas arrêté et porte des
 * commandes. Il n'est jamais arrêté automatiquement — la fournée est déjà au
 * four —, on prévient seulement.
 */
export function todayNeedsCatchUp(isPlanClosed: boolean, orderCount: number): boolean {
  return !isPlanClosed && orderCount > 0;
}

/** L'heure réglée est-elle atteinte ? Une heure absente ne l'est jamais. */
function reached(time: string, setting: string | null): boolean {
  return setting !== null && minutesOfDay(time) >= minutesOfDay(setting);
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « mardi 7 octobre », « dimanche 1er février » — une journée dite comme l'équipe la dit. */
export function frenchDayLabel(day: string): string {
  const [, month, dayOfMonth] = day.split("-").map(Number);
  const weekday = WEEKDAYS[weekdayOf(day)] ?? "";
  const monthName = MONTHS[(month ?? 1) - 1] ?? "";
  const date = dayOfMonth === 1 ? "1er" : String(dayOfMonth ?? "");
  return `${weekday} ${date} ${monthName}`.trim();
}
