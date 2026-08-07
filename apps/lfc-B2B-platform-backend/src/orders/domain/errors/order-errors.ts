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
