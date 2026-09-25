import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { OperationSkuCatalogue } from "../domain/ports/operation-sku.catalogue.js";

/**
 * Les SKU que le référentiel connaît : ceux de ses **déclinaisons** — c'est
 * sous ce SKU qu'un article voyage vers le commerce et se commande.
 *
 * Une déclinaison d'une fiche archivée compte : un SKU n'est jamais réattribué
 * (`lint:sku-never-recycled`), donc il désigne toujours le même article, et
 * c'est l'envoi vers le commerce qui dira s'il est vendu.
 */
@Injectable()
export class PrismaOperationSkuCatalogue extends OperationSkuCatalogue {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async unknownAmong(skus: readonly string[]): Promise<readonly string[]> {
    if (skus.length === 0) {
      return [];
    }
    const found = await this.prisma.productVariant.findMany({
      where: { sku: { in: [...skus] } },
      select: { sku: true },
    });
    const known = new Set(found.map((row) => row.sku));
    return skus.filter((sku) => !known.has(sku));
  }
}
