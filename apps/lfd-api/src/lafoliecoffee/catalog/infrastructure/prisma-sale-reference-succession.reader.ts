import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleReferenceSuccessionReader } from "../domain/ports/sale-reference-succession.reader.js";
import {
  directSuccessorsOf,
  latestOfEach,
  MAX_SUCCESSION_DEPTH,
  type DetachedArticle,
} from "../domain/sale-reference-succession.js";

/**
 * La lignée lue sur les articles du miroir, une génération par requête
 * (`detached_from_sku IN frontière`) : une requête par détachement successif,
 * jamais une par article.
 */
@Injectable()
export class PrismaSaleReferenceSuccessionReader extends SaleReferenceSuccessionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async latestOf(skus: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const articles: DetachedArticle[] = [];
    const visited = new Set(skus);
    let frontier = [...visited];
    for (let depth = 0; depth < MAX_SUCCESSION_DEPTH && frontier.length > 0; depth += 1) {
      const born = await this.bornFrom(frontier);
      articles.push(...born);
      frontier = born.map((article) => article.sku).filter((sku) => !visited.has(sku));
      frontier.forEach((sku) => visited.add(sku));
    }
    return latestOfEach(skus, directSuccessorsOf(articles));
  }

  private async bornFrom(parents: readonly string[]): Promise<readonly DetachedArticle[]> {
    // withdrawn-filter: exempt — une filiation, pas une mise en vente : la
    // référence la plus récente d'un historique peut être retirée.
    const rows = await this.prisma.catalogItem.findMany({
      where: { detachedFromSku: { in: [...parents] } },
      select: { sku: true, detachedFromSku: true, isDefault: true, detachedFromVariantSku: true },
    });
    return rows.flatMap((row) =>
      row.detachedFromSku === null
        ? []
        : [
            {
              sku: row.sku,
              detachedFromSku: row.detachedFromSku,
              isDefault: row.isDefault,
              detachedFromVariantSku: row.detachedFromVariantSku,
            },
          ],
    );
  }
}
