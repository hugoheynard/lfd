import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Une donnée d'ouverture ou de révocation mal formée — faute de l'appelant. */
export class InvalidPayLinkError extends DomainError {
  constructor(field: string, rule: string) {
    super("pay_link.invalid", `Lien de paiement refusé : ${field} ${rule}.`);
  }
}

/**
 * Un jeton inconnu ou un lien révoqué — **le même refus**, pour ne pas dire à
 * qui essaie des jetons lesquels ont existé.
 */
export class PayLinkNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "pay_link.not_found",
      "Ce lien de paiement n'existe pas ou n'est plus valable : demandez-en un nouveau " +
        "à la personne qui vous l'a envoyé.",
    );
  }
}

/** Une révocation sur un lien déjà révoqué : il ne se ranime pas, et ne se re-révoque pas. */
export class PayLinkAlreadyRevokedError extends BusinessError {
  constructor(linkId: string) {
    super(
      "pay_link.already_revoked",
      `Le lien de paiement ${linkId} est déjà révoqué : ouvrez-en un nouveau si le sujet est encore dû.`,
    );
  }
}

/** Une origine absente du registre des origines (`pay-link-origins.ts`). */
export class UnknownPayLinkOriginError extends DomainError {
  constructor(origin: string) {
    super(
      "pay_link.origin.unknown",
      `Origine de lien de paiement inconnue (« ${origin} ») : elle doit être déclarée dans ` +
        "le registre des origines avant d'ouvrir un lien.",
    );
  }
}

/**
 * L'origine est déclarée, mais sa racine publique n'est pas configurée :
 * aucune URL n'est inventée. Un refus métier (409) plutôt qu'une erreur
 * technique, pour que l'écran qui ouvre le lien dise quoi faire poser.
 */
export class PayLinkOriginWithoutRootError extends BusinessError {
  constructor(label: string) {
    super(
      "pay_link.origin.no_root",
      `Le lien de paiement ne peut pas être composé : la racine publique de « ${label} » ` +
        "n'est pas configurée (CLIENT_BASE_URL). Rien n'a été envoyé ; à faire poser, puis réessayer.",
    );
  }
}

/** Aucun bloc ne sait chiffrer ce type de sujet : un lien vers lui ne mènerait à rien. */
export class SubjectNotLinkableError extends TechnicalError {
  constructor(subjectType: string) {
    super(
      "pay_link.subject.not_linkable",
      `Aucun lien de paiement n'est possible pour un sujet « ${subjectType} » : ` +
        "aucun bloc ne le déclare payable par lien.",
    );
  }
}

/** Deux implémenteurs déclarés pour le même type de sujet. */
export class DuplicateLinkableSubjectError extends TechnicalError {
  constructor(subjectType: string) {
    super(
      "pay_link.subject.duplicate",
      `Deux implémenteurs de LinkableSubject servent le type « ${subjectType} » : un seul par type.`,
    );
  }
}

/** Aucun bloc n'encaisse ce type de sujet : la page ne peut pas créer d'intention. */
export class SubjectNotSettleableError extends TechnicalError {
  constructor(subjectType: string) {
    super(
      "pay_link.subject.not_settleable",
      `Le sujet « ${subjectType} » n'a pas d'implémenteur SubjectSettlement : ` +
        "un paiement par lien ne pourrait pas être enregistré.",
    );
  }
}

/** Le sujet ne veut plus être payé (réglé, annulé) : la page le dit. */
export class PayLinkSubjectNotPayableError extends BusinessError {
  constructor(reason: string) {
    super(
      "pay_link.subject.not_payable",
      reason === "settled"
        ? "Ce paiement est déjà réglé : il n'y a plus rien à payer par ce lien."
        : "Ce paiement n'est plus attendu (annulé) : il n'y a rien à payer par ce lien.",
    );
  }
}

/**
 * L'intention du lien est close chez le prestataire alors que le sujet est
 * encore dû : la page ne peut plus encaisser par elle.
 */
export class PayLinkIntentClosedError extends BusinessError {
  constructor() {
    super(
      "pay_link.intent.closed",
      "Ce lien de paiement ne peut plus être utilisé : demandez un nouveau lien à la personne " +
        "qui vous l'a envoyé (lien à refaire).",
    );
  }
}

/**
 * L'insertion a heurté un lien qui n'est plus vivant à la relecture — révoqué
 * dans l'intervalle. Rien n'est écrit ; le geste se refait.
 */
export class PayLinkOpeningConflictError extends BusinessError {
  constructor(subjectType: string, subjectId: string) {
    super(
      "pay_link.opening.conflict",
      `Le lien de paiement de ${subjectType} ${subjectId} vient d'être révoqué pendant son ` +
        "ouverture : rien n'a été écrit, refaites le geste.",
    );
  }
}
