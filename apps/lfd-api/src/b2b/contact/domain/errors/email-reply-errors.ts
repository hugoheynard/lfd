import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Une réponse par e-mail sans l'identifiant du message reçu : c'est lui qui
 * rend la réception idempotente, et sans lui un rejeu de Resend rangerait
 * deux fois la même réponse.
 */
export class EmailReplyMessageIdMissingError extends DomainError {
  constructor() {
    super(
      "contact.email_reply.message_id_missing",
      "Une réponse reçue par e-mail doit porter l'identifiant du message chez Resend : sans lui, rien n'est rangé. Vérifier la charge du webhook `email.received`.",
    );
  }
}

/**
 * Un motif posé par le système (« Réponse à un e-mail ») ne se crée, ne se
 * révise ni ne s'archive à l'écran : la migration le pose, et la réception
 * des e-mails le cite par son identifiant.
 */
export class SystemRequestReasonLockedError extends BusinessError {
  constructor() {
    super(
      "contact.reason.system_locked",
      "Le motif « Réponse à un e-mail » est posé par le système : il ne se crée, ne se modifie ni ne s'archive depuis cet écran. Les réponses des clients s'y rangent d'elles-mêmes.",
    );
  }
}

/**
 * Le motif système des réponses par e-mail manque en base : la migration
 * `20261028230100_la_reponse_par_e_mail` le pose. La réponse n'est pas
 * perdue — le webhook échoue, et Resend le rejouera.
 */
export class SystemReasonMissingError extends TechnicalError {
  constructor(reasonId: string) {
    super(
      "contact.email_reply.system_reason_missing",
      `Le motif système « ${reasonId} » (Réponse à un e-mail) est absent de la base : appliquer la migration 20261028230100_la_reponse_par_e_mail. Resend rejouera la réponse reçue.`,
    );
  }
}
