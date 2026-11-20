import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { unarchivedAt } from "../../pricing/infrastructure/archived-at.js";
import {
  PRICING_CACHE_KEYS,
  PricingMaterialsCache,
} from "../../pricing/infrastructure/pricing-materials.cache.js";
import { livePromotionOf, type LivePromotion } from "../domain/live-promotion.js";
import { BasketPromotionReader } from "../domain/ports/basket-promotion.reader.js";
import { DeliveryFeePromotionReader } from "../domain/ports/delivery-fee-promotion.reader.js";
import { LinePromotionReader } from "../domain/ports/line-promotion.reader.js";
import type { PromotionApplicationPoint } from "../domain/promotion-fulfillment.js";
import { FULFILLMENT_LINKS } from "./promotion-fulfillment-rows.js";
import { toDomain } from "./promotion-rows.js";

/**
 * **Les promotions d'un point d'application, telles que le calcul les lit**
 * (plan des promotions, § 13.5, lot L5).
 *
 * Le présent passe par le cache des matériaux de prix, sur le patron des
 * règles (`PrismaPriceRuleReader`) : la table entière, gardée sous
 * l'estampille de `pricing_events`, où chaque acte de promotion s'écrit.
 * La lecture datée le contourne, comme celle des règles : elle lit des
 * promotions archivées depuis, que le présent ne doit jamais voir.
 *
 * Chaque ligne repasse par `toDomain`, donc par l'agrégat : une ligne que la
 * reprise SQL aurait écrite hors des invariants fait échouer la lecture en
 * la nommant, plutôt que de servir un prix sur une promotion invalide.
 */
async function promotionsAt(
  prisma: PrismaService,
  point: PromotionApplicationPoint,
  at: Date | null,
): Promise<LivePromotion[]> {
  const rows = await prisma.promotion.findMany({
    where:
      at === null
        ? { applicationPoint: point, archivedAt: null }
        : { applicationPoint: point, ...unarchivedAt(at) },
    include: { scopeRules: true, audienceTargets: true, ...FULFILLMENT_LINKS },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => livePromotionOf(toDomain(row, row.scopeRules, row.audienceTargets)));
}

@Injectable()
export class PrismaLinePromotionReader extends LinePromotionReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  live(): Promise<readonly LivePromotion[]> {
    return this.cache.of(PRICING_CACHE_KEYS.linePromotions, () =>
      promotionsAt(this.prisma, "line", null),
    );
  }

  liveAt(at: Date): Promise<readonly LivePromotion[]> {
    return promotionsAt(this.prisma, "line", at);
  }
}

@Injectable()
export class PrismaBasketPromotionReader extends BasketPromotionReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  live(): Promise<readonly LivePromotion[]> {
    return this.cache.of(PRICING_CACHE_KEYS.basketPromotions, () =>
      promotionsAt(this.prisma, "basket", null),
    );
  }

  liveAt(at: Date): Promise<readonly LivePromotion[]> {
    return promotionsAt(this.prisma, "basket", at);
  }
}

/**
 * Le point « sur la livraison » (`plan-livraison-offerte.md`, § 2.4), par le
 * même cache que les deux autres : l'estampille de `pricing_events` couvre
 * aussi ses actes. Aucune lecture datée : la livraison offerte se juge au
 * présent, à la passation comme en révision (rejugée, décision (d)).
 */
@Injectable()
export class PrismaDeliveryFeePromotionReader extends DeliveryFeePromotionReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  live(): Promise<readonly LivePromotion[]> {
    return this.cache.of(PRICING_CACHE_KEYS.deliveryFeePromotions, () =>
      promotionsAt(this.prisma, "delivery_fee", null),
    );
  }
}
