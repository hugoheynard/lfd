import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleSkuAliasTableReader } from "../domain/ports/sale-sku-alias-table.reader.js";
import type { SaleSkuAliasPair } from "../domain/sale-sku-aliases.js";

/** `sale_sku_alias` en une lecture, rangée par alias pour une réponse stable. */
@Injectable()
export class PrismaSaleSkuAliasTableReader extends SaleSkuAliasTableReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  all(): Promise<readonly SaleSkuAliasPair[]> {
    return this.prisma.saleSkuAlias.findMany({
      select: { aliasSku: true, targetSku: true },
      orderBy: { aliasSku: "asc" },
    });
  }
}
