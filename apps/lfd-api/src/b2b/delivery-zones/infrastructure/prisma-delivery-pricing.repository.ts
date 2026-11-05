import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { DeliveryPricing } from "../domain/delivery-pricing.js";
import { DeliveryPricingRepository } from "../domain/ports/delivery-pricing.repository.js";
import { termsToColumns } from "./delivery-pricing.columns.js";
import { DELIVERY_PRICING_KEY } from "./delivery-pricing.key.js";

/** Adaptateur Prisma de l'écriture du réglage global : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaDeliveryPricingRepository extends DeliveryPricingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(pricing: DeliveryPricing): Promise<void> {
    const row = {
      ...termsToColumns(pricing.terms),
      updatedAt: pricing.at,
      updatedByStaffId: pricing.author.staffUserId,
      updatedByName: pricing.author.name,
      updatedByRole: pricing.author.role,
    };
    await this.prisma.deliveryPricing.upsert({
      where: { key: DELIVERY_PRICING_KEY },
      create: { key: DELIVERY_PRICING_KEY, ...row },
      update: row,
    });
  }
}
