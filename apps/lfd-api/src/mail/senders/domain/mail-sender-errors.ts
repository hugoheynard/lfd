import { MAIL_SPACE_LABELS, type MailSenderViolation, type MailSpace } from "@lfd/mail-blocks";

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

function named(space: MailSpace): string {
  return `« ${MAIL_SPACE_LABELS[space]} »`;
}

/** L'identité refusée par les règles de forme du paquet (`validateMailSenderIdentity`). */
export class MailSenderRefusedError extends DomainError {
  constructor(
    space: MailSpace,
    readonly violations: readonly MailSenderViolation[],
  ) {
    super(
      "MAIL_SENDER_REFUSED",
      `L'identité d'envoi de l'espace ${named(space)} n'a pas été enregistrée : ${violations
        .map((violation) => violation.message)
        .join(" ")}`,
    );
  }
}

/**
 * Le domaine de l'adresse d'envoi n'est pas vérifié chez Resend : un envoi
 * sous cette adresse serait refusé — ou pire, écrirait au nom d'un domaine
 * qui n'est pas à nous.
 */
export class SenderDomainNotVerifiedError extends BusinessError {
  constructor(
    space: MailSpace,
    readonly domain: string,
    readonly verifiedDomains: readonly string[],
  ) {
    const known =
      verifiedDomains.length === 0
        ? "Aucun domaine n'est vérifié chez Resend aujourd'hui."
        : `Domaines vérifiés : ${verifiedDomains.join(", ")}.`;
    super(
      "MAIL_SENDER_DOMAIN_NOT_VERIFIED",
      `L'identité d'envoi de l'espace ${named(space)} n'a pas été enregistrée : ${domain} n'est pas vérifié chez Resend. Ajoutez-le dans Resend et posez ses enregistrements DNS, ou choisissez une adresse d'un domaine vérifié. ${known}`,
    );
  }
}

/** Quelqu'un a changé cette identité depuis que l'écran l'a lue. */
export class MailSenderChangedError extends BusinessError {
  constructor(space: MailSpace) {
    super(
      "MAIL_SENDER_CHANGED",
      `L'identité d'envoi de l'espace ${named(space)} a été modifiée par quelqu'un d'autre pendant que vous l'aviez ouverte. Rechargez la page pour voir la sienne, puis refaites votre modification.`,
    );
  }
}

/**
 * La liste des domaines vérifiés n'a pas pu être lue chez Resend : on ne
 * sait pas si l'adresse est à nous, rien n'est enregistré.
 */
export class SendingDomainsUnavailableError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super(
      "MAIL_SENDING_DOMAINS_UNAVAILABLE",
      `La liste des domaines vérifiés chez Resend n'a pas pu être lue : ${reason} Rien n'a été enregistré ; réessayez, et si l'échec persiste, prévenez l'équipe technique.`,
      cause,
    );
  }
}

/**
 * L'essai envoyé sous la nouvelle identité n'est pas parti — Resend l'a
 * refusé, ou n'a pas répondu : elle n'est pas enregistrée.
 */
export class MailSenderTrialRefusedError extends BusinessError {
  constructor(space: MailSpace, cause: Error) {
    super(
      "MAIL_SENDER_TRIAL_REFUSED",
      `L'identité d'envoi de l'espace ${named(space)} n'a pas été enregistrée : l'essai envoyé sous elle n'est pas parti. ${cause.message} Vérifiez l'adresse et son domaine dans Resend, puis enregistrez de nouveau.`,
      cause,
    );
  }
}

/**
 * Une identité rangée n'a plus la forme d'une identité : touchée à la main,
 * ou écrite par un code plus récent.
 */
export class StoredMailSenderUnreadableError extends TechnicalError {
  constructor(space: string) {
    super(
      "MAIL_SENDER_UNREADABLE",
      `L'identité d'envoi rangée de l'espace « ${space} » est illisible par cette version de l'API. Ses e-mails partent sous l'identité par défaut en attendant ; prévenez l'équipe technique avant toute modification.`,
    );
  }
}

/**
 * L'espace ne règle pas d'identité pour cette nature (plan
 * `plan-desinscription-des-e-mails.md`, lot U5) : `lfd`, l'espace de
 * l'équipe, n'envoie jamais de marketing (règle 19).
 */
export class MailSenderNatureNotOfferedError extends ResourceNotFoundError {
  constructor(space: MailSpace, nature: string) {
    super(
      "MAIL_SENDER_NATURE_NOT_OFFERED",
      `L'espace ${named(space)} n'a pas d'identité d'envoi « ${nature} » : il n'envoie que des e-mails transactionnels. Revenez à l'onglet « Expéditeur » de l'espace pour régler son expéditeur transactionnel.`,
    );
  }
}

/** Une nature d'e-mail inconnue dans une route : il n'y a que `transactional` et `marketing`. */
export class UnknownMailNatureError extends ResourceNotFoundError {
  constructor(nature: string) {
    super(
      "MAIL_NATURE_UNKNOWN",
      `La nature d'e-mail « ${nature} » n'existe pas : il n'y a que « transactional » (e-mails de service) et « marketing » (offres). Revenez à l'onglet « Expéditeur » de l'espace.`,
    );
  }
}
