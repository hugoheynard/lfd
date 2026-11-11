import { Injectable } from "@nestjs/common";

import { LinePromotionSupply } from "../../promotions/application/line-promotion-supply.js";
import { PromotionAudienceFactsResolver } from "../../promotions/application/promotion-audience-facts.resolver.js";
import {
  promotionsAdmitted,
  type AdmittedPromotion,
  type LivePromotion,
} from "../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../promotions/domain/ports/basket-promotion.reader.js";
import type { PromotionAudienceFacts } from "../../promotions/domain/promotion-targeting.js";
import type { PriceGridContext } from "./price-grid-context.js";

/** Les promotions que ce public reçoit, des deux points d'application. */
export interface PriceGridPromotionSet {
  /** Dans le prix affiché : la porte du prix les applique déjà. */
  readonly displayedPrice: readonly AdmittedPromotion[];
  /** Au panier : celles que la caisse admettrait pour cet acheminement. */
  readonly basket: readonly AdmittedPromotion[];
}

/**
 * **Les promotions applicables à une grille** (`export-grille-de-prix.md`,
 * § 2.4) — par les mêmes fabriques que la caisse :
 *
 * - le point ligne par `LinePromotionSupply`, la source même du chargeur des
 *   prix (les faits de la société servie, à l'instant demandé) ;
 * - le point panier par `BasketPromotionReader` et `PromotionAudienceFactsResolver`,
 *   jugé comme `BasketPromotions` le fait au devis — sans créneau : une
 *   promotion à heures ne s'y applique pas, comme au devis sans créneau.
 *
 * Les deux jugent le MÊME acheteur (`context.buyer`) : jusqu'au 2026-10-31,
 * l'offre de ligne lisait le compte de tarif et les faits du panier la société
 * choisie (§ 8). Un pro type apporte ses faits déclarés, sans résolveur.
 */
@Injectable()
export class PriceGridPromotions {
  constructor(
    private readonly lines: LinePromotionSupply,
    private readonly baskets: BasketPromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
  ) {}

  async of(context: PriceGridContext): Promise<PriceGridPromotionSet> {
    const [displayedPrice, all] = await Promise.all([
      this.lines.forLot(context.buyer, context.judgedAt, context.replay),
      context.replay ? this.baskets.liveAt(context.judgedAt) : this.baskets.live(),
    ]);
    const facts = await this.basketFactsOf(context, all);
    return {
      displayedPrice,
      basket: promotionsAdmitted(all, context.judgedAt, facts, null),
    };
  }

  /** Les faits du panier, l'acheminement compris. */
  private basketFactsOf(
    context: PriceGridContext,
    candidates: readonly LivePromotion[],
  ): Promise<PromotionAudienceFacts> {
    const { buyer, fulfillment } = context;
    switch (buyer.kind) {
      case "typical":
        return Promise.resolve({ ...buyer.facts, fulfillment });
      case "real":
        return this.facts.factsFor(
          { companyId: buyer.companyId, buyerKind: buyer.buyerKind, fulfillment },
          candidates,
        );
    }
  }
}
