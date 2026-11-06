import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Une demande d'e-mail mal formée : l'appelant l'a construite de travers. */
export class InvalidMailRequestError extends DomainError {
  constructor(field: string, reason: string) {
    super(
      "MAIL_REQUEST_INVALID",
      `La demande d'e-mail est refusée : ${field} ${reason}. ` +
        "Corriger la demande chez l'appelant ; rien n'a été envoyé.",
    );
  }
}

/** Une marque que le service d'e-mails ne connaît pas (aujourd'hui : `lfc` seule). */
export class UnknownMailBrandError extends DomainError {
  constructor(brand: string) {
    super(
      "MAIL_BRAND_UNKNOWN",
      `La marque « ${brand} » n'est pas connue du service d'e-mails : rien n'a été envoyé. ` +
        "Les marques admises sont déclarées dans `mail-brand.ts`.",
    );
  }
}

/**
 * Une demande déjà close (envoyée ou refusée) ne repart pas : un second envoi
 * serait un doublon chez le destinataire.
 */
export class MailRequestAlreadySettledError extends BusinessError {
  constructor(idempotencyKey: string, status: string) {
    super(
      "MAIL_REQUEST_ALREADY_SETTLED",
      `La demande d'e-mail « ${idempotencyKey} » est déjà close (${status}) : elle ne repart pas. ` +
        "Pour un nouvel envoi, faire une nouvelle demande avec une autre clé d'idempotence.",
    );
  }
}

/**
 * Le fournisseur a refusé l'envoi pour une raison que réessayer ne changera
 * pas (adresse de réponse invalide…). Porte l'erreur d'origine en `cause`.
 */
export class MailRefusedError extends BusinessError {
  constructor(reason: string, cause?: unknown) {
    super(
      "MAIL_REFUSED",
      `L'e-mail a été refusé avant de partir : ${reason} ` +
        "Corriger la donnée en cause puis refaire le geste.",
      cause,
    );
  }
}

/**
 * `sendNow` appelé sous une unité de travail — le symétrique de
 * `DurableFactOutsideUnitOfWorkError` : l'e-mail partirait pour une écriture
 * qui peut encore être annulée. Une faute de programmation, d'où la catégorie.
 */
export class ImmediateMailInsideUnitOfWorkError extends TechnicalError {
  constructor(template: string) {
    super(
      "IMMEDIATE_MAIL_INSIDE_UNIT_OF_WORK",
      `L'e-mail « ${template} » a été envoyé tout de suite depuis une unité de travail : ` +
        "il partirait même si la transaction était annulée. Appeler `sendNow` APRÈS " +
        "`UnitOfWork.run`, ou `request` dans la transaction.",
    );
  }
}

/**
 * Un fait `mail.requested` livré sans sa ligne de suivi. Les deux s'écrivent
 * dans la même transaction : l'un sans l'autre est une anomalie, laissée
 * visible dans les messages morts plutôt qu'envoyée à l'aveugle.
 */
export class MailRequestMissingError extends TechnicalError {
  constructor(idempotencyKey: string) {
    super(
      "MAIL_REQUEST_MISSING",
      `La demande d'e-mail « ${idempotencyKey} » est arrivée sans sa ligne de suivi : ` +
        "rien n'est envoyé. Relever le message dans la carte de santé (messages morts).",
    );
  }
}

/** Un état rangé que ce binaire ne connaît pas : un schéma en avance sur le code. */
export class UnknownMailRequestStatusError extends TechnicalError {
  constructor(status: string) {
    super(
      "MAIL_REQUEST_STATUS_UNKNOWN",
      `État de demande d'e-mail inconnu : « ${status} ». ` +
        "Déployer le binaire qui connaît cet état avant de relire le suivi.",
    );
  }
}

/**
 * `request` appelé hors d'une unité de travail : la ligne de suivi serait
 * écrite sans le fait qui la fait partir.
 */
export class MailRequestOutsideUnitOfWorkError extends TechnicalError {
  constructor(template: string) {
    super(
      "MAIL_REQUEST_OUTSIDE_UNIT_OF_WORK",
      `La demande d'e-mail « ${template} » a été faite hors de toute unité de travail. ` +
        "L'envelopper dans UnitOfWork.run avec l'écriture qu'elle accompagne, " +
        "ou appeler `sendNow` pour un envoi immédiat.",
    );
  }
}
