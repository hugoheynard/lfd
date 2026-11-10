import { Injectable } from "@nestjs/common";

import { PromotionCatalogueReader } from "../../domain/ports/promotion-catalogue.reader.js";
import { PromotionRivalsReader } from "../../domain/ports/promotion-rivals.reader.js";
import { applicationPointOf } from "../../domain/promotion-fulfillment.js";
import {
  assertCumulativeBasketCapacity,
  assertNoOverlap,
  assertSingleBasketPromotion,
  type PromotionRival,
} from "../../domain/promotion-overlap.js";
import type { Promotion } from "../../domain/promotion.js";

/**
 * **Ce qui peut refuser une écriture et que l'agrégat ne voit pas** (`documentation/promotions/promotions.md`, § 2.3 et § 2.16) : les rivales — pas de chevauchement, une seule
 * promotion de panier par commande. Jugées seulement là où la promotion
 * prend (ou reprend) sa place : pose, révision, reprise.
 *
 * Il a aussi jugé une **surface** (d'où la promotion était réglée) jusqu'au
 * 2026-10-31 : une promotion se règle désormais depuis un seul endroit
 * (`documentation/promotions/promotions.md`, § 2.15).
 *
 * Le catalogue n'est lu que s'il existe une rivale.
 */
@Injectable()
export class PromotionWriteGuard {
  constructor(
    private readonly rivals: PromotionRivalsReader,
    private readonly catalogue: PromotionCatalogueReader,
  ) {}

  /**
   * La promotion prend (ou reprend) sa place, dans sa forme `after`.
   *
   * @throws {OverlappingPromotionError} une autre se dispute un article avec elle.
   * @throws {BasketPromotionsWouldCombineError} une autre de panier pourrait s'appliquer avec elle.
   * @throws {TooManyCumulativeBasketPromotionsError} cinq cumulables de panier s'appliqueraient déjà avec elle.
   */
  async admitsPlace(after: Promotion): Promise<void> {
    const candidate: PromotionRival = { id: after.id, terms: after.terms };
    const rivals = (await this.rivals.unarchived(applicationPointOf(after.terms.fulfillment))).map(
      (rival): PromotionRival => ({ id: rival.id, terms: rival.terms }),
    );
    if (rivals.some((rival) => rival.id !== candidate.id)) {
      // Le chevauchement d'abord : il nomme l'article, l'autre refus non.
      assertNoOverlap(candidate, rivals, (await this.catalogue.snapshot()).articles);
      assertSingleBasketPromotion(candidate, rivals);
      assertCumulativeBasketCapacity(candidate, rivals);
    }
  }
}
