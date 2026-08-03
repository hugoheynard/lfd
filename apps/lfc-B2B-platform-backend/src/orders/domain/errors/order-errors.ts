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
 * L'entreprise n'est pas **activée** (règlement + KBIS validés par le commercial).
 * Refus **métier** (409), pas une donnée mal formée : préparer un panier reste
 * possible, passer commande non.
 */
export class CompanyNotActivatedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "orders.company.not_activated",
      "Cette entreprise n'est pas encore activée : vous pouvez préparer un panier, mais pas passer commande.",
    );
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

/** L'adresse de livraison visée n'appartient pas à cette entreprise. */
export class DeliveryAddressInvalidError extends DomainError {
  constructor(readonly addressId: string) {
    super(
      "orders.delivery_address.invalid",
      "L'adresse de livraison choisie n'appartient pas à cette entreprise.",
    );
  }
}
