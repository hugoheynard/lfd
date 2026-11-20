import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Une commande à régler à la caisse de la boutique se **retire** : une
 * modification ne la fait pas passer en livraison
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5). Le lieu de
 * règlement est figé à la passation, et une livraison ne passe pas par la
 * caisse.
 */
export class ShopTillOrderRevisedToDeliveryError extends DomainError {
  constructor() {
    super(
      "orders.revision.shop_till_delivery",
      "Cette commande se règle à la caisse de la boutique : elle se retire en boutique et ne peut pas passer en livraison. Gardez un point de retrait : le point, le jour et le créneau peuvent changer.",
    );
  }
}
