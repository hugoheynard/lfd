import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { VatRateNamesReader, type VatRateName } from "../domain/ports/vat-rate-names.reader.js";

/** L'adaptateur : deux colonnes, rangées par pourcentage, en une requête. */
@Injectable()
export class PrismaVatRateNamesReader extends VatRateNamesReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async namesOf(ids: readonly string[]): Promise<readonly VatRateName[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.vatRate.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
      orderBy: { percent: "asc" },
    });
  }
}
