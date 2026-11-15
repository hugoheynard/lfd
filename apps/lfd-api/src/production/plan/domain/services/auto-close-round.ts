import { instantToLocal, weekdayOf } from "@lfd/contracts";

import type { AutoCloseOutcome } from "../ports/auto-close-attempts.js";

/**
 * **Le tour de l'arrêt du plan** — ce que le passage du cron (toutes les cinq
 * minutes) décide pour une journée (plan `documentation/fournil/arret-du-plan.md`).
 *
 * Depuis le 2026-10-21, il n'y a plus de mode : le plan d'une journée s'arrête
 * TOUJOURS seul, à la fin du rattrapage de l'heure limite générale pour elle
 * (`planClosesAt`, `limites-de-commande/plan-une-seule-heure.md` §5). Plus
 * d'heure d'arrêt à part, plus d'alerte du soir.
 *
 * Pur : l'instant d'arrêt et l'état des journées arrivent lus.
 */

/** Ce que l'on sait d'une journée à arrêter au moment du tour. */
export interface PendingDayState {
  /** Un jour fermé du fournil (Q6) : ni arrêt, ni alerte. */
  readonly isClosedDay: boolean;
  /** Le plan est déjà arrêté — par un tour précédent, ou à la main après l'heure. */
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
 * - `nothing` : rien à faire pour cette journée ;
 * - `attempt_close` : l'instant d'arrêt est passé — tenter l'arrêt, une seule
 *   fois (la trace tranche entre deux instances) ;
 * - `alert_stalled` : la tentative est restée `pending` plus de quinze
 *   minutes (Q8) — prévenir qu'il faut arrêter à la main. Pas de retentative :
 *   on ne sait pas jusqu'où la tentative morte est allée chez Stripe.
 */
export type CloseStep = "nothing" | "attempt_close" | "alert_stalled";

/** Le pas du tour pour une journée, à l'instant `now`. */
export function closeStep(closesAt: Date | null, now: Date, day: PendingDayState): CloseStep {
  if (day.isClosedDay || day.isPlanClosed) {
    return "nothing";
  }
  if (day.attempt !== null && attemptStalled(day.attempt, now)) {
    return "alert_stalled";
  }
  return day.attempt === null && closeDue(closesAt, now) ? "attempt_close" : "nothing";
}

/**
 * L'instant d'arrêt est-il passé ? Le même seuil pour le tour, pour l'état du
 * prévisionnel et pour le refus d'un arrêt anticipé — ils ne le recopient pas.
 * Sans instant (aucune heure limite posée), jamais.
 */
export function closeDue(closesAt: Date | null, now: Date): boolean {
  return closesAt !== null && now.getTime() >= closesAt.getTime();
}

/**
 * Le plan d'AUJOURD'HUI s'arrête-t-il tout seul aujourd'hui ? Oui quand son
 * instant d'arrêt tombe dans la journée même — une heure limite « le jour
 * même », ou un rattrapage qui passe minuit. Sinon, son arrêt était hier, et
 * un plan d'aujourd'hui encore ouvert relève du rattrapage (S4) : on prévient,
 * on n'arrête pas d'office une fournée déjà au four.
 */
export function closesOnItsOwnDay(closesAt: Date | null, today: string): boolean {
  return closesAt !== null && instantToLocal(closesAt).day === today;
}

/**
 * Le rattrapage (S4) : le plan d'AUJOURD'HUI n'est pas arrêté et porte des
 * commandes, alors que son arrêt tombait avant aujourd'hui. Il n'est pas
 * arrêté automatiquement — la fournée est déjà au four —, on prévient
 * seulement (cf. {@link closesOnItsOwnDay}).
 */
export function todayNeedsCatchUp(isPlanClosed: boolean, orderCount: number): boolean {
  return !isPlanClosed && orderCount > 0;
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
