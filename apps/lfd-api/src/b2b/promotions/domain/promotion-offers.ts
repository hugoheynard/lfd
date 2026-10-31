import { inForceAt, minQuantityOf, type LivePromotion } from "./live-promotion.js";
import type { PromotionEffect } from "./promotion-effect.js";
import type { DeliveryReach, PickupReach } from "./promotion-fulfillment.js";
import {
  promotionScopeCovers,
  type PromotionScopeFacts,
  type PromotionScopePoint,
} from "./promotion-scope.js";
import {
  admittingRankOf,
  fulfillmentAdmits,
  type FulfillmentFact,
  type PromotionAudienceFacts,
} from "./promotion-targeting.js";

/**
 * **Ce qu'une promotion promet sans s'appliquer encore** (`documentation/promotions/promotions.md`, § 2.16, lot L10) — pur.
 *
 * Deux questions que le calcul ne pose pas, parce qu'il n'applique que ce qui
 * s'applique :
 *
 * - au RAYON, l'acheminement est inconnu : une promotion « en retrait » n'y
 *   baisse aucun prix, et c'est voulu — mais elle se DIT ;
 * - au panier d'un INVITÉ, une promotion « inscrits » ne s'applique pas — et
 *   elle se dit aussi, sans jamais lire l'adresse saisie (Hugo, 2026-10-30).
 */

/** L'effet, tel qu'il se dit — `amount` en millicentimes. */
export type OfferEffect =
  | { readonly kind: "percent"; readonly basisPoints: number }
  | { readonly kind: "amount"; readonly millicents: number };

/**
 * L'ENSEMBLE des acheminements qui ouvrent une promotion de panier (`documentation/promotions/promotions.md`, § 2.14) — la
 * boutique dit « au retrait à … » ou « en livraison » selon ce que le
 * client regarde.
 */
export interface OfferFulfillment {
  readonly pickup: PickupReach;
  readonly delivery: DeliveryReach;
}

/** Une promotion de panier qu'un acheminement ouvrirait sur un article. */
export interface FulfillmentOffer {
  readonly promotionId: string;
  readonly effect: OfferEffect;
  readonly fulfillment: OfferFulfillment;
}

const MILLICENTS_PER_CENT = 1_000;

/** L'effet tel qu'il se dit ; `null` pour un prix posé, qui n'est pas un « −X ». */
export function offerEffectOf(effect: PromotionEffect): OfferEffect | null {
  switch (effect.kind) {
    case "percent_off":
      return { kind: "percent", basisPoints: effect.basisPoints };
    case "unit_amount_off":
      return { kind: "amount", millicents: effect.millicents };
    case "basket_amount_off":
      return { kind: "amount", millicents: effect.cents * MILLICENTS_PER_CENT };
    case "fixed_unit_price":
      return null;
  }
}

/**
 * **Les promotions de panier qui visent ce lecteur, à cet instant, quel que
 * soit l'acheminement** — ce que le rayon peut mentionner. Les faits n'ont
 * pas d'acheminement (`fulfillment` ignoré) : c'est précisément ce qu'on ne
 * sait pas encore.
 */
export function offerCandidates(
  promotions: readonly LivePromotion[],
  at: Date,
  facts: PromotionAudienceFacts,
): LivePromotion[] {
  return promotions.filter(
    (promotion) =>
      promotion.fulfillment.kind === "basket" &&
      inForceAt(promotion, at) &&
      admittingRankOf(promotion.audiences, facts) !== null,
  );
}

/** Les candidates qui demandent le produit de l'article (cible `product`). */
export function offersNeedProducts(candidates: readonly LivePromotion[]): boolean {
  return candidates.some((promotion) =>
    promotion.scope.rules.some((rule) => rule.target === "product"),
  );
}

/**
 * **Ce qu'un acheminement ouvrirait sur CET article**, rangé par identifiant
 * pour rester déterministe. Un prix posé n'a pas de « −X » à dire : écarté.
 */
export function fulfillmentOffersFor(
  candidates: readonly LivePromotion[],
  article: PromotionScopeFacts,
): FulfillmentOffer[] {
  const offers: FulfillmentOffer[] = [];
  for (const promotion of candidates) {
    const effect = offerEffectOf(promotion.effect);
    const { fulfillment } = promotion;
    if (
      effect === null ||
      fulfillment.kind === "displayed_price" ||
      !promotionScopeCovers(promotion.scope, article, { kind: "basket" })
    ) {
      continue;
    }
    offers.push({
      promotionId: promotion.id,
      effect,
      fulfillment: { pickup: fulfillment.pickup, delivery: fulfillment.delivery },
    });
  }
  return offers.sort((left, right) => (left.promotionId < right.promotionId ? -1 : 1));
}

/** Une ligne du panier d'un invité, telle que la portée la juge. */
export interface OfferedLine {
  readonly article: PromotionScopeFacts;
  /** L'unité de vente : au point ligne, une famille ou un mode ne vise pas le poids. */
  readonly point: Extract<PromotionScopePoint, { readonly kind: "line" }>;
  /** Pièces, ou grammes au poids : la quantité que la caisse compare au seuil. */
  readonly quantity: number;
}

/** Les faits d'un particulier sans société, pour une porte donnée. */
function individualFacts(
  buyerKind: "guest" | "registered",
  fulfillment: FulfillmentFact | null,
): PromotionAudienceFacts {
  return {
    companyId: null,
    companyStatus: null,
    principal: { companyId: null },
    buyerKind,
    fulfillment,
  };
}

/**
 * **La promotion qu'un invité aurait en se connectant** — réservée aux
 * inscrits (admise pour un particulier inscrit, PAS pour un invité), en
 * vigueur, et dont la portée touche au moins une ligne qui en atteint la
 * quantité minimum — sans quoi la caisse ne retirerait rien après connexion,
 * et l'offre promettrait ce qu'elle ne donne pas. L'acheminement, s'il
 * est choisi, doit l'admettre ; inconnu, il ne l'écarte pas : le message
 * invite, il ne chiffre rien.
 *
 * Entre plusieurs : le plus fort pourcentage, puis un montant, puis un prix
 * posé (sans montant à dire) ; à égalité, le plus petit identifiant.
 * `undefined` : rien à dire.
 */
export function signInOfferFor(
  promotions: readonly LivePromotion[],
  at: Date,
  lines: readonly OfferedLine[],
  fulfillment: FulfillmentFact | null,
): { readonly effect: OfferEffect | null } | undefined {
  const registered = individualFacts("registered", null);
  const guest = individualFacts("guest", null);
  const offered = promotions
    .filter(
      (promotion) =>
        inForceAt(promotion, at) &&
        admittingRankOf(promotion.audiences, registered) !== null &&
        admittingRankOf(promotion.audiences, guest) === null &&
        (fulfillment === null || fulfillmentAdmits(promotion.fulfillment, fulfillment)) &&
        lines.some((line) => touches(promotion, line)),
    )
    .sort((left, right) => offerOrder(left) - offerOrder(right) || (left.id < right.id ? -1 : 1));
  const best = offered[0];
  return best === undefined ? undefined : { effect: offerEffectOf(best.effect) };
}

function touches(promotion: LivePromotion, line: OfferedLine): boolean {
  const threshold = minQuantityOf(promotion);
  if (threshold !== null && line.quantity < threshold) {
    return false;
  }
  const point: PromotionScopePoint =
    promotion.fulfillment.kind === "displayed_price" ? line.point : { kind: "basket" };
  return promotionScopeCovers(promotion.scope, line.article, point);
}

/** Un pourcentage plus fort d'abord (négatif = avant), puis un montant, puis un prix posé. */
function offerOrder(promotion: LivePromotion): number {
  const effect = offerEffectOf(promotion.effect);
  if (effect === null) {
    return 1;
  }
  return effect.kind === "percent" ? -effect.basisPoints : 0;
}
