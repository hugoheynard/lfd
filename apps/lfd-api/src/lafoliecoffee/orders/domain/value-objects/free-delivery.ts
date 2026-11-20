import type { CartAdjustment, OrderFreeDeliveryView } from "@lfd/contracts";

import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **La livraison offerte figée sur une commande** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, 1a et § 2.8 ;
 * décisions de Hugo du 2026-11-05) : la livraison est offerte — par le franco
 * de la route ou par une promotion « Sur la livraison » — et la commande
 * retient ce qu'elle aurait coûté, le seuil de la route et la promotion qui
 * l'a offerte.
 *
 * La ligne « Livraison offerte » est AFFICHÉE, pas comptable : le frais
 * facturé vaut 0, la facture, sa TVA et Factur-X n'en savent rien. Le barème
 * offert reste celui de la commande (`deliveryFeeAdjustment`), pour que la
 * révision le rejuge contre le seuil figé (1b).
 *
 * 🔴 Le franco se juge sur le panier **commandé** : un départ incomplet ne le
 * fait pas perdre — c'est le défaut qui suit « figé à la passation ». Le bon
 * partiel et le soldé facturent donc un frais nul.
 */
export interface FreeDelivery {
  /**
   * Le seuil HT du **franco de la route**, en centimes — celui que la
   * révision relit dans la même zone. `null` = la route n'avait pas de
   * franco : la livraison a été offerte par la promotion.
   */
  readonly thresholdCents: number | null;
  /** Ce que la livraison aurait coûté, HT, en centimes. */
  readonly waivedCents: number;
  /** La même chose TTC — commande `exact_ht` seulement, `null` sinon. */
  readonly waivedTtcCents: number | null;
  /** La promotion qui a offert ; `null` = le franco de la route. */
  readonly promotion: FreeDeliveryPromotion | null;
}

/**
 * **La promotion qui a offert la livraison**, figée : son identifiant, son
 * panier minimum (0 = « toujours offerte ») et son libellé dans l'audience
 * de l'acheteur — les documents la nomment sans relire une promotion
 * modifiée depuis. La révision, elle, la rejuge (§ 2.8, B3).
 */
export interface FreeDeliveryPromotion {
  readonly promotionId: string;
  readonly thresholdCents: number;
  readonly label: FreeDeliveryLabel;
}

/** Un libellé figé, trois langues sans trou — la forme de `discount_label`. */
export interface FreeDeliveryLabel {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

/**
 * La livraison offerte, si elle est bien formée : des centimes entiers,
 * positifs ou nuls, et quelqu'un qui l'offre — la route ou une promotion
 * nommée.
 *
 * @throws {InvalidFreeDeliveryError}
 */
export function freeDeliveryOf(value: FreeDelivery): FreeDelivery {
  const { promotion } = value;
  const amounts = [
    value.thresholdCents ?? 0,
    value.waivedCents,
    value.waivedTtcCents ?? 0,
    promotion?.thresholdCents ?? 0,
  ];
  if (
    !amounts.every((cents) => Number.isSafeInteger(cents) && cents >= 0) ||
    (value.thresholdCents === null && promotion === null) ||
    (promotion !== null &&
      (promotion.promotionId.trim() === "" || promotion.label.fr.trim() === ""))
  ) {
    throw new InvalidFreeDeliveryError();
  }
  return { ...value };
}

/**
 * **La base atteint-elle un seuil qui offre ?** Celui de la promotion quand
 * elle a offert, ou celui de la route — « dès » le seuil. L'éligibilité de la
 * promotion (public, zone, heures) se juge au calcul : l'agrégat ne voit pas
 * le public, il revérifie le montant.
 */
export function freeDeliveryReached(freeDelivery: FreeDelivery, goodsNetHtCents: number): boolean {
  const { thresholdCents, promotion } = freeDelivery;
  return (
    (thresholdCents !== null && goodsNetHtCents >= thresholdCents) ||
    (promotion !== null && goodsNetHtCents >= promotion.thresholdCents)
  );
}

/**
 * **Le barème que la commande FACTURE** : aucun au franco, le barème figé
 * sinon. Tout lecteur qui recompose un frais (bon partiel, reprise des
 * remises, soldé) passe par ici — recomposer depuis le barème figé seul
 * facturerait le frais plein d'une livraison offerte.
 */
export function billedDeliveryFeeOf(
  frozenFee: CartAdjustment | null,
  freeDelivery: FreeDelivery | null,
): CartAdjustment | null {
  return freeDelivery === null ? frozenFee : null;
}

/**
 * **Ce que les documents lisent de la livraison offerte** : le barème offert
 * et, quand une promotion l'a offert, son libellé figé — jamais son
 * identifiant ni les seuils, qui restent au serveur. `null` sans livraison
 * offerte.
 */
export function freeDeliveryViewOf(
  freeDelivery: FreeDelivery | null,
): OrderFreeDeliveryView | null {
  if (freeDelivery === null) {
    return null;
  }
  const label = freeDelivery.promotion?.label;
  return {
    waivedCents: freeDelivery.waivedCents,
    waivedTtcCents: freeDelivery.waivedTtcCents,
    ...(label === undefined ? {} : { label: { fr: label.fr, en: label.en, it: label.it } }),
  };
}

/** Un franco qui ne se compte pas en centimes entiers et positifs — 400. */
export class InvalidFreeDeliveryError extends DomainError {
  constructor() {
    super(
      "orders.free_delivery.invalid",
      "La livraison offerte de cette commande porte un seuil ou un montant qui n'est pas un nombre entier de centimes positif, ou ne dit pas qui l'a offerte. Signalez-le à l'équipe technique avec le numéro de la commande.",
    );
  }
}
