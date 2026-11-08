import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** L'envoi demandé n'est pas (ou plus) au suivi — purgé après un an, ou inconnu. */
export class MailSendNotFoundError extends ResourceNotFoundError {
  constructor(readonly sendId: string) {
    super(
      "MAIL_SEND_NOT_FOUND",
      "Cet envoi n'est pas au suivi des e-mails : il n'existe pas, ou il a été purgé après un an. Revenez à la liste des envois.",
    );
  }
}

/**
 * Le plafond des consultations est atteint (`le-suivi-des-e-mails.md`,
 * décisions 7 et 8) : 30 adresses révélées ou recherches par heure et par
 * personne. Le message dit quand reprendre.
 */
export class MailConsultationLimitReachedError extends BusinessError {
  constructor(
    readonly limit: number,
    readonly retryAt: Date,
  ) {
    super(
      "MAIL_CONSULTATION_LIMIT_REACHED",
      `Vous avez affiché ${String(limit)} adresses ou recherches dans l'heure, le plafond du suivi des e-mails. ` +
        "Chaque consultation est inscrite au journal ; vous pourrez reprendre dans moins d'une heure, " +
        "ou demander à un collègue qui a le droit « Suivi des e-mails ».",
    );
  }
}

/**
 * L'adresse n'a pas été révélée par CETTE personne pour CET envoi depuis
 * moins de 5 minutes (décision 7). Un 403 : l'envoi existe, l'accès à son
 * adresse demande un geste tracé.
 */
export class MailRecipientNotRevealedError extends AuthorizationError {
  constructor(readonly sendId: string) {
    super(
      "MAIL_RECIPIENT_NOT_REVEALED",
      "L'adresse de cet envoi n'est pas affichée : cliquez sur « Afficher l'adresse » pour la révéler. " +
        "La révélation est inscrite au journal et vaut 5 minutes, pour vous seul.",
    );
  }
}

/** Le curseur de pagination n'est pas un curseur rendu par la liste. */
export class InvalidMailSendCursorError extends DomainError {
  constructor() {
    super(
      "INVALID_MAIL_SEND_CURSOR",
      "La page demandée du suivi des e-mails n'est pas reconnue. Rechargez la liste depuis le début.",
    );
  }
}

/** Une période dont le début suit la fin. */
export class InvalidMailSendPeriodError extends DomainError {
  constructor() {
    super(
      "INVALID_MAIL_SEND_PERIOD",
      "La période du suivi des e-mails commence après sa fin. Corrigez les dates du filtre.",
    );
  }
}

/** L'adresse cherchée n'a pas la forme d'une adresse e-mail. */
export class InvalidMailSearchAddressError extends DomainError {
  constructor() {
    super(
      "INVALID_MAIL_SEARCH_ADDRESS",
      "L'adresse cherchée n'est pas une adresse e-mail (elle doit contenir un @ et faire au plus 320 caractères). Corrigez-la puis relancez la recherche.",
    );
  }
}

/** La recherche n'existe pas (ou plus : purgée après un an). */
export class MailSearchNotFoundError extends ResourceNotFoundError {
  constructor(readonly searchId: string) {
    super(
      "MAIL_SEARCH_NOT_FOUND",
      "Cette recherche du suivi des e-mails n'existe pas. Relancez la recherche par adresse.",
    );
  }
}

/**
 * La recherche n'est lisible que par son auteur, dans les 5 minutes
 * (décision 8) : un 403, qui ne dit rien de ce qu'elle a trouvé.
 */
export class MailSearchNotReadableError extends AuthorizationError {
  constructor(readonly searchId: string) {
    super(
      "MAIL_SEARCH_NOT_READABLE",
      "Ces résultats ne sont plus lisibles : une recherche par adresse ne se lit que par la personne qui l'a lancée, pendant 5 minutes. " +
        "Relancez la recherche ; elle sera inscrite au journal.",
    );
  }
}
