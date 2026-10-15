import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OperationSkuCatalogue } from "../domain/ports/operation-sku.catalogue.js";

/**
 * Les SKU que le commerce connaît : ceux de ses **articles** (`catalog_items`)
 * et ceux des déclinaisons que les faits du catalogue ont apportées
 * (`catalog_entries.variants`) — O2 du plan.
 *
 * Un article RETIRÉ compte : un SKU n'est jamais réattribué
 * (`lint:sku-never-recycled`), il désigne toujours le même article, et un
 * article retiré reste dans la sélection sans être vendu (O2) — le refuser
 * empêcherait de réenregistrer une sélection qui le porte déjà.
 */
@Injectable()
export class PrismaOperationSkuCatalogue extends OperationSkuCatalogue {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unknownAmong(skus: readonly string[]): Promise<readonly string[]> {
    if (skus.length === 0) {
      return [];
    }
    const wanted = [...skus];
    // withdrawn-filter: exempt — on demande si le SKU EXISTE, pas s'il se vend :
    // un article retiré reste dans une sélection (O2 du plan de l'opération au commerce).
    const items = await this.prisma.catalogItem.findMany({
      where: { sku: { in: wanted } },
      select: { sku: true },
    });
    const variants = await this.prisma.$queryRaw<{ sku: string }[]>`
      SELECT DISTINCT variant ->> 'sku' AS sku
        FROM "public"."catalog_entries", jsonb_array_elements("variants") AS variant
       WHERE variant ->> 'sku' = ANY(${wanted})`;
    const known = new Set([...items, ...variants].map((row) => row.sku));
    return skus.filter((sku) => !known.has(sku));
  }
}
