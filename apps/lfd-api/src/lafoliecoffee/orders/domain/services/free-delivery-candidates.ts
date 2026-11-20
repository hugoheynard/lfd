import type { LocalMoment } from "@lfd/contracts";

import {
  promotionsAdmitted,
  type LivePromotion,
} from "../../../promotions/domain/live-promotion.js";
import { minBasketCentsOf } from "../../../promotions/domain/promotion-condition.js";
import type { PromotionAudienceFacts } from "../../../promotions/domain/promotion-targeting.js";
import type { OrderDiscountLabel } from "../entities/order-shapes.js";

/**
 * **Ce que le calcul a LU des promotions « Sur la livraison »**
 * (`documentation/promotions/plan-livraison-offerte.md`, § 2.4) — la forme
 * de `LoadedBasketPromotions` : l'instant, les vivantes, les faits de
 * l'acheteur, l'acheminement (la zone) compris.
 */
export interface LoadedDeliveryFeePromotions {
  readonly at: Date;
  readonly live: readonly LivePromotion[];
  readonly facts: PromotionAudienceFacts;
}

/** Aucune promotion sur la livraison : un retrait, ou rien à lire. */
export const NO_DELIVERY_FEE_PROMOTIONS: readonly FreeDeliveryCandidate[] = [];

/** Qui offre : le franco de la route, ou une promotion nommée. */
export type FreeDeliverySource =
  | { readonly kind: "route" }
  | {
      readonly kind: "promotion";
      readonly promotionId: string;
      /** Le libellé dans l'audience de l'acheteur, figé tel quel. */
      readonly label: OrderDiscountLabel;
    };

/** **Un seuil candidat** : « offerte dès X € HT », et qui l'offre. */
export interface FreeDeliveryCandidate {
  readonly thresholdCents: number;
  readonly source: FreeDeliverySource;
}

/**
 * **Les promotions sur la livraison qui admettent cet acheteur, dans cette
 * zone, à cet instant** — public, acheminement, fenêtre, pause, jours et
 * heures, par le jugement même des promotions de panier. Le seuil est le
 * panier minimum, 0 sans lui (« toujours offerte »).
 */
export function deliveryFeePromotionCandidates(
  loaded: LoadedDeliveryFeePromotions,
  handoverAt: LocalMoment | null,
): readonly FreeDeliveryCandidate[] {
  return promotionsAdmitted(loaded.live, loaded.at, loaded.facts, handoverAt)
    .filter((promotion) => promotion.fulfillment.kind === "delivery_fee")
    .map((promotion) => ({
      thresholdCents: minBasketCentsOf(promotion.conditions) ?? 0,
      source: { kind: "promotion", promotionId: promotion.id, label: promotion.servedLabel },
    }));
}

/** Les candidats d'une livraison : le franco de la route s'il existe, puis les promotions. */
export function freeDeliveryCandidatesOf(
  routeThresholdCents: number | null,
  promotions: readonly FreeDeliveryCandidate[],
): readonly FreeDeliveryCandidate[] {
  return routeThresholdCents === null
    ? promotions
    : [{ thresholdCents: routeThresholdCents, source: { kind: "route" } }, ...promotions];
}

/**
 * **Le seuil retenu** (`plan-livraison-offerte.md`, § 2.3) : le plus bas
 * parmi ceux que la base atteint ; sinon le plus bas de tous, pour « Plus
 * que … ». `null` sans candidat. Deux livraisons offertes ne se cumulent pas.
 *
 * À seuil égal, la promotion l'emporte sur la route (le cadeau se nomme),
 * puis l'identifiant de promotion le plus petit — un départage propre à ce
 * choix, déterministe.
 */
export function chosenFreeDeliveryCandidate(
  candidates: readonly FreeDeliveryCandidate[],
  goodsNetHtCents: number,
): FreeDeliveryCandidate | null {
  const reached = candidates.filter((candidate) => candidate.thresholdCents <= goodsNetHtCents);
  const pool = reached.length > 0 ? reached : candidates;
  return [...pool].sort(byFavour)[0] ?? null;
}

function byFavour(left: FreeDeliveryCandidate, right: FreeDeliveryCandidate): number {
  if (left.thresholdCents !== right.thresholdCents) {
    return left.thresholdCents - right.thresholdCents;
  }
  const leftRank = rankOf(left.source);
  const rightRank = rankOf(right.source);
  return leftRank < rightRank ? -1 : leftRank > rightRank ? 1 : 0;
}

/** La promotion avant la route (« p:… » < « r »), puis par identifiant. */
function rankOf(source: FreeDeliverySource): string {
  return source.kind === "promotion" ? `p:${source.promotionId}` : "r";
}
