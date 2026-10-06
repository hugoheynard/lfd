import { minutesOfDay, weekdayOf } from "@lfd/contracts";

import type { CloseSettingsValues } from "../entities/production-close-settings.js";
import type { AutoCloseOutcome } from "../ports/auto-close-attempts.js";

/**
 * **Le tour de l'arrêt du plan** — ce que le passage du cron (toutes les cinq minutes) décide pour
 * le lendemain (plan `documentation/production/arret-du-plan.md`, §3, §4,
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
  /** La tentative automatique tracée pour cette journée (B2), ou `null`. */
  readonly attempt: AttemptTrace | null;
}

/** Une tentative d'arrêt automatique telle que la trace la garde. */
export interface AttemptTrace {
  readonly outcome: AutoCloseOutcome;
  readonly attemptedAt: Date;
}

/**
 * Au-delà, une tentative encore `pending` est tenue pour morte (Q8, Hugo,
 * 2026-10-06) : une clôture vivante se tranche en quelques secondes, et le
 * cron repasse toutes les cinq minutes — quinze minutes, c'est trois tours
 * sans issue écrite, donc un processus tombé entre la prise et l'issue.
 */
export const STALLED_ATTEMPT_AFTER_MS = 15 * 60 * 1000;

/** La tentative est-elle restée `pending` plus de quinze minutes ? */
export function attemptStalled(attempt: AttemptTrace, now: Date): boolean {
  return (
    attempt.outcome === "pending" &&
    now.getTime() - attempt.attemptedAt.getTime() > STALLED_ATTEMPT_AFTER_MS
  );
}

/** L'arrêt automatique n'a pas abouti : il a échoué, ou il est resté en suspens. */
export function attemptNeedsHand(attempt: AttemptTrace, now: Date): boolean {
  return attempt.outcome === "failed" || attemptStalled(attempt, now);
}

/**
 * - `nothing` : rien à faire pour le lendemain ;
 * - `attempt_close` : mode automatique, l'heure est passée — tenter l'arrêt,
 *   une seule fois (la trace tranche entre deux instances) ;
 * - `alert_if_orders` : mode manuel, l'heure d'alerte est passée — prévenir,
 *   si le lendemain porte des commandes ;
 * - `alert_stalled` : la tentative est restée `pending` plus de quinze
 *   minutes (Q8) — prévenir qu'il faut arrêter à la main. Pas de retentative :
 *   on ne sait pas jusqu'où la tentative morte est allée chez Stripe.
 */
export type TomorrowStep = "nothing" | "attempt_close" | "alert_if_orders" | "alert_stalled";

/**
 * Le pas du tour pour le lendemain.
 *
 * L'heure courante est comparée à l'heure réglée, toutes deux `HH:MM` de la
 * maison : avant l'heure, rien. `close_at` ≤ 23:55 (garanti par l'agrégat, S4)
 * laisse au moins un tour du cron dans la journée.
 */
export function tomorrowStep(
  settings: CloseSettingsValues,
  moment: { readonly time: string; readonly now: Date },
  tomorrow: TomorrowState,
): TomorrowStep {
  if (tomorrow.isClosedDay || tomorrow.isPlanClosed) {
    return "nothing";
  }
  if (tomorrow.attempt !== null && attemptStalled(tomorrow.attempt, moment.now)) {
    return "alert_stalled";
  }
  if (settings.mode === "auto") {
    return tomorrow.attempt === null && armed(settings, moment.time) ? "attempt_close" : "nothing";
  }
  return armed(settings, moment.time) ? "alert_if_orders" : "nothing";
}

/**
 * L'heure qui compte pour le lendemain est-elle passée ? `close_at` en
 * automatique, `alert_at` en manuel — le même seuil pour le tour (A2) et pour
 * l'état du prévisionnel (A3), qui ne le recopient pas.
 */
export function armed(settings: CloseSettingsValues, time: string): boolean {
  return reached(time, settings.mode === "auto" ? settings.closeAt : settings.alertAt);
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
