/** Le compte rendu d'un passage de la veille. */
export interface MailWatchReport {
  readonly stalled: number;
  readonly oldestStalledMinutes: number | null;
  readonly definitiveFailures: number;
  /** Les cas présentés à la cloche à ce passage ; elle les dédoublonne par heure. */
  readonly alarms: readonly ("stalled" | "failed")[];
}

/**
 * Veiller sur le courrier différé (plan `plan-service-e-mails.md`, § 25) : au
 * cron `*\/5` du Worker, juste après le balayeur. Sonne la cloche du
 * back-office — jamais par e-mail : c'est ce qui serait en panne.
 */
export class WatchMailRequestsCommand {}
