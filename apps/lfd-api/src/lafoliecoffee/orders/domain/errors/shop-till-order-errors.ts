import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Une commande à régler à la caisse de la boutique se **retire** : la saisie
 * particulier du comptoir ne propose pas la livraison
 * (`commande-particulier-reglee-en-boutique.md`, § 5).
 */
export class ShopTillOrderNotPickupError extends DomainError {
  constructor() {
    super(
      "orders.shop_till.not_pickup",
      "Une commande de particulier notée au comptoir se retire en boutique : la livraison n'est pas proposée sur cette saisie. Choisissez un point de retrait.",
    );
  }
}

/**
 * Le règlement à la caisse de la boutique ne se pose que sur une commande
 * de particulier saisie au comptoir, à la passation — image du CHECK
 * `orders_shop_till_shape` et du déclencheur qui fige le lieu.
 */
export class ShopTillOrderShapeError extends DomainError {
  constructor() {
    super(
      "orders.shop_till.shape",
      "Le règlement à la caisse de la boutique ne vaut que pour une commande de particulier notée au comptoir, au moment où elle est passée : sans société, saisie par l'équipe, et pas encore réglée autrement.",
    );
  }
}

/** La fiche choisie au comptoir n'existe pas. */
export class CounterParticularNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "orders.counter_particular.not_found",
      "Cette fiche particulier est introuvable. Relancez la recherche et choisissez la personne dans la liste.",
    );
  }
}

/** La fiche choisie est rattachée à une société : ce n'est pas un particulier. */
export class CounterBuyerIsCompanyMemberError extends BusinessError {
  constructor() {
    super(
      "orders.counter_particular.company_member",
      "Cette personne est rattachée à une société : sa commande se passe par « Commande pro », au tarif et aux conditions de sa société.",
    );
  }
}

/** La fiche choisie est désactivée. */
export class CounterParticularDisabledError extends BusinessError {
  constructor() {
    super(
      "orders.counter_particular.disabled",
      "Cette fiche particulier est désactivée : aucune commande ne peut lui être notée. Choisissez une autre fiche, ou créez-en une.",
    );
  }
}
