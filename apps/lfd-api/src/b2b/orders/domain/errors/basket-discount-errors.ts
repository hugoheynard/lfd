import { BusinessError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Plus de remises de panier qu'une commande n'en porte** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.8, arbitrage n° 5). Un garde-fou de lisibilité : chaque remise est une
 * ligne du bon, de la facture et du récapitulatif, et au-delà le papier ne se
 * lit plus.
 */
export class TooManyBasketDiscountsError extends BusinessError {
  constructor(
    readonly count: number,
    readonly maximum: number,
  ) {
    super(
      "orders.basket_discounts.too_many",
      `Cette commande cumulerait ${count} remises de panier ; une commande en porte ${maximum} au plus. ` +
        "Rendez une des promotions panier non cumulable, ou restreignez son public ou ses produits.",
    );
  }
}

/**
 * Une composition qui reçoit la remise unique d'hier ET une liste de remises :
 * laquelle appliquer ne se devine pas. Un appelant mal câblé, pas une demande
 * du client — d'où la catégorie technique.
 */
export class AmbiguousBasketDiscountsError extends TechnicalError {
  constructor() {
    super(
      "orders.basket_discounts.ambiguous",
      "Composition de commande reçue avec une remise unique et une liste de remises à la fois.",
    );
  }
}
