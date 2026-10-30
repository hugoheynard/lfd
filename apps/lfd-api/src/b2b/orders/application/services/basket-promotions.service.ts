import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { AppError } from "../../../../platform/shared/errors/app-error.js";
import {
  PromotionAudienceFactsResolver,
  type KnownBuyerFacts,
} from "../../../promotions/application/promotion-audience-facts.resolver.js";
import { promotionsAdmitted } from "../../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../../promotions/domain/ports/basket-promotion.reader.js";
import { PromotionShadowJournal } from "../../../promotions/domain/ports/promotion-shadow.journal.js";
import { PromotionsSourceReader } from "../../../promotions/domain/ports/promotions-source.reader.js";
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
 * **Le point PANIER, et la source qui décide s'il sert** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.5, lot L5).
 *
 * L'appelant a déjà calculé la remise de l'ancien chemin (`legacy`) ; ce
 * service lit la source et rend ce qui est SERVI :
 *
 * - `legacy` : l'ancien, sans rien lire d'autre ;
 * - `shadow` : l'ancien, après avoir calculé le nouveau et consigné tout
 *   écart de montant (`promotions.shadow_divergence`) ;
 * - `promotions` : le nouveau.
 *
 * La fenêtre se juge à l'instant de la question — le `now` du `Clock`, comme
 * les règles de prix au présent. Aucune lecture datée d'un panier n'existe
 * encore : quand elle viendra, elle passera son `at` (§ 14 S-instant).
 */
@Injectable()
export class BasketPromotions {
  constructor(
    private readonly sources: PromotionsSourceReader,
    private readonly promotions: BasketPromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
    private readonly classifications: OrderLineClassificationReader,
    private readonly journal: PromotionShadowJournal,
    private readonly clock: Clock,
  ) {}

  /** @param legacy la remise de retrait de l'ancien chemin, déjà calculée. */
  async served(
    legacy: BasketPromotionOutcome,
    request: BasketPromotionRequest,
  ): Promise<BasketPromotionOutcome> {
    const source = await this.sources.current();
    if (source === "legacy") {
      return legacy;
    }
    if (source === "promotions") {
      return this.resolve(request);
    }
    await this.compareInShadow(legacy, request);
    return legacy;
  }

  /** La promotion panier de ce panier, par le nouveau chemin seul. */
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

  private async compareInShadow(
    legacy: BasketPromotionOutcome,
    request: BasketPromotionRequest,
  ): Promise<void> {
    const pickupId = request.buyer.fulfillment?.pickupId ?? "";
    let fresh: BasketPromotionOutcome;
    try {
      fresh = await this.resolve(request);
    } catch (error) {
      // L'ombre ne fait pas tomber une commande que l'ancien chemin sait chiffrer.
      this.journal.divergence({
        point: "failure",
        code: error instanceof AppError ? error.code : "unexpected",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (fresh.discountCents !== legacy.discountCents) {
      this.journal.divergence({
        point: "basket",
        pickupId,
        servedCents: legacy.discountCents,
        shadowCents: fresh.discountCents,
        shadowPromotionId: fresh.promotionId,
      });
    }
  }
}
