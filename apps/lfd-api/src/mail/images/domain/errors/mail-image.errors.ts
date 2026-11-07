import { DomainError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** L'adresse donnée n'est pas une adresse web lisible. */
export class InvalidMailImageUrlError extends DomainError {
  constructor(raw: string) {
    super(
      "MAIL_IMAGE_URL_INVALID",
      `« ${raw} » n'est pas une adresse d'image : rien n'a été copié. ` +
        "Choisir l'image dans la médiathèque plutôt que de saisir son adresse.",
    );
  }
}

/**
 * L'origine n'est pas dans la liste admise : sans ce refus, publier un modèle
 * ferait du bloc `mail` un client HTTP ouvert (§ 23 du plan).
 */
export class MailImageOriginNotAdmittedError extends DomainError {
  constructor(origin: string, variable: string) {
    super(
      "MAIL_IMAGE_ORIGIN_NOT_ADMITTED",
      `Les images d'e-mail ne se copient pas depuis « ${origin} » : cette origine n'est pas admise. ` +
        `Choisir une image de la médiathèque, ou ajouter l'origine (en https) à la variable ${variable}.`,
    );
  }
}

/** L'image dépasse la taille qu'un e-mail peut raisonnablement porter. */
export class MailImageTooLargeError extends DomainError {
  constructor(maxBytes: number) {
    super(
      "MAIL_IMAGE_TOO_LARGE",
      `L'image dépasse ${Math.round(maxBytes / 1024)} Kio, la taille maximale d'une image d'e-mail : rien n'a été copié. ` +
        "Choisir une image plus légère dans la médiathèque.",
    );
  }
}

/** Les octets reçus ne sont pas une image reconnue, quoi qu'annonce l'en-tête. */
export class MailImageNotAnImageError extends DomainError {
  constructor(accepted: readonly string[]) {
    super(
      "MAIL_IMAGE_NOT_AN_IMAGE",
      `Le fichier téléchargé n'est pas une image reconnue (${accepted.join(", ")}) : rien n'a été copié. ` +
        "Choisir une autre image dans la médiathèque.",
    );
  }
}

/**
 * Les octets ont la signature d'une image, mais elle ne se décode pas
 * (tronquée, abîmée) : on ne peut pas la recadrer (§ 19, « Format et point
 * focal »).
 */
export class MailImageUnreadableError extends DomainError {
  constructor(cause?: unknown) {
    super(
      "MAIL_IMAGE_UNREADABLE",
      "L'image téléchargée est abîmée et ne se lit pas : elle n'a pas pu être recadrée, rien n'a été copié. " +
        "Choisir une autre image dans la médiathèque, ou la remplacer par une version saine.",
      cause,
    );
  }
}

/** Le téléchargement a échoué côté réseau ou côté source : un nouvel essai peut réussir. */
export class MailImageDownloadFailedError extends TechnicalError {
  constructor(origin: string, reason: string, cause?: unknown) {
    super(
      "MAIL_IMAGE_DOWNLOAD_FAILED",
      `L'image n'a pas pu être téléchargée depuis « ${origin} » (${reason}) : rien n'a été copié. ` +
        "Réessayer ; si l'échec persiste, vérifier que l'image existe encore dans la médiathèque.",
      cause,
    );
  }
}

/** Le stockage des images d'e-mail n'est pas configuré, ou a refusé le dépôt. */
export class MailImageStorageUnavailableError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super("MAIL_IMAGE_STORAGE_UNAVAILABLE", reason, cause);
  }
}
