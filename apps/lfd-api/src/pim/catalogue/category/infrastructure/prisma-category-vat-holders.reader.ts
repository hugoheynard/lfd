import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryVatHoldersReader } from "../domain/ports/category-vat-holders.reader.js";

/** Un `count` sur les taux des familles, dans la transaction de l'appelant quand il y en a une. */
@Injectable()
export class PrismaCategoryVatHoldersReader extends CategoryVatHoldersReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  countHolding(rateId: string): Promise<number> {
    return this.prisma.categoryContextVat.count({ where: { vatRateId: rateId } });
  }
}
