import { Injectable } from "@nestjs/common";

import { CitedAllergensReader } from "../../catalogue/product/domain/ports/cited-allergens.reader.js";
import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { citedUnion } from "../application/ingredient-allergen-support.js";

/**
 * La provenance sert au catalogue ce que ses fiches citent — en UNE requête,
 * seulement les codes. Même union que la lecture d'une fiche (`citedUnion`).
 */
@Injectable()
export class PrismaCitedAllergensReader extends CitedAllergensReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async ofProducts(productIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
    const rows = await this.prisma.productIngredient.findMany({
      where: { productId: { in: [...productIds] } },
      select: {
        productId: true,
        ingredient: { select: { allergens: { select: { entry: { select: { code: true } } } } } },
      },
    });
    const byProduct = new Map<string, string[][]>();
    for (const row of rows) {
      const lists = byProduct.get(row.productId) ?? [];
      lists.push(row.ingredient.allergens.map((allergen) => allergen.entry.code));
      byProduct.set(row.productId, lists);
    }
    return new Map([...byProduct].map(([productId, lists]) => [productId, citedUnion(lists)]));
  }
}
