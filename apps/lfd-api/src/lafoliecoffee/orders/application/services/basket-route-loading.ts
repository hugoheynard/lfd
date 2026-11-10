import type { CartAdjustment, PickupAddressView, PickupSnapshot, WindowMode } from "@lfd/contracts";

import { AppError } from "../../../../platform/shared/errors/app-error.js";
import type { LoadedBasketPromotions } from "../../domain/services/loaded-basket-promotions.js";
import type { CartAdjustments, PickupBuyer } from "./cart-adjustments.service.js";

/*
 * Les lectures d'acheminement du chargement (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 2.1) —
 * sorties de `PricingContext` le 2026-11-03 (lot L2) pour que le panier de la
 * commande et le panier partiel du devis lisent le point et la zone par les
 * mêmes appels, dans le même ordre.
 */

/** Une lecture qui a rendu sa valeur, ou un refus. */
export type Attempt<T> = { readonly value: T } | { readonly refusal: AppError };

/**
 * Lit, et rend un refus métier en DONNÉE au lieu de le lever. Une panne
 * technique, elle, n'est pas un refus : elle remonte telle quelle.
 */
export async function refusalOrValue<T>(read: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { value: await read() };
  } catch (error) {
    if (error instanceof AppError && error.category !== "technical") {
      return { refusal: error };
    }
    throw error;
  }
}

/** Le point retenu — choisi ou présélectionné — et les promotions qui s'y lisent. */
export interface LoadedPickupPoint {
  readonly point: PickupAddressView;
  readonly promotions: LoadedBasketPromotions;
}

/**
 * Le point choisi ou présélectionné, ouvert à la clientèle, puis les
 * promotions de CE point (§ 13.6). La tranche n'est pas jugée ici : c'est un
 * refus de la commande, que le devis ne prédit pas encore (É5).
 */
export async function loadPickupPoint(
  adjustments: CartAdjustments,
  pickupAddressId: string | null,
  buyer: PickupBuyer,
): Promise<Attempt<LoadedPickupPoint>> {
  const point = await refusalOrValue(() =>
    adjustments.pickupPoint(pickupAddressId, buyer.audience, buyer.companyId),
  );
  if ("refusal" in point) {
    return point;
  }
  const promotions = await adjustments.promotionsFor({
    ...factsOf(buyer),
    fulfillment: { method: "pickup", pickupId: point.value.id },
  });
  return { value: { point: point.value, promotions } };
}

/**
 * La zone déduite du code postal, le barème de la clientèle de l'acheteur
 * (résolu, 0b), le mode créneau global, et ses promotions.
 */
export interface LoadedDeliveryZone {
  readonly zoneId: string;
  readonly fee: CartAdjustment;
  /** Le franco de la clientèle (1b) ; `null` = aucun. */
  readonly freeDeliveryThresholdCents: number | null;
  readonly globalWindowMode: WindowMode;
  readonly promotions: LoadedBasketPromotions;
}

/**
 * La zone du code postal livré — la livraison ouverte à la clientèle d'abord
 * —, puis les promotions de cette zone (`promotions.md`, § 2.14). Le code
 * postal suffit au prix (É4) : l'adresse complète est un contrôle de la
 * commande.
 */
export async function loadDeliveryZone(
  adjustments: CartAdjustments,
  codePostal: string,
  buyer: PickupBuyer,
): Promise<Attempt<LoadedDeliveryZone>> {
  const delivery = await refusalOrValue(() =>
    adjustments.deliveryRoute(codePostal, buyer.audience),
  );
  if ("refusal" in delivery) {
    return delivery;
  }
  const { zone, fee, freeDeliveryThresholdCents, globalWindowMode } = delivery.value;
  const promotions = await adjustments.promotionsFor({
    ...factsOf(buyer),
    fulfillment: { method: "delivery", zoneId: zone.id },
  });
  return {
    value: { zoneId: zone.id, fee, freeDeliveryThresholdCents, globalWindowMode, promotions },
  };
}

/** Les faits que les promotions panier lisent de l'acheteur, l'acheminement à part. */
function factsOf(buyer: PickupBuyer): Omit<PickupBuyer, "audience"> {
  return {
    companyId: buyer.companyId,
    companyStatus: buyer.companyStatus,
    buyerKind: buyer.buyerKind,
  };
}

/**
 * Le point de retrait résolu, réduit à ses champs postaux — et à l'id du site
 * qui remet (lot S2). L'id est celui du point RÉSOLU.
 */
export function toSnapshot(point: PickupAddressView): PickupSnapshot {
  return {
    siteId: point.id,
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
  };
}
