import { MAIL_RESUME_WINDOW_MS, MAX_MAIL_ATTEMPTS } from "../entities/mail-request.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Au-delà de cet âge, une demande encore `requested` ou `sending` est
 * **coincée** (plan `plan-service-e-mails.md`, § 25). Plus long que le délai
 * de reprise du balayeur (10 min) : une demande que le balayeur peut encore
 * reprendre au prochain passage n'est pas une panne.
 */
export const MAIL_STALLED_AFTER_MS = 15 * MINUTE_MS;

/** La fenêtre sur laquelle on compte les échecs définitifs : depuis hier. */
export const MAIL_FAILURES_WINDOW_MS = 24 * HOUR_MS;

/** À partir de combien d'échecs définitifs on sonne : un seul suffit. */
export const MAIL_FAILURES_ALARM_THRESHOLD = 1;

/** Ce que la veille demande à la base, calculé à partir de l'instant présent. */
export interface MailBacklogCriteria {
  /** Une demande encore en attente, demandée avant cet instant, est coincée. */
  readonly stalledBefore: Date;
  /** Les échecs comptés sont survenus depuis cet instant. */
  readonly failedSince: Date;
  /**
   * Un échec dont la première tentative différée précède cet instant n'est
   * plus reprenable — même règle que `MailRequest.canResume`.
   */
  readonly resumableSince: Date;
  /** Le plafond d'essais : un échec qui l'a atteint ne repart plus. */
  readonly maxAttempts: number;
}

/** Les relevés de la veille, tels que la base les rend. */
export interface MailBacklog {
  /** Les demandes coincées (`requested` ou `sending`, plus vieilles que le seuil). */
  readonly stalled: number;
  /** L'instant de demande de la plus vieille d'entre elles ; `null` s'il n'y en a pas. */
  readonly oldestStalledAt: Date | null;
  /** Les échecs DÉFINITIFS de la fenêtre : `failed` que le balayeur ne reprendra plus. */
  readonly definitiveFailures: number;
}

/** Une raison de sonner la cloche. */
export type MailBacklogAlarm =
  | { readonly kind: "stalled"; readonly count: number; readonly minutes: number }
  | { readonly kind: "failed"; readonly count: number };

/** Les critères de la veille à l'instant `now`. */
export function mailBacklogCriteria(now: Date): MailBacklogCriteria {
  return {
    stalledBefore: new Date(now.getTime() - MAIL_STALLED_AFTER_MS),
    failedSince: new Date(now.getTime() - MAIL_FAILURES_WINDOW_MS),
    resumableSince: new Date(now.getTime() - MAIL_RESUME_WINDOW_MS),
    maxAttempts: MAX_MAIL_ATTEMPTS,
  };
}

/** L'âge, en minutes entières, de la plus vieille demande coincée. */
export function oldestStalledMinutes(backlog: MailBacklog, now: Date): number | null {
  if (backlog.oldestStalledAt === null) {
    return null;
  }
  return Math.floor((now.getTime() - backlog.oldestStalledAt.getTime()) / MINUTE_MS);
}

/**
 * **Les raisons de sonner**, dans l'ordre où l'équipe doit les lire : la file
 * coincée d'abord (tout le courrier est touché), les échecs ensuite.
 *
 * Le seuil de la file est porté par la requête (`stalledBefore`) ; il est
 * revérifié ici sur l'âge, pour qu'un relevé incohérent ne sonne pas.
 */
export function mailBacklogAlarms(backlog: MailBacklog, now: Date): readonly MailBacklogAlarm[] {
  const alarms: MailBacklogAlarm[] = [];
  const minutes = oldestStalledMinutes(backlog, now);
  if (backlog.stalled > 0 && minutes !== null && minutes * MINUTE_MS >= MAIL_STALLED_AFTER_MS) {
    alarms.push({ kind: "stalled", count: backlog.stalled, minutes });
  }
  if (backlog.definitiveFailures >= MAIL_FAILURES_ALARM_THRESHOLD) {
    alarms.push({ kind: "failed", count: backlog.definitiveFailures });
  }
  return alarms;
}

/**
 * La clé anti-doublon d'une alarme : **une par cas et par heure** (UTC). La
 * veille passe toutes les cinq minutes ; sans elle, la cloche sonnerait douze
 * fois par heure pour la même panne.
 */
export function mailBacklogAlarmKey(alarm: MailBacklogAlarm, now: Date): string {
  return `mail.backlog.${alarm.kind}:${now.toISOString().slice(0, 13)}`;
}
