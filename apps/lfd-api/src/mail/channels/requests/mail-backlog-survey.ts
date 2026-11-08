/**
 * Ce que la veille du courrier sait dire, en chiffres prêts à afficher (plan
 * `documentation/mail/plan-service-e-mails.md`, § 25).
 */
export interface MailBacklogSummary {
  /** Les demandes encore en attente au-delà du seuil (15 min). */
  readonly stalled: number;
  /** L'âge, en minutes, de la plus vieille ; `null` s'il n'y en a pas. */
  readonly oldestStalledMinutes: number | null;
  /** Les échecs définitifs des dernières 24 h. */
  readonly definitiveFailures: number;
  /** Le seuil au-delà duquel une demande est dite coincée, en minutes. */
  readonly stalledAfterMinutes: number;
}

/**
 * **La veille du courrier, en lecture** : déclarée et implémentée par le bloc
 * `mail`, lue par la carte de santé à travers un port qu'`ops` déclare et que
 * `appBootstrap` relie. Le bloc ne sait pas qui la lit.
 */
export abstract class MailBacklogSurvey {
  abstract read(): Promise<MailBacklogSummary>;
}
