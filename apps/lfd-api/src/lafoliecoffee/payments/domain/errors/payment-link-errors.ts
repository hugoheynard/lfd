import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
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

const STATUS_WORDS: Readonly<Record<string, string>> = {
  paid: "déjà payé",
  cancelled: "déjà annulé",
  expired: "expiré chez Stripe",
};

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
