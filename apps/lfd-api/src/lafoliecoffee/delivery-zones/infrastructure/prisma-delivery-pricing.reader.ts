import { DEFAULT_DELIVERY_PRICING, type DeliveryPricingView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryPricingReader } from "../domain/ports/delivery-pricing.reader.js";
import { DELIVERY_PRICING_COLUMNS, termsFromColumns } from "./delivery-pricing.columns.js";
import { DELIVERY_PRICING_KEY } from "./delivery-pricing.key.js";

/** Adaptateur Prisma de la lecture du réglage global. **Ligne absente = rien de réglé.** */
@Injectable()
export class PrismaDeliveryPricingReader extends DeliveryPricingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<DeliveryPricingView> {
    const row = await this.prisma.deliveryPricing.findUnique({
      where: { key: DELIVERY_PRICING_KEY },
      select: { ...DELIVERY_PRICING_COLUMNS, updatedAt: true, updatedByName: true },
    });
    if (row === null) {
      return DEFAULT_DELIVERY_PRICING;
    }
    return {
      ...termsFromColumns(row),
      updatedAt: row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}
