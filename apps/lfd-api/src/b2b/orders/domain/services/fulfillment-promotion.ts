import { sameValue, type RevisableOrder } from "../entities/order-revision.js";
import type { DraftOrderInput } from "../entities/order-shapes.js";
import { FulfillmentChangeAltersPromotionError } from "../errors/fulfillment-promotion-errors.js";
import { replayableDiscountsOf, type RevisableDiscount } from "./basket-discount-replay.js";
import { termsAdmit, type FulfillmentFact } from "./frozen-discount-terms.js";

/** Une promotion telle que L9 la compare : son identifiant figé, et son libellé pour le refus. */
interface ComparedPromotion {
  readonly promotionId: string | null;
  readonly label: string | null;
}

/**
 * L'acheminement de la composition révisée, et ses promotions — lu sur
 * l'ENTRÉE de l'agrégat, pour que L9 se juge avant les gardes de montant :
 * une remise de retrait emportée en livraison doit être refusée par L9, qui
 * nomme la promotion et le geste, pas par la garde technique du montant.
 */
export interface RevisedFulfillment {
  readonly method: "pickup" | "delivery";
  readonly pickupSiteId: string | null;
  readonly zoneId: string | null;
  readonly deliveryAddress: unknown;
  readonly promotions: readonly ComparedPromotion[];
}

/** L'entrée, réduite comme `normalizeFulfillment` la réduira. */
export function revisedFulfillmentOf(input: DraftOrderInput): RevisedFulfillment {
  const { fulfillment } = input;
  const pickup = fulfillment.method === "pickup";
  return {
    method: fulfillment.method,
    pickupSiteId: pickup ? (fulfillment.pickupAddress?.siteId ?? null) : null,
    zoneId: pickup ? null : fulfillment.deliveryZoneId,
    deliveryAddress: pickup ? null : fulfillment.deliveryAddress,
    promotions: promotionsAfter(input),
  };
}

/**
 * **L9 — changer d'acheminement ne change pas les promotions**, jugé contre la
 * **cible figée** de chaque remise (`documentation/promotions/plan-remises-acquises.md`,
 * § 10.2, qui remplace la comparaison rang par rang du lot M3). Seulement quand
 * le mode, le point ou l'adresse livrée change (l'adresse, parce que la ZONE
 * entre dans le fait, `promotions.md` § 2.14) : une révision qui garde
 * l'acheminement se recompose comme avant.
 *
 * La révision REJOUE les remises de la commande, elle ne les rejuge plus :
 * aucune ne s'ajoute, et une remise dont tous les articles sont retirés
 * disparaît sans rien coûter. Reste à savoir si celles qui demeurent
 * admettaient le nouvel acheminement — un point d'une autre liste, une zone
 * d'une autre, le retrait quitté pour la livraison. Sinon, refus.
 *
 * Une remise sans termes figés (pas encore reprise, ou d'avant L9) ne dit pas
 * sa cible : on ne peut pas affirmer qu'elle suit la commande, et le
 * changement est refusé — jamais une remise gardée au hasard.
 *
 * Défense en profondeur : une promotion présente après et pas avant est
 * refusée aussi (« ajoute »), ce que le rejeu ne produit pas.
 *
 * @throws {FulfillmentChangeAltersPromotionError}
 */
export function ensureFulfillmentKeepsPromotion(
  order: RevisableOrder,
  after: RevisedFulfillment,
): void {
  if (!fulfillmentChanged(order, after)) {
    return;
  }
  const before = replayableDiscountsOf(order);
  const knownIds = new Set(before.map((discount) => discount.promotionId));
  const added = after.promotions.find((has) => !knownIds.has(has.promotionId));
  if (added !== undefined) {
    throw new FulfillmentChangeAltersPromotionError(order.orderId, "adds", added.label);
  }
  const fact: FulfillmentFact = {
    method: after.method,
    pickupId: after.pickupSiteId,
    zoneId: after.zoneId,
  };
  for (const discount of before.filter((had) => stillApplied(had, after.promotions))) {
    if (discount.terms === null || !termsAdmit(discount.terms, fact)) {
      throw new FulfillmentChangeAltersPromotionError(order.orderId, "removes", discount.label);
    }
  }
}

/** Mode, point ou adresse livrée — les changements qui touchent une cible d'acheminement. */
function fulfillmentChanged(order: RevisableOrder, after: RevisedFulfillment): boolean {
  const before = order.fulfillment;
  return (
    before.method !== after.method ||
    (before.pickupAddress?.siteId ?? null) !== after.pickupSiteId ||
    !sameValue(before.deliveryAddress, after.deliveryAddress)
  );
}

/** La remise est-elle encore dans la nouvelle composition ? Par identifiant (`null` compris). */
function stillApplied(had: RevisableDiscount, after: readonly ComparedPromotion[]): boolean {
  return after.some((has) => has.promotionId === had.promotionId);
}

function promotionsAfter(input: DraftOrderInput): readonly ComparedPromotion[] {
  if (input.basketDiscounts !== undefined) {
    return input.basketDiscounts.map((discount) => ({
      promotionId: discount.promotionId,
      label: discount.label?.fr ?? null,
    }));
  }
  // La remise unique se lit par la PRÉSENCE d'un ajustement, pas par le
  // montant : arrondie à zéro, elle reste la promotion de la commande.
  if (input.discountAdjustment === null) {
    return [];
  }
  return [
    {
      promotionId: input.discountPromotionId ?? null,
      label: input.discountLabel?.fr ?? null,
    },
  ];
}
