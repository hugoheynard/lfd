import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PriceFloorReader } from "../domain/ports/price-floor.reader.js";
import { floorFromRow } from "./price-rows.js";
import type { PricingContext, ScopedPriceFloor } from "../domain/price-rule.js";

@Injectable()
export class PrismaPriceFloorReader extends PriceFloorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Élague sur la portée — le seul axe qu'un plancher possède. */
  async candidatesFor(context: PricingContext): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({
      where: {
        // Une limite archivée ne protège plus rien : elle ne doit pas ressortir
        // comme candidate, sinon elle continuerait d'arbitrer des prix.
        archivedAt: null,
        OR: [
          { scopeType: "global" },
          { scopeType: "category", scopeId: context.categoryId },
          { scopeType: "product", scopeId: context.productSku },
          { scopeType: "variant", scopeId: context.variantSku },
        ],
      },
    });
    return rows.map(floorFromRow);
  }

  async listAll(): Promise<ScopedPriceFloor[]> {
    const rows = await this.prisma.priceFloor.findMany({ where: { archivedAt: null } });
    return rows.map(floorFromRow);
  }
}
