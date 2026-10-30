import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleReferenceLineageReader } from "../domain/ports/sale-reference-lineage.reader.js";
import {
  ancestorsOfEach,
  MAX_SUCCESSION_DEPTH,
  type DetachedArticle,
} from "../domain/sale-reference-succession.js";

/**
 * La lignée remontée sur les articles du miroir, une génération à la fois :
 * la référence d'où chaque article est né, puis tous les articles nés de
 * celle-ci — il en faut les frères pour savoir lequel est le successeur
 * retenu. Deux requêtes par génération, jamais une par article.
 */
@Injectable()
export class PrismaSaleReferenceLineageReader extends SaleReferenceLineageReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ancestorsOf(skus: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
    const articles: DetachedArticle[] = [];
    const visited = new Set(skus);
    let frontier = [...visited];
    for (let depth = 0; depth < MAX_SUCCESSION_DEPTH && frontier.length > 0; depth += 1) {
      const parents = await this.parentsOf(frontier);
      articles.push(...(await this.bornFrom(parents)));
      frontier = parents.filter((sku) => !visited.has(sku));
      frontier.forEach((sku) => visited.add(sku));
    }
    return ancestorsOfEach(skus, articles);
  }

  private async parentsOf(skus: readonly string[]): Promise<readonly string[]> {
    // withdrawn-filter: exempt — une filiation, pas une mise en vente : l'article
    // d'un historique peut être retiré.
    const rows = await this.prisma.catalogItem.findMany({
      where: { sku: { in: [...skus] }, detachedFromSku: { not: null } },
      select: { detachedFromSku: true },
    });
    return [...new Set(rows.flatMap((row) => row.detachedFromSku ?? []))];
  }

  private async bornFrom(parents: readonly string[]): Promise<readonly DetachedArticle[]> {
    if (parents.length === 0) {
      return [];
    }
    // withdrawn-filter: exempt — une filiation, pas une mise en vente.
    const rows = await this.prisma.catalogItem.findMany({
      where: { detachedFromSku: { in: [...parents] } },
      select: { sku: true, detachedFromSku: true, isDefault: true },
    });
    return rows.flatMap((row) =>
      row.detachedFromSku === null
        ? []
        : [{ sku: row.sku, detachedFromSku: row.detachedFromSku, isDefault: row.isDefault }],
    );
  }
}
