import type { LivePromotion } from "../domain/live-promotion.js";
import type { LotBuyer, RealLotBuyer } from "../domain/lot-buyer.js";
import { PREVIEWED_FACTS, type PromotionAudienceFacts } from "../domain/promotion-targeting.js";
import type { PromotionAudienceFactsResolver } from "./promotion-audience-facts.resolver.js";

/**
 * **Les faits d'audience d'un acheteur de lot, hors acheminement** — le point
 * ligne et le rayon (`LinePromotionSupply`, `ShelfPromotionOffers`).
 *
 * Des `switch` exhaustifs, pas des ternaires (`plan-export-grille-de-prix.md`,
 * § 8.2) : une sorte d'acheteur ajoutée sans sa branche ne compile pas, au
 * lieu de tomber dans « l'autre cas » et d'y lire une société qui n'existe pas.
 *
 * Un acheteur type apporte ses faits, construits en amont : il ne passe PAS par
 * `PromotionAudienceFactsResolver`, qui rend « particulier » sans société avant
 * même de lire un statut.
 */
export function lotBuyerFacts(
  buyer: LotBuyer,
  candidates: readonly LivePromotion[],
  resolver: PromotionAudienceFactsResolver,
): Promise<PromotionAudienceFacts> {
  switch (buyer.kind) {
    case "typical":
      return Promise.resolve({ ...buyer.facts, fulfillment: null });
    case "real":
      return realBuyerFacts(buyer, candidates, resolver);
  }
}

function realBuyerFacts(
  buyer: RealLotBuyer,
  candidates: readonly LivePromotion[],
  resolver: PromotionAudienceFactsResolver,
): Promise<PromotionAudienceFacts> {
  const { buyerKind } = buyer;
  switch (buyerKind) {
    case "previewed":
      return Promise.resolve(PREVIEWED_FACTS);
    case "guest":
    case "registered":
    case "unknown":
      return resolver.factsFor(
        { companyId: buyer.companyId, buyerKind, fulfillment: null },
        candidates,
      );
  }
}
