/** Ce que la trace d'une révélation dit de l'envoi — jamais l'adresse. */
export interface MailSendSubject {
  readonly template: string;
  readonly space: string;
}

/** Port de l'existence d'un envoi et de son modèle, pour la commande de révélation. */
export abstract class MailSendSubjects {
  /** `null` : l'envoi n'est pas au suivi. */
  abstract subjectOf(sendId: string): Promise<MailSendSubject | null>;
}
