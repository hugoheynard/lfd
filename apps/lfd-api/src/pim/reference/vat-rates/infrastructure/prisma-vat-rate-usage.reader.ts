import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { VatRateUsageReader } from "../domain/ports/vat-rate-usage.reader.js";

/**
 * Les familles et les fiches qui portent un taux, comptées en base — deux
 * `count` sur les tables de jointure, dans la transaction de l'appelant quand
 * il y en a une.
 */
@Injectable()
export class PrismaVatRateUsageReader extends VatRateUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async holdersOf(rateId: string): Promise<number> {
    const [families, products] = await Promise.all([
      this.prisma.categoryContextVat.count({ where: { vatRateId: rateId } }),
      this.prisma.productContextVat.count({ where: { vatRateId: rateId } }),
    ]);
    return families + products;
  }
}
