/** Le compte rendu d'un passage du balayeur des e-mails. */
export interface MailSweepReport {
  /** Les demandes en retard lues (au plus un lot). */
  readonly examined: number;
  readonly sent: number;
  readonly refused: number;
  /** Échec technique : la demande reste reprenable, ou le deviendra au prochain passage. */
  readonly failed: number;
  /** Un envoi de même clé encore en cours chez Resend : la demande reste `sending`. */
  readonly inFlight: number;
  /** Au-delà de 23 h ou du plafond : passées `failed` sans renvoi, un humain décide. */
  readonly abandoned: number;
  /** Le fait d'origine introuvable : rien n'est renvoyé, la demande reste en l'état. */
  readonly missingFact: number;
}

/**
 * Balayer les envois différés en retard (plan `plan-service-e-mails.md`,
 * § 8, point 3) : au cron `*\/5` du Worker, comme la boîte d'envoi.
 */
export class SweepMailRequestsCommand {}
