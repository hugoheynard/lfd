/**
 * Le décompte des e-mails **acceptés par le fournisseur** sur une fenêtre,
 * rangés par retour (`documentation/mail/le-suivi-des-e-mails.md`, T1b).
 *
 * N'y entrent ni la sonde de déploiement (`outOfEditor`), ni le mode à blanc
 * (rien n'est parti), ni une demande que Resend n'a pas prise.
 */
export interface MailDeliveryFigures {
  /** Acceptés, sans retour du fournisseur à ce stade. */
  readonly awaitingReturn: number;
  readonly delayed: number;
  readonly delivered: number;
  readonly bounced: number;
  readonly complained: number;
  /** Le modèle aux rebonds et plaintes les plus nombreux ; `null` s'il n'y en a aucun. */
  readonly mostRejectedTemplate: string | null;
}

/**
 * **Le port d'où la carte de santé lit le suivi des e-mails** (T1b, règle 5).
 *
 * `platform` le DÉCLARE, le bloc `mail` l'implémente sur `mail.mail_request`,
 * `appBootstrap` les relie : `ops` n'importe que `platform`, et le bloc ne
 * sait pas qui le regarde. Remplace la lecture d'`ops.mail_send`, qui n'est
 * plus écrite.
 */
export abstract class MailDeliveryTally {
  /** Les e-mails acceptés depuis `since`, par retour. */
  abstract read(since: Date): Promise<MailDeliveryFigures>;
}
