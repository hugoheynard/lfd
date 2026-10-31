import { minQuantityOf, type LivePromotion } from "../../../promotions/domain/live-promotion.js";
import type {
  DeliveryReach,
  PickupReach,
} from "../../../promotions/domain/promotion-fulfillment.js";

/**
 * **Les termes d'une remise de panier, figés à la passation** —
 * `documentation/promotions/plan-remises-acquises.md`, § 10.2 et § 10.3.
 *
 * Ce que la révision REJOUE au lieu de relire la promotion : une promotion
 * archivée, suspendue ou expirée depuis reste acquise, et ses conditions
 * d'hier — pas celles d'aujourd'hui — décident encore. Le caractère cumulable
 * dit le plan choisi à la passation (M7), qu'on ne recompare pas.
 */
export interface FrozenDiscountTerms {
  readonly cumulative: boolean;
  /** Le seuil `min_quantity` de la promotion, par ligne couverte ; `null` = sans seuil. */
  readonly minQuantity: number | null;
  /** La cible d'acheminement — retrait et livraison, la forme de la promotion (§ 2.14). */
  readonly pickup: PickupReach;
  readonly delivery: DeliveryReach;
  /** `placed` : figé à la passation ; `backfilled` : déduit de la promotion par la reprise. */
  readonly origin: FrozenTermsOrigin;
}

export type FrozenTermsOrigin = "placed" | "backfilled";

/**
 * Les termes d'une promotion de panier, au moment où elle est retenue. Une
 * promotion « dans le prix affiché » n'est jamais au panier : `null`.
 */
export function placedTermsOf(promotion: LivePromotion): FrozenDiscountTerms | null {
  const { fulfillment } = promotion;
  if (fulfillment.kind !== "basket") {
    return null;
  }
  return {
    cumulative: promotion.cumulative,
    minQuantity: minQuantityOf(promotion),
    pickup: fulfillment.pickup,
    delivery: fulfillment.delivery,
    origin: "placed",
  };
}

/** L'acheminement d'une commande tel qu'une cible le juge : le mode, le point ou la zone. */
export interface FulfillmentFact {
  readonly method: "pickup" | "delivery";
  /** Le site qui remet, en retrait ; `null` s'il n'est pas connu. */
  readonly pickupId: string | null;
  /** La zone, en livraison. */
  readonly zoneId: string | null;
}

/**
 * La cible figée admet-elle cet acheminement ? La même lecture que la
 * caisse (`fulfillmentRankOf`), mais sur la cible FIGÉE : « tous les
 * points » admet tout retrait, une sélection n'admet que ses points.
 */
export function termsAdmit(terms: FrozenDiscountTerms, fact: FulfillmentFact): boolean {
  if (fact.method === "pickup") {
    return reaches(terms.pickup, fact.pickupId, (reach) => reach.points);
  }
  return reaches(terms.delivery, fact.zoneId, (reach) => reach.zones);
}

function reaches<T extends object>(
  reach: "none" | "all" | T,
  id: string | null,
  listOf: (reach: T) => readonly string[],
): boolean {
  if (reach === "none") {
    return false;
  }
  if (reach === "all") {
    return true;
  }
  return id !== null && listOf(reach).includes(id);
}
