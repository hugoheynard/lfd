import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  PromotionAudienceFactsResolver,
  type KnownBuyerFacts,
} from "../../../promotions/application/promotion-audience-facts.resolver.js";
import { DeliveryFeePromotionReader } from "../../../promotions/domain/ports/delivery-fee-promotion.reader.js";
import type { LoadedDeliveryFeePromotions } from "../../domain/services/free-delivery-candidates.js";

/**
 * **Les promotions « Sur la livraison » de cet acheteur, chargées**
 * (`documentation/promotions/plan-livraison-offerte.md`, § 2.4) : l'instant,
 * les promotions vivantes et les faits de l'acheteur — ceux du CLIENT, y
 * compris quand l'équipe commande pour lui (`KnownBuyerFacts` est établi par
 * l'appelant à partir des parties de la commande).
 *
 * Ne choisit rien : le jugement (public, zone, fenêtre, heures, panier
 * minimum) est un calcul de `priceBasket`, qui connaît la base du franco.
 * Les faits sont résolus contre CES promotions : une société n'est relue en
 * base que si l'une d'elles la vise.
 */
@Injectable()
export class DeliveryFeePromotions {
  constructor(
    private readonly promotions: DeliveryFeePromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
    private readonly clock: Clock,
  ) {}

  async load(buyer: KnownBuyerFacts): Promise<LoadedDeliveryFeePromotions> {
    const at = this.clock.now();
    const live = await this.promotions.live();
    const facts = await this.facts.factsFor(buyer, live);
    return { at, live, facts };
  }
}
