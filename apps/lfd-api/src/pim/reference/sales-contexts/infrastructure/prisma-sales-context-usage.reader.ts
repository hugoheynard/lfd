import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SalesContextUsageReader } from "../domain/ports/sales-context-usage.reader.js";

/**
 * Les taux réglés sur un contexte, comptés en base — les deux tables qui le
 * citent par clé étrangère, dans la transaction de l'appelant quand il y en a
 * une.
 */
@Injectable()
export class PrismaSalesContextUsageReader extends SalesContextUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async ratedBy(contextId: string): Promise<number> {
    const [families, products] = await Promise.all([
      this.prisma.categoryContextVat.count({ where: { contextId } }),
      this.prisma.productContextVat.count({ where: { contextId } }),
    ]);
    return families + products;
  }
}
