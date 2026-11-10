import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

// Aucun de ces messages ne porte une adresse e-mail : ils sont lus à l'écran
// et passent par les logs d'erreur.

/** Un objet vide, trop long, ou sur plusieurs lignes. */
export class VitrineNoticeSubjectInvalidError extends DomainError {
  constructor(max: number) {
    super(
      "vitrine.notice.subject_invalid",
      `L'objet de l'annonce est obligatoire, tient sur une ligne et en ${String(max)} caractères au plus : le résumer, le détail va dans le message.`,
    );
  }
}

/** Un message vide ou trop long. */
export class VitrineNoticeMessageInvalidError extends DomainError {
  constructor(max: number) {
    super(
      "vitrine.notice.message_invalid",
      `Le message de l'annonce est obligatoire et tient en ${String(max)} caractères au plus : l'écrire, ou le raccourcir.`,
    );
  }
}

/** Personne à qui écrire : aucun abonné n'a de contact, ou la sélection est vide. */
export class VitrineNoticeNoRecipientError extends BusinessError {
  constructor() {
    super(
      "vitrine.notice.no_recipient",
      "Aucun destinataire : choisir au moins un abonné qui a une adresse de contact, ou en saisir une par « Modifier » sur sa carte.",
    );
  }
}

/** Un abonné choisi n'a pas d'adresse de contact. */
export class VitrineNoticeRecipientWithoutContactError extends BusinessError {
  constructor(subscriberName: string) {
    super(
      "vitrine.notice.recipient_without_contact",
      `L'abonné « ${subscriberName} » n'a pas d'adresse de contact : la saisir par « Modifier » sur sa carte, ou le retirer des destinataires.`,
    );
  }
}

/** Une annonce introuvable. */
export class VitrineNoticeNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("vitrine.notice.not_found", `L'annonce ${id} n'existe pas : recharger la page.`);
  }
}

/** Un envoi déjà consigné pour ce destinataire : on ne réécrit pas un journal. */
export class VitrineNoticeAttemptRecordedError extends BusinessError {
  constructor(subscriberId: string) {
    super(
      "vitrine.notice.attempt_recorded",
      `L'envoi de cette annonce à l'abonné ${subscriberId} est déjà consigné : il n'est pas réécrit.`,
    );
  }
}

/** « Reprendre l'envoi » sur une annonce dont chaque destinataire a déjà son issue. */
export class VitrineNoticeNothingToResumeError extends BusinessError {
  constructor(id: string) {
    super(
      "vitrine.notice.nothing_to_resume",
      `L'annonce ${id} n'a plus aucun destinataire en attente : chaque envoi est déjà consigné (accepté ou refusé). Pour réécrire à un abonné, composer une nouvelle annonce.`,
    );
  }
}
