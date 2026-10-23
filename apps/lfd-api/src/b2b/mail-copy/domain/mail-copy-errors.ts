import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/** L'e-mail ou le texte n'existe pas dans le dictionnaire de cette version. */
export class UnknownMailTextError extends ResourceNotFoundError {
  constructor(mail: string, path: string) {
    super(
      "MAIL_COPY_TEXT_UNKNOWN",
      `Le texte « ${path} » de l'e-mail « ${mail} » n'existe pas dans cette version : il a été retiré ou renommé. Rechargez l'écran des textes des e-mails pour voir la liste à jour.`,
    );
  }
}

/** L'e-mail demandé pour un aperçu ou un essai n'est pas au registre. */
export class UnknownMailError extends ResourceNotFoundError {
  constructor(mail: string) {
    super(
      "MAIL_COPY_MAIL_UNKNOWN",
      `L'e-mail « ${mail} » n'existe pas dans cette version. Rechargez l'écran des textes des e-mails pour voir la liste à jour.`,
    );
  }
}

/** Le texte proposé ne respecte pas un garde-fou (C5). */
export class InvalidMailTextError extends DomainError {
  constructor(mail: string, path: string, reason: string) {
    super(
      "MAIL_COPY_TEXT_INVALID",
      `Le texte « ${path} » de l'e-mail « ${mail} » ne peut pas être enregistré : ${reason}`,
    );
  }
}

/** Quelqu'un a écrit ce texte depuis que l'écran l'a lu. */
export class MailCopyChangedError extends BusinessError {
  constructor(mail: string, path: string, locale: string) {
    super(
      "MAIL_COPY_CHANGED",
      `Le texte « ${path} » de l'e-mail « ${mail} » (${locale}) a été modifié par quelqu'un d'autre pendant que vous l'aviez ouvert. Rechargez l'écran pour voir sa version, puis refaites votre modification.`,
    );
  }
}

/** « Publier » sans rien à publier : pas de version vide au journal. */
export class NothingToPublishError extends BusinessError {
  constructor() {
    super(
      "MAIL_COPY_NOTHING_TO_PUBLISH",
      "Aucun texte ni ordre de sections d'e-mail n'attend d'être publié : modifiez ou rétablissez au moins un texte, ou déplacez une section, avant de publier.",
    );
  }
}

/** Deux « Publier » au même instant : le second n'écrit rien. */
export class MailCopyPublishedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "MAIL_COPY_PUBLISHED_MEANWHILE",
      "Quelqu'un vient de publier les textes des e-mails en même temps que vous. Rechargez l'écran : ce qui reste à publier y est indiqué.",
    );
  }
}

/** L'essai n'a personne à qui partir : la fiche de la personne connectée n'a pas d'adresse. */
export class TrialRecipientMissingError extends BusinessError {
  constructor() {
    super(
      "MAIL_COPY_TRIAL_NO_ADDRESS",
      "L'essai ne peut pas partir : votre fiche d'équipe n'a pas d'adresse e-mail active. Faites compléter votre fiche dans l'annuaire, puis renvoyez l'essai.",
    );
  }
}

/** L'ordre proposé pour les sections d'un e-mail ne les range pas toutes, une fois chacune (E4). */
export class InvalidMailSectionOrderError extends DomainError {
  constructor(mail: string, reason: string) {
    super(
      "MAIL_SECTION_ORDER_INVALID",
      `L'ordre des sections de l'e-mail « ${mail} » ne peut pas être enregistré : ${reason}`,
    );
  }
}

/** Quelqu'un a déplacé les sections de cet e-mail depuis que l'écran les a lues. */
export class MailSectionOrderChangedError extends BusinessError {
  constructor(mail: string) {
    super(
      "MAIL_SECTION_ORDER_CHANGED",
      `L'ordre des sections de l'e-mail « ${mail} » a été modifié par quelqu'un d'autre pendant que vous l'aviez ouvert. Rechargez l'écran pour voir son ordre, puis refaites votre déplacement.`,
    );
  }
}
