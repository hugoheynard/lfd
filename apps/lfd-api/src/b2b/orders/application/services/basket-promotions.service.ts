import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  PromotionAudienceFactsResolver,
  type KnownBuyerFacts,
} from "../../../promotions/application/promotion-audience-facts.resolver.js";
import { promotionsAdmitted } from "../../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../../promotions/domain/ports/basket-promotion.reader.js";
import {
  chooseBasketPromotion,
  needsClassifications,
  type BasketLine,
  type BasketPromotionOutcome,
} from "../../domain/services/basket-promotion-choice.js";
import {
  type OrderLineClassification,
  OrderLineClassificationReader,
} from "../../domain/ports/order-line-classification.reader.js";

/** Ce que la caisse sait du panier quand elle demande sa promotion panier. */
export interface BasketPromotionRequest {
  readonly lines: readonly BasketLine[];
  /** Établis au serveur — l'acheminement retenu compris (point présélectionné inclus). */
  readonly buyer: KnownBuyerFacts;
  /** Le rangement que la passation a déjà lu ; `null` au devis. */
  readonly known: ReadonlyMap<string, OrderLineClassification> | null;
}

/**
 * **Le point PANIER** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.5, lots L5 et L12) : la promotion panier de ce panier. Depuis L12, la
 * seule source — la remise d'un site n'est plus lue.
 *
 * La fenêtre se juge à l'instant de la question — le `now` du `Clock`, comme
 * les règles de prix au présent. Aucune lecture datée d'un panier n'existe
 * encore : quand elle viendra, elle passera son `at` (§ 14 S-instant).
 */
@Injectable()
export class BasketPromotions {
  constructor(
    private readonly promotions: BasketPromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
    private readonly classifications: OrderLineClassificationReader,
    private readonly clock: Clock,
  ) {}

  /** La promotion panier de ce panier. */
  async resolve(request: BasketPromotionRequest): Promise<BasketPromotionOutcome> {
    const at = this.clock.now();
    const all = await this.promotions.live();
    const facts = await this.facts.factsFor(request.buyer, all);
    const candidates = promotionsAdmitted(all, at, facts);
    const known =
      request.known ??
      (needsClassifications(candidates)
        ? await this.classifications.classify(request.lines.map((line) => line.sku))
        : new Map<string, OrderLineClassification>());
    return chooseBasketPromotion(candidates, request.lines, known);
  }
}
