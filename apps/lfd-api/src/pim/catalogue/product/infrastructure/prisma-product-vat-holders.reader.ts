import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductVatHoldersReader } from "../domain/ports/product-vat-holders.reader.js";

/** Un `count` sur les dérogations des fiches, dans la transaction de l'appelant quand il y en a une. */
@Injectable()
export class PrismaProductVatHoldersReader extends ProductVatHoldersReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  countHolding(rateId: string): Promise<number> {
    return this.prisma.productContextVat.count({ where: { vatRateId: rateId } });
  }
}
