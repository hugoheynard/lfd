/**
 * Les relevés de la veille du courrier, tels que la carte de santé les
 * affiche (plan `documentation/mail/plan-service-e-mails.md`,
 * § 25, point 3).
 */
export interface MailBacklogFigures {
  /** Les demandes encore en attente au-delà du seuil. */
  readonly stalled: number;
  /** L'âge, en minutes, de la plus vieille ; `null` s'il n'y en a pas. */
  readonly oldestStalledMinutes: number | null;
  /** Les échecs définitifs des dernières 24 h. */
  readonly definitiveFailures: number;
  /** Le seuil au-delà duquel une demande est dite coincée, en minutes. */
  readonly stalledAfterMinutes: number;
}

/**
 * Port **MailBacklogReadings** — d'où OPS tire la veille du courrier différé.
 *
 * Déclaré ici parce qu'`ops` n'importe que `platform` : c'est
 * `appBootstrap/mail-backlog-readings.module.ts` qui le relie au canal du bloc
 * `mail`. Le bloc ne sait pas qu'on le regarde.
 */
export abstract class MailBacklogReadings {
  abstract read(): Promise<MailBacklogFigures>;
}
