import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/** Un sujet sans type ou sans identifiant — faute de l'appelant, jamais d'un client. */
export class InvalidPaymentSubjectError extends DomainError {
  constructor(type: string, id: string) {
    super(
      "card_payment.subject.invalid",
      `Sujet de paiement invalide (« ${type} » / « ${id} ») : un type en minuscules ` +
        "(order, …) et un identifiant non vide sont requis.",
    );
  }
}

/** Un nom de compte mal formé : il ne peut nommer aucun compte du registre. */
export class InvalidPaymentAccountError extends DomainError {
  constructor(name: string) {
    super(
      "card_payment.account.invalid",
      `Nom de compte d'encaissement mal formé (« ${name} ») : minuscules, chiffres et tirets.`,
    );
  }
}

/** Un montant qui n'est pas un entier strictement positif de centimes. */
export class InvalidPaymentAmountError extends DomainError {
  constructor(amountCents: number) {
    super(
      "card_payment.amount.invalid",
      `Montant de paiement refusé (${String(amountCents)}) : un paiement par carte porte un ` +
        "nombre entier de centimes, strictement positif.",
    );
  }
}

/** Une référence prestataire vide : sans elle, aucun webhook ne retrouve le paiement. */
export class MissingProviderRefError extends DomainError {
  constructor() {
    super(
      "card_payment.provider_ref.missing",
      "Un paiement rattaché porte la référence de son intention chez le prestataire.",
    );
  }
}

/**
 * Une transition hors de la machine du §3.4 (plan M2) — le même refus que le
 * déclencheur `payment_guard`, porté d'abord par l'agrégat.
 */
export class CardPaymentTransitionRefusedError extends BusinessError {
  constructor(paymentId: string, from: string, to: string) {
    super(
      "card_payment.transition.refused",
      `Le paiement ${paymentId} ne passe pas de « ${from} » à « ${to} » : un paiement encaissé ` +
        "ne se ferme ni n'échoue plus — un écart se règle par un remboursement.",
    );
  }
}

/**
 * Un compte que le registre (`platform/config/card-accounts.ts`) ne connaît
 * pas — le chemin d'un webhook (`/payments/webhook/:account`) le plus souvent.
 * **400** : la requête nomme un compte qui n'existe pas (plan M2, §3.2).
 */
export class UnknownCardAccountError extends DomainError {
  constructor(account: string) {
    super(
      "card_payment.account.unknown",
      `Compte d'encaissement inconnu (« ${account} ») : il n'est pas au registre ` +
        "platform/config/card-accounts.ts.",
    );
  }
}

/**
 * Un compte du registre dont les secrets manquent : il n'est pas instancié
 * (le démarrage l'a journalisé). **500** : Stripe rejoue, et le compte
 * reviendra quand ses trois secrets seront posés.
 */
export class CardAccountUnavailableError extends TechnicalError {
  constructor(account: string) {
    super(
      "card_payment.account.unavailable",
      `Le compte d'encaissement « ${account} » n'est pas configuré : ses trois secrets ` +
        "(clé secrète, clé publique, secret de webhook) sont à poser dans l'environnement.",
    );
  }
}

/** Le prestataire a répondu de façon inexploitable, ou n'a pas répondu. */
export class CardProviderUnavailableError extends TechnicalError {
  constructor(cause?: unknown) {
    super(
      "card_payment.provider.unavailable",
      "Le paiement par carte est momentanément indisponible.",
      cause,
    );
  }
}

/**
 * La signature d'un webhook est invalide (corps altéré, mauvais secret,
 * requête forgée). **400**, et l'événement n'est jamais traité : c'est la
 * seule preuve qu'il vient du prestataire.
 */
export class InvalidProviderSignatureError extends DomainError {
  constructor(cause?: unknown) {
    super("card_payment.webhook.invalid_signature", "Signature de webhook invalide.", cause);
  }
}

/** Aucun paiement sous cet identifiant. */
export class CardPaymentNotFoundError extends ResourceNotFoundError {
  constructor(paymentId: string) {
    super("card_payment.payment.not_found", `Aucun paiement par carte « ${paymentId} ».`);
  }
}

/**
 * Aucun compte n'encaisse ce type de sujet : la valeur `default_for` manque
 * à la racine de composition (`appBootstrap/`). Configuration, pas client.
 */
export class NoCardAccountForSubjectTypeError extends TechnicalError {
  constructor(subjectType: string) {
    super(
      "card_payment.account.no_default",
      `Aucun compte d'encaissement n'est désigné pour les sujets « ${subjectType} » : ` +
        "la table default_for de appBootstrap/ est à compléter.",
    );
  }
}

/**
 * Un paiement d'un type de sujet qu'aucun bloc n'implémente : son issue ne
 * peut pas être rendue au sujet. **500** : le prestataire rejoue, le temps
 * qu'`appBootstrap/` relie l'implémenteur.
 */
export class NoSubjectSettlementError extends TechnicalError {
  constructor(subjectType: string) {
    super(
      "card_payment.subject.no_settlement",
      `Aucun bloc n'implémente le canal des sujets « ${subjectType} » ` +
        "(card-payment/channels/subjects/) : appBootstrap/ doit le relier.",
    );
  }
}

/** Deux implémenteurs pour un même type de sujet : lequel croire ? */
export class DuplicateSubjectSettlementError extends TechnicalError {
  constructor(subjectType: string) {
    super(
      "card_payment.subject.duplicate_settlement",
      `Deux implémenteurs du canal des sujets pour « ${subjectType} » : un seul par type.`,
    );
  }
}
