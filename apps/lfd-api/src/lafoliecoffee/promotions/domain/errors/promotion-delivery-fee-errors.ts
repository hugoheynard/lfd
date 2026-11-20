import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus d'une promotion « Livraison offerte »**
 * (`documentation/livraisons/frais-et-livraison-offerte.md`). Lus par du
 * personnel qui n'a pas le code sous les yeux : chaque message nomme le cas
 * et le geste de sortie.
 */

/** Ce qu'une promotion sur la livraison ne porte pas. */
export type DeliveryFeeForeignOption = "scope" | "cumulative" | "min_quantity";

const FOREIGN_MESSAGES: Readonly<Record<DeliveryFeeForeignOption, string>> = {
  scope:
    "Une promotion « Livraison offerte » offre le frais de la commande entière : elle ne vise pas d'articles. Retirez les familles, produits ou déclinaisons de la portée.",
  cumulative:
    "Une promotion « Livraison offerte » ne se cumule pas : deux livraisons offertes n'en font qu'une, et la commande retient la plus favorable. Décochez « Cumulable ».",
  min_quantity:
    "Une promotion « Livraison offerte » ne se juge pas sur la quantité d'un article : retirez la quantité minimum, et posez un panier minimum si la livraison n'est offerte qu'à partir d'un montant.",
};

/** Une option qui n'a pas de sens sur le frais de livraison. */
export class PromotionDeliveryFeeForeignOptionError extends DomainError {
  constructor(readonly option: DeliveryFeeForeignOption) {
    super("promotions.delivery_fee_foreign_option", FOREIGN_MESSAGES[option]);
  }
}

/**
 * Un panier minimum hors d'une promotion sur la livraison : sur une remise au
 * panier, il dépendrait d'un total que la remise elle-même change (décision
 * (c) de Hugo, 2026-11-05).
 */
export class PromotionMinBasketOutsideDeliveryFeeError extends DomainError {
  constructor() {
    super(
      "promotions.min_basket_outside_delivery_fee",
      "Le panier minimum ne se pose que sur une promotion « Livraison offerte » : sur une remise, il dépendrait du total qu'elle réduit. Retirez-le, ou choisissez « Livraison offerte ».",
    );
  }
}

/** Un panier minimum qui n'est pas un nombre entier de centimes positif ou nul. */
export class PromotionInvalidMinBasketError extends DomainError {
  constructor(readonly cents: number) {
    super(
      "promotions.invalid_min_basket",
      `Le panier minimum vaut ${String(cents)} centimes : il doit être un montant HT positif ou nul, au centime près.`,
    );
  }
}

/** Deux paniers minimum sur une même promotion. */
export class PromotionRepeatedMinBasketError extends DomainError {
  constructor() {
    super(
      "promotions.repeated_min_basket",
      "Cette promotion porte deux paniers minimum : gardez-en un seul.",
    );
  }
}
