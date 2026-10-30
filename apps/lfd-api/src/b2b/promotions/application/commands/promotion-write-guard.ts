import { Injectable } from "@nestjs/common";

import { PromotionCatalogueReader } from "../../domain/ports/promotion-catalogue.reader.js";
import { PromotionRivalsReader } from "../../domain/ports/promotion-rivals.reader.js";
import { applicationPointOf } from "../../domain/promotion-fulfillment.js";
import {
  assertNoOverlap,
  assertSingleBasketPromotion,
  type PromotionRival,
} from "../../domain/promotion-overlap.js";
import { assertSurfaceAdmits, type PromotionSurface } from "../../domain/promotion-surface.js";
import type { Promotion } from "../../domain/promotion.js";

/**
 * **Ce qui peut refuser une écriture et que l'agrégat ne voit pas** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.2, § 13.9, § 13.10 L7) — partagé par les cinq gestes :
 *
 * 1. la surface : une promotion de retrait à un point se règle depuis ce
 *    point, sous son droit, les autres depuis la tarification ;
 * 2. les rivales : pas de chevauchement, une seule promotion de panier par
 *    commande — jugés seulement là où la promotion reprend (ou garde) sa
 *    place : pose, révision, reprise.
 *
 * L'ordre compte : les refus qui ne lisent rien d'abord ; le catalogue
 * n'est lu que s'il existe une rivale.
 */
@Injectable()
export class PromotionWriteGuard {
  constructor(
    private readonly rivals: PromotionRivalsReader,
    private readonly catalogue: PromotionCatalogueReader,
  ) {}

  /**
   * Le geste ne change pas la place de la promotion (pause, archivage).
   *
   * @throws {PromotionWrongSurfaceError} la promotion appartient à l'autre surface.
   */
  admitsTouch(surface: PromotionSurface, promotion: Promotion): void {
    // Synchrone depuis L12 : la source, seule lecture, ne vaut plus que
    // `promotions`, et n'est plus lue ici.
    assertSurfaceAdmits(surface, promotion.terms.fulfillment, promotion.id);
  }

  /**
   * La promotion prend (ou reprend) sa place : `before` est son état d'avant
   * pour une révision ou une reprise, `null` pour une pose.
   *
   * @throws {PromotionWrongSurfaceError} l'ancienne ou la nouvelle forme appartient à l'autre surface.
   * @throws {OverlappingPromotionError} une autre se dispute un article avec elle.
   * @throws {BasketPromotionsWouldCombineError} une autre de panier pourrait s'appliquer avec elle.
   */
  async admitsPlace(
    surface: PromotionSurface,
    before: Promotion | null,
    after: Promotion,
  ): Promise<void> {
    if (before !== null) {
      assertSurfaceAdmits(surface, before.terms.fulfillment, before.id);
    }
    assertSurfaceAdmits(surface, after.terms.fulfillment, after.id);
    const candidate: PromotionRival = { id: after.id, terms: after.terms };
    const rivals = (await this.rivals.unarchived(applicationPointOf(after.terms.fulfillment))).map(
      (rival): PromotionRival => ({ id: rival.id, terms: rival.terms }),
    );
    if (rivals.some((rival) => rival.id !== candidate.id)) {
      // Le chevauchement d'abord : il nomme l'article, l'autre refus non.
      assertNoOverlap(candidate, rivals, (await this.catalogue.snapshot()).articles);
      assertSingleBasketPromotion(candidate, rivals);
    }
  }
}
