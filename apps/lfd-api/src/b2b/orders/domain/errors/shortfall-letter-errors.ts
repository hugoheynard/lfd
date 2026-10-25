import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **« Écrire au client »** après un départ incomplet (plan
 * plan E6d (`documentation/commandes/bon-de-livraison.md`)). Lus par l'équipe :
 * chacun nomme le cas et le geste de sortie, et aucun ne porte l'adresse.
 */

/** Le geste vient APRÈS la décision. */
export class ShortfallLetterWithoutDecisionError extends BusinessError {
  constructor(orderId: string) {
    super(
      "orders.shortfall_letter.not_decided",
      `Aucun départ incomplet n'est décidé pour la commande ${orderId} : il n'y a rien à écrire au client. ` +
        "Décidez d'abord du départ, puis rechargez la commande.",
    );
  }
}

/** Une fois par décision. */
export class ShortfallCustomerAlreadyNotifiedError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_letter.already_sent",
      `Le client de ${reference} a déjà été prévenu de ce départ incomplet : aucun second courriel n'est parti. ` +
        "Rechargez la commande pour voir qui l'a écrit, et quand.",
    );
  }
}

export class ShortfallLetterRequiredError extends DomainError {
  constructor() {
    super(
      "orders.shortfall_letter.required",
      "Le texte du courriel est vide : écrivez ce que le client doit savoir, ou fermez sans rien envoyer.",
    );
  }
}

export class ShortfallLetterTooLongError extends DomainError {
  constructor(max: number) {
    super(
      "orders.shortfall_letter.too_long",
      `Le texte du courriel dépasse ${String(max)} caractères : raccourcissez-le avant d'envoyer.`,
    );
  }
}

/** Le client n'a pas d'adresse lisible : rien ne part, rien n'est tracé. */
export class ShortfallLetterNoRecipientError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_letter.no_recipient",
      `Le client qui a passé ${reference} n'a pas d'adresse lisible : le courriel n'est pas parti. ` +
        "Prévenez-le par téléphone.",
    );
  }
}

/** Le fournisseur a refusé l'envoi : la trace est annulée avec lui. */
export class ShortfallLetterNotSentError extends TechnicalError {
  constructor(reference: string, cause: unknown) {
    super(
      "orders.shortfall_letter.not_sent",
      `Le courriel au client de ${reference} n'est pas parti, et rien n'a été tracé. Réessayez dans un instant.`,
      cause,
    );
  }
}
