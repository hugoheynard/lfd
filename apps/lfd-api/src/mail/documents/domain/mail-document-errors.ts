import type { MailDocumentViolation } from "@lfd/mail-blocks";

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/** L'e-mail demandé n'est pas au registre de cette version. */
export class UnknownMailTemplateError extends ResourceNotFoundError {
  constructor(template: string) {
    super(
      "MAIL_TEMPLATE_UNKNOWN",
      `L'e-mail « ${template} » n'existe pas dans cette version : il a été retiré ou renommé. Revenez à la liste des e-mails pour l'ouvrir de nouveau.`,
    );
  }
}

/**
 * Le document refusé par les règles du paquet (`validateMailDocument`,
 * `validateMailDocumentForPublication`). Le message reprend chaque refus,
 * écrit pour l'équipe ; la liste reste lisible par l'écran.
 */
export class MailDocumentRefusedError extends DomainError {
  constructor(
    template: string,
    gesture: "enregistré" | "publié" | "prévisualisé",
    readonly violations: readonly MailDocumentViolation[],
  ) {
    super(
      "MAIL_DOCUMENT_REFUSED",
      `L'arrangement de l'e-mail « ${template} » ne peut pas être ${gesture} : ${violations
        .map((violation) => violation.message)
        .join(" ")}`,
    );
  }
}

/** Quelqu'un a écrit ce document depuis que l'écran l'a lu. */
export class MailDocumentChangedError extends BusinessError {
  constructor(template: string) {
    super(
      "MAIL_DOCUMENT_CHANGED",
      `L'arrangement de l'e-mail « ${template} » a été modifié par quelqu'un d'autre pendant que vous l'aviez ouvert. Rechargez l'éditeur pour voir sa version, puis refaites votre modification.`,
    );
  }
}

/** « Publier » sans brouillon d'arrangement ni phrase en attente pour cet e-mail. */
export class NothingToPublishForMailError extends BusinessError {
  constructor(template: string) {
    super(
      "MAIL_DOCUMENT_NOTHING_TO_PUBLISH",
      `Rien n'attend d'être publié pour l'e-mail « ${template} » : déplacez un bloc, ajoutez-en un ou réécrivez une phrase avant de publier.`,
    );
  }
}

/** « Revenir au modèle d'origine » sur un e-mail qui y est déjà. */
export class NothingToRevertError extends BusinessError {
  constructor(template: string) {
    super(
      "MAIL_DOCUMENT_NOTHING_TO_REVERT",
      `L'e-mail « ${template} » part déjà dans son arrangement d'origine, sans brouillon : il n'y a rien à retirer.`,
    );
  }
}

/**
 * Un document rangé n'a plus la forme d'un document : écrit par un code plus
 * récent, ou touché à la main. L'éditeur ne peut pas le rouvrir.
 */
export class StoredMailDocumentUnreadableError extends TechnicalError {
  constructor(template: string) {
    super(
      "MAIL_DOCUMENT_UNREADABLE",
      `L'arrangement rangé de l'e-mail « ${template} » est illisible par cette version de l'API. L'e-mail part dans l'ordre du code en attendant ; prévenez l'équipe technique avant toute modification.`,
    );
  }
}
