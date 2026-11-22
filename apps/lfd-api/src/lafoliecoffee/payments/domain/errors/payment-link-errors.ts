import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus d'un **lien de paiement libre**. Chaque message est lu au
 * back-office par la comptabilité, sans le code sous les yeux : il nomme le cas
 * réel et le geste de sortie.
 */

/** Montant nul, négatif ou non entier — **400**. L'écran convertit les euros ; ceci est la défense. */
export class InvalidPaymentLinkAmountError extends DomainError {
  constructor(amountCents: number) {
    super(
      "payments.link.invalid_amount",
      `Montant invalide (${String(amountCents)} centimes) : un lien de paiement demande une somme entière et positive.`,
    );
  }
}

/** Libellé vide ou trop long pour la page Stripe — **400**. */
export class InvalidPaymentLinkLabelError extends DomainError {
  constructor(max: number) {
    super(
      "payments.link.invalid_label",
      `Le libellé d'un lien de paiement fait entre 1 et ${String(max)} caractères : c'est lui que le client lit sur la page de paiement.`,
    );
  }
}

/**
 * Le montant dépasse le plafond posé par la comptabilité — **409**. La demande
 * est bien formée ; c'est le réglage du moment qui s'y oppose.
 */
export class PaymentLinkAboveCapError extends BusinessError {
  constructor(amountCents: number, capCents: number) {
    super(
      "payments.link.above_cap",
      `Ce lien demande ${euros(amountCents)}, au-delà du plafond de ${euros(capCents)} fixé par la comptabilité. ` +
        "Réduisez le montant, ou faites relever le plafond dans l'onglet des liens libres.",
    );
  }
}

/** On n'annule qu'un lien encore ouvert — **409**. */
export class PaymentLinkNotOpenError extends BusinessError {
  constructor(status: string) {
    super(
      "payments.link.not_open",
      `Ce lien n'est plus ouvert (${STATUS_WORDS[status] ?? status}) : il n'y a plus rien à annuler.`,
    );
  }
}

/** Aucun lien sous cet identifiant — **404**. */
export class PaymentLinkNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("payments.link.not_found", `Aucun lien de paiement sous l'identifiant ${id}.`);
  }
}

/** La société visée n'existe pas — **404**. Un lien libre s'adresse toujours à un client. */
export class PaymentLinkCompanyNotFoundError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super(
      "payments.link.company_not_found",
      `Aucune société cliente sous l'identifiant ${companyId} : un lien de paiement s'adresse à un client existant.`,
    );
  }
}

/**
 * Une ligne qui porte une session sans URL, ou l'inverse — **500**. Le
 * `CHECK payment_links_checkout_pair` l'interdit en base : la voir, c'est
 * une lecture qui ne passe pas par la table.
 */
export class PaymentLinkChannelCorruptError extends TechnicalError {
  constructor(id: string) {
    super(
      "payments.link.channel_corrupt",
      `Le lien de paiement ${id} porte une session Stripe sans adresse, ou l'inverse : ` +
        "la ligne est incohérente, à signaler à l'équipe technique.",
    );
  }
}

/**
 * Le lien d'une demande de paiement libre rejouée n'a plus d'adresse — **409** : elle a
 * été payée ou annulée depuis le premier envoi.
 */
export class PaymentLinkUrlGoneError extends BusinessError {
  constructor(id: string) {
    super(
      "payments.link.url_gone",
      `Le lien de paiement ${id} a bien été créé, mais il n'est plus ouvert (payé ou annulé ` +
        "depuis) : rechargez la liste des liens libres pour voir son état.",
    );
  }
}

/**
 * L'origine des demandes de paiement libres n'est pas au registre des origines — **500** :
 * une faute de configuration du dépôt, que rien à l'écran ne corrige.
 */
export class FreeChargeOriginMissingError extends TechnicalError {
  constructor(origin: string) {
    super(
      "payments.link.origin_missing",
      `L'origine « ${origin} » des demandes de paiement libres n'est pas déclarée au registre des ` +
        "origines de liens (pay-link-origins.ts) : la page de paiement ne peut pas la nommer.",
    );
  }
}

/** Un fait durable des liens reçu hors de son contrat — **500**, faute d'émetteur. */
export class PaymentLinkFactPayloadError extends TechnicalError {
  constructor(type: string) {
    super(
      "payments.link.fact_payload",
      `Le fait « ${type} » est arrivé sans identifiant de lien : l'émetteur ne respecte pas ` +
        "son contrat, à signaler à l'équipe technique.",
    );
  }
}

/**
 * L'annulation de l'intention d'une demande de paiement libre n'a pas abouti chez le
 * prestataire (en cours, ou injoignable) — **500** : l'abonné lève, la boîte
 * d'envoi le rejoue.
 */
export class PaymentLinkIntentNotCancelledError extends TechnicalError {
  constructor(paymentLinkId: string, why: string) {
    super(
      "payments.link.intent_not_cancelled",
      `L'intention de paiement de la demande de paiement libre ${paymentLinkId} n'a pas pu être annulée ` +
        `(${why}) : nouvel essai automatique.`,
    );
  }
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  paid: "déjà payé",
  cancelled: "déjà annulé",
  expired: "expiré chez Stripe",
};

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** La nature choisie n'est pas au registre des natures — **400**. */
export class UnknownFreeChargeNatureError extends DomainError {
  constructor(nature: string, admitted: readonly string[]) {
    super(
      "payments.link.unknown_nature",
      `Nature « ${nature} » inconnue : une demande de paiement libre se range sous une des natures du registre (${admitted.join(", ")}). Choisir « Autre » si aucune ne convient.`,
    );
  }
}

/**
 * Une ligne porte une nature absente du registre — **500**. Le registre ne
 * retire pas de clé ; une clé retirée doit d'abord quitter la base.
 */
export class PaymentLinkNatureCorruptError extends TechnicalError {
  constructor(linkId: string, nature: string) {
    super(
      "payments.link.nature_corrupt",
      `La demande de paiement libre ${linkId} porte la nature « ${nature} », absente du registre : la rendre au registre (packages/contracts) ou corriger la ligne.`,
    );
  }
}
