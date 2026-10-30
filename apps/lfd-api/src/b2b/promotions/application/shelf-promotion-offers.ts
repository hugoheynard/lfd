import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import type { LivePromotion } from "../domain/live-promotion.js";
import { BasketPromotionReader } from "../domain/ports/basket-promotion.reader.js";
import { offerCandidates } from "../domain/promotion-offers.js";
import { PREVIEWED_FACTS } from "../domain/promotion-targeting.js";
import type { LotBuyer } from "./line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "./promotion-audience-facts.resolver.js";

/**
 * **Les promotions que le rayon peut mentionner** (plan des promotions,
 * § 13.2 RAYON, lot L10) : celles du point panier — conditionnées par
 * l'acheminement — qui visent ce lecteur maintenant.
 *
 * L'aperçu déclaré (`previewed`) n'en
 * mentionne que pour « tout le monde », comme il ne tarife qu'elles.
 */
@Injectable()
export class ShelfPromotionOffers {
  constructor(
    private readonly promotions: BasketPromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
    private readonly clock: Clock,
  ) {}

  async candidatesFor(buyer: LotBuyer): Promise<readonly LivePromotion[]> {
    const all = await this.promotions.live();
    if (all.length === 0) {
      return [];
    }
    const { buyerKind } = buyer;
    const facts =
      buyerKind === "previewed"
        ? PREVIEWED_FACTS
        : await this.facts.factsFor(
            { companyId: buyer.companyId, buyerKind, fulfillment: null },
            all,
          );
    return offerCandidates(all, this.clock.now(), facts);
  }
}
