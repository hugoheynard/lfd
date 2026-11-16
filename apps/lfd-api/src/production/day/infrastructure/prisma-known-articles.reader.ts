import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { type KnownArticle, KnownArticles } from "../domain/ports/known-articles.reader.js";
import type { ServiceRange } from "../domain/value-objects/service-range.value-object.js";

/**
 * Les articles des journées arrêtées, lus **dans le schéma de la production**.
 *
 * Seules les journées CLOSES comptent : les lignes ne sont écrites qu'à
 * l'arrêt, et une journée ouverte n'en porte pas encore. La borne se compare
 * en texte, comme `PrismaArrestedPlanLinesReader` : le tri d'un jour ISO est
 * le tri chronologique.
 *
 * Un même SKU sous deux noms (renommé entre deux journées) sort une fois, sous
 * le premier lu : le nom n'est qu'un repli d'affichage.
 */
@Injectable()
export class PrismaKnownArticles extends KnownArticles {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async between(range: ServiceRange): Promise<readonly KnownArticle[]> {
    const days = {
      serviceDay: { gte: range.from.value, lte: range.to.value },
      day: { closedAt: { not: null } },
    };
    const [orderLines, resupplyLines] = await Promise.all([
      this.prisma.productionOrderLine.findMany({
        where: { order: days },
        distinct: ["sku"],
        orderBy: [{ sku: "asc" }],
        select: { sku: true, productName: true },
      }),
      this.prisma.productionResupplyLine.findMany({
        where: { resupply: days },
        distinct: ["sku"],
        orderBy: [{ sku: "asc" }],
        select: { sku: true, productName: true },
      }),
    ]);
    const known = new Map<string, KnownArticle>();
    for (const line of [...orderLines, ...resupplyLines]) {
      if (!known.has(line.sku)) {
        known.set(line.sku, { sku: line.sku, productName: line.productName });
      }
    }
    return [...known.values()];
  }
}
