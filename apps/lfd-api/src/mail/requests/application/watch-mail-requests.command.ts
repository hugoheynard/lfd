/** Le compte rendu d'un passage de la veille. */
export interface MailWatchReport {
  readonly stalled: number;
  readonly oldestStalledMinutes: number | null;
  readonly definitiveFailures: number;
  /** Les cas présentés à la cloche à ce passage ; elle les dédoublonne par heure. */
  readonly alarms: readonly ("stalled" | "failed")[];
  /** Les modèles rebondis ou signalés depuis hier (T1b) ; la cloche sonne une fois par rebond le plus récent. */
  readonly rejectedTemplates: readonly string[];
}

/**
 * Veiller sur le courrier différé (plan `plan-service-e-mails.md`, § 25) : au
 * cron `*\/5` du Worker, juste après le balayeur. Sonne la cloche du
 * back-office — jamais par e-mail : c'est ce qui serait en panne.
 */
export class WatchMailRequestsCommand {}
