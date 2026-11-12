import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  CatalogOverviewReader,
  type OverviewProductRow,
} from "../domain/ports/catalog-overview.reader.js";

/**
 * Le compte du catalogue en DEUX requêtes, quelle que soit sa taille : les
 * fiches avec le NOMBRE de leurs déclinaisons et leur signature, puis les
 * identifiants des familles. Rien de la fiche n'est chargé au-delà.
 */
@Injectable()
export class PrismaCatalogOverviewReader extends CatalogOverviewReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async productRows(): Promise<readonly OverviewProductRow[]> {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        select: {
          id: true,
          status: true,
          categoryId: true,
          readiness: { select: { productId: true } },
          _count: { select: { variants: true } },
        },
      }),
      this.prisma.category.findMany({ select: { id: true } }),
    ]);
    const known = new Set(categories.map((category) => category.id));
    return products.map((product) => ({
      productId: product.id,
      status: product.status,
      categoryId: product.categoryId,
      articles: product._count.variants,
      signed: product.readiness !== null,
      categoryKnown: known.has(product.categoryId),
    }));
  }
}
