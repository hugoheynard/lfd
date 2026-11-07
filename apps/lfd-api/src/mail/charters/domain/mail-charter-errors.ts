import { MAIL_SPACE_LABELS, type MailCharterViolation, type MailSpace } from "@lfd/mail-blocks";

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

function named(space: MailSpace): string {
  return `« ${MAIL_SPACE_LABELS[space]} »`;
}

/** L'espace demandé n'existe pas : il n'y en a que deux. */
export class UnknownMailSpaceError extends ResourceNotFoundError {
  constructor(space: string) {
    super(
      "MAIL_SPACE_UNKNOWN",
      `L'espace d'e-mails « ${space} » n'existe pas : il n'y a que « lfc » (La Folie Coffee — clients) et « lfd » (La Folie Douce — équipe). Revenez à la page des e-mails pour ouvrir une charte.`,
    );
  }
}

/** L'aperçu demande un e-mail qui n'est pas rangé dans cet espace. */
export class MailTemplateOutsideSpaceError extends ResourceNotFoundError {
  constructor(space: MailSpace, template: string) {
    super(
      "MAIL_TEMPLATE_OUTSIDE_SPACE",
      `L'e-mail « ${template} » n'est pas un e-mail de l'espace ${named(space)} : sa charte ne s'y applique pas. Choisissez l'aperçu parmi les e-mails de l'espace.`,
    );
  }
}

/**
 * La charte refusée par les règles du paquet (`validateMailCharter`,
 * `validateMailCharterForPublication`). Le message reprend chaque refus,
 * écrit pour l'équipe ; la liste reste lisible par l'écran.
 */
export class MailCharterRefusedError extends DomainError {
  constructor(
    space: MailSpace,
    gesture: "enregistrée" | "publiée" | "prévisualisée",
    readonly violations: readonly MailCharterViolation[],
  ) {
    super(
      "MAIL_CHARTER_REFUSED",
      `La charte de l'espace ${named(space)} ne peut pas être ${gesture} : ${violations
        .map((violation) => violation.message)
        .join(" ")}`,
    );
  }
}

/** Quelqu'un a écrit cette charte depuis que l'écran l'a lue. */
export class MailCharterChangedError extends BusinessError {
  constructor(space: MailSpace) {
    super(
      "MAIL_CHARTER_CHANGED",
      `La charte de l'espace ${named(space)} a été modifiée par quelqu'un d'autre pendant que vous l'aviez ouverte. Rechargez la page pour voir sa version, puis refaites votre modification.`,
    );
  }
}

/** « Publier » sans brouillon de charte. */
export class NothingToPublishForCharterError extends BusinessError {
  constructor(space: MailSpace) {
    super(
      "MAIL_CHARTER_NOTHING_TO_PUBLISH",
      `Rien n'attend d'être publié dans la charte de l'espace ${named(space)} : changez une couleur, le logo, la police ou le pied de page avant de publier.`,
    );
  }
}

/**
 * Une charte rangée n'a plus la forme d'une charte : écrite par un code plus
 * récent, ou touchée à la main. L'écran ne peut pas la rouvrir.
 */
export class StoredMailCharterUnreadableError extends TechnicalError {
  constructor(space: string) {
    super(
      "MAIL_CHARTER_UNREADABLE",
      `La charte rangée de l'espace « ${space} » est illisible par cette version de l'API. Les e-mails de l'espace partent avec la charte de départ en attendant ; prévenez l'équipe technique avant toute modification.`,
    );
  }
}

/**
 * Le logo n'a pas pu être copié pour une raison qui tient à l'image (origine
 * non admise, trop lourde, pas une image) : rien n'est publié.
 */
export class MailCharterLogoRefusedError extends DomainError {
  constructor(space: MailSpace, cause: Error) {
    super(
      "MAIL_CHARTER_LOGO_REFUSED",
      `La charte de l'espace ${named(space)} n'a pas été publiée : le logo ne peut pas être copié. ${cause.message} Choisissez une autre image, puis publiez de nouveau.`,
      cause,
    );
  }
}

/**
 * Le logo n'a pas pu être copié pour une raison technique (téléchargement,
 * stockage non configuré ou indisponible) : rien n'est publié, et un nouvel
 * essai peut réussir.
 */
export class MailCharterLogoUnavailableError extends TechnicalError {
  constructor(space: MailSpace, cause: Error) {
    super(
      "MAIL_CHARTER_LOGO_UNAVAILABLE",
      `La charte de l'espace ${named(space)} n'a pas été publiée : le logo n'a pas pu être copié. ${cause.message} Réessayez ; si l'échec persiste, prévenez l'équipe technique.`,
      cause,
    );
  }
}

/**
 * Le logo arrive à la publication sans sa copie : la charte publiée
 * pointerait vers la médiathèque. Ne survient que si le brouillon a changé
 * entre la copie et la publication.
 */
export class MailCharterLogoNotCopiedError extends BusinessError {
  constructor(space: MailSpace) {
    super(
      "MAIL_CHARTER_LOGO_NOT_COPIED",
      `La charte de l'espace ${named(space)} n'a pas été publiée : son logo a changé pendant la publication. Rechargez la page, puis publiez de nouveau.`,
    );
  }
}

/** L'e-mail de l'aperçu n'a pas d'exemple dans cette version : un défaut du code. */
export class MailCharterPreviewUnavailableError extends TechnicalError {
  constructor(template: string) {
    super(
      "MAIL_CHARTER_PREVIEW_UNAVAILABLE",
      `L'e-mail « ${template} » n'a pas d'exemple à rendre dans cette version : l'aperçu de la charte ne peut pas le montrer. Choisissez un autre e-mail de l'espace, et signalez-le à l'équipe technique.`,
    );
  }
}
