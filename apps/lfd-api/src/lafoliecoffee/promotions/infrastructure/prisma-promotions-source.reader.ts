import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PRICING_CACHE_KEYS,
  PricingMaterialsCache,
} from "../../pricing/infrastructure/pricing-materials.cache.js";
import { PromotionsSourceUnreadableError } from "../domain/errors/promotion-errors.js";
import { PromotionsSourceReader } from "../domain/ports/promotions-source.reader.js";
import { asPromotionsSource, type PromotionsSource } from "../domain/promotions-source.js";

/** La clé de la seule ligne que la table connaît (CHECK `promotion_settings_key_known`). */
const SOURCE_KEY = "promotions_source";

/**
 * **La source, lue dans `promotion_settings`** et gardée sous l'estampille
 * des matériaux de prix : elle se lit à chaque devis, et ne change qu'à la
 * bascule (migration, suivie d'un redémarrage) ou à la main sur dev.
 */
@Injectable()
export class PrismaPromotionsSourceReader extends PromotionsSourceReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  async current(): Promise<PromotionsSource> {
    const [source] = await this.cache.of(PRICING_CACHE_KEYS.promotionsSource, () => this.read());
    if (source === undefined) {
      throw new PromotionsSourceUnreadableError(null);
    }
    return source;
  }

  private async read(): Promise<PromotionsSource[]> {
    const row = await this.prisma.promotionSetting.findUnique({
      where: { key: SOURCE_KEY },
      select: { value: true },
    });
    if (row === null) {
      throw new PromotionsSourceUnreadableError(null);
    }
    const source = asPromotionsSource(row.value);
    if (source === null) {
      throw new PromotionsSourceUnreadableError(row.value);
    }
    return [source];
  }
}
