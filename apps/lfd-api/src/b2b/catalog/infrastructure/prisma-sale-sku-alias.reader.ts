import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleSkuAliasReader } from "../domain/ports/sale-sku-alias.reader.js";
import { SaleSkuAliases } from "../domain/sale-sku-aliases.js";

const PAIR = { aliasSku: true, targetSku: true } as const;

/**
 * Les alias de `sale_sku_alias` autour de ces références, en deux lectures
 * au plus : les lignes qui les nomment, puis les autres alias de leurs
 * cibles. La seconde ne part que si la première a trouvé une cible — la
 * table est vide jusqu'au L3, et une référence sans alias ne coûte qu'une
 * lecture sur la clé primaire et l'index de la cible.
 */
@Injectable()
export class PrismaSaleSkuAliasReader extends SaleSkuAliasReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async around(skus: readonly string[]): Promise<SaleSkuAliases> {
    if (skus.length === 0) {
      return SaleSkuAliases.none();
    }
    const wanted = [...new Set(skus)];
    const named = await this.prisma.saleSkuAlias.findMany({
      where: { OR: [{ aliasSku: { in: wanted } }, { targetSku: { in: wanted } }] },
      select: PAIR,
    });
    const targets = [...new Set(named.map((pair) => pair.targetSku))];
    if (targets.length === 0) {
      return SaleSkuAliases.none();
    }
    const siblings = await this.prisma.saleSkuAlias.findMany({
      where: { targetSku: { in: targets } },
      select: PAIR,
    });
    return SaleSkuAliases.of(siblings);
  }
}
