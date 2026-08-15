import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../shared/errors/app-error.js";

/**
 * L'entreprise visée n'est pas accessible au demandeur — **404** non-divulguant,
 * comme partout ailleurs : on ne révèle pas son existence à qui n'en est pas membre.
 */
export class OrderCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super("orders.company.not_found", "Entreprise introuvable.");
  }
}

/**
 * La commande visée n'existe pas — **ou** le demandeur n'a pas à la voir. Un seul
 * et même 404 dans les deux cas : distinguer « inexistante » de « pas à vous »
 * confirmerait à un curieux qu'un numéro de commande est bien attribué.
 */
export class OrderNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderId: string) {
    super("orders.not_found", "Commande introuvable.");
  }
}

/** Une commande sans ligne n'a pas de sens (le schéma l'interdit déjà ; défense). */
export class EmptyOrderError extends DomainError {
  constructor() {
    super("orders.empty", "Impossible de passer une commande vide.");
  }
}

/** Un SKU envoyé par le client n'existe pas au catalogue. */
export class UnknownSkuError extends DomainError {
  constructor(readonly sku: string) {
    super("orders.sku.unknown", `Article inconnu au catalogue : ${sku}.`);
  }
}

/**
 * Un **retrait** est demandé mais aucun point de retrait n'est configuré (l'adresse
 * labo dans les Réglages). Refus **métier** (409) : la demande est bien formée,
 * mais l'état de la plateforme ne permet pas ce mode d'acheminement.
 */
export class PickupNotConfiguredError extends BusinessError {
  constructor() {
    super(
      "orders.pickup.not_configured",
      "Le retrait n'est pas disponible : aucun point de retrait n'est configuré.",
    );
  }
}

/** La zone de livraison choisie (coursier) n'existe pas / plus au catalogue. */
export class UnknownDeliveryZoneError extends DomainError {
  constructor(readonly zoneId: string) {
    super("orders.delivery_zone.unknown", `Zone de livraison inconnue : ${zoneId}.`);
  }
}

/**
 * Aucune zone ne couvre le code postal de l'adresse livrée. Refus **métier**
 * (409) : la demande est bien formée, c'est le maillage des zones qui ne dessert
 * pas ce secteur.
 *
 * On refuse plutôt que de livrer à frais nul : un secteur non couvert n'est pas
 * un secteur gratuit, c'est un secteur où la tournée n'a pas de coût connu.
 */
export class NoDeliveryZoneForPostalCodeError extends BusinessError {
  constructor(readonly codePostal: string) {
    super(
      "orders.delivery_zone.not_served",
      `Aucune zone de livraison ne dessert le code postal ${codePostal}. Choisissez le retrait, ou contactez-nous.`,
    );
  }
}

/** Une ligne de commande mal formée (quantité ≤ 0, prix négatif). */
export class InvalidOrderLineError extends DomainError {
  constructor(
    readonly sku: string,
    readonly reason: string,
  ) {
    super("orders.line.invalid", `Ligne « ${sku} » : ${reason}.`);
  }
}

/** L'acheminement est incohérent (coursier sans zone/adresse, retrait sans point). */
export class InvalidOrderFulfillmentError extends DomainError {
  constructor(readonly reason: string) {
    super("orders.fulfillment.invalid", reason);
  }
}

/** Le règlement est incohérent avec le total (carte demandée sur un total nul). */
export class InvalidOrderPaymentError extends DomainError {
  constructor(readonly reason: string) {
    super("orders.payment.invalid", reason);
  }
}

/**
 * On demande à régler une commande qui n'attend aucun règlement — déjà payée,
 * portée au compte, ou annulée. Refus **métier** (409) : la demande est bien
 * formée, c'est l'état de la commande qui s'y oppose.
 *
 * Le message nomme l'état, parce qu'un client qui suit un lien périmé doit
 * comprendre que sa commande va bien, et non qu'elle est cassée.
 */
export class OrderNotPayableError extends BusinessError {
  constructor(readonly paymentStatus: string) {
    super(
      "orders.payment.not_payable",
      paymentStatus === "paid"
        ? "Cette commande est déjà réglée."
        : "Cette commande n'attend aucun règlement en ligne.",
    );
  }
}

/**
 * L'équipe a demandé de porter la commande **au compte** d'une société qui ne
 * règle pas au compte. Refus **métier** (409) : la demande est bien formée,
 * c'est le crédit qui n'existe pas.
 *
 * Ce refus est le mur de cette surface. Sans lui, un écran de back-office
 * suffirait à accorder un délai de paiement qu'aucun commercial n'a négocié — et
 * la plateforme livrerait à crédit sans jamais l'avoir décidé.
 */
export class AccountSettlementNotGrantedError extends BusinessError {
  constructor() {
    super(
      "orders.settlement.account_not_granted",
      "Cette société ne règle pas au compte : la commande doit être réglée par lien de paiement.",
    );
  }
}

/**
 * Le jeton de remise scanné ne correspond à aucune commande — **404** comme
 * partout : un jeton inconnu et un jeton qui n'a jamais existé doivent être
 * indiscernables, sans quoi essayer des chaînes au hasard finirait par dire
 * lesquelles sont attribuées.
 */
export class HandoverTokenNotFoundError extends ResourceNotFoundError {
  constructor() {
    super("orders.handover.not_found", "Ce code de retrait ne correspond à aucune commande.");
  }
}

/**
 * La commande existe mais son état interdit la remise (annulée, déjà remise, en
 * livraison). Refus **métier** (409) : la demande est bien formée, c'est l'état
 * du monde qui s'y oppose. Le message vient de `handoverBlocker` — il sera lu
 * tel quel par la personne au comptoir, d'où le refus d'un code générique.
 */
export class HandoverRefusedError extends BusinessError {
  constructor(readonly reason: string) {
    super("orders.handover.refused", reason);
  }
}
