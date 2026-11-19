import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { readLocalizedColumn } from "../../../shared/json-readers.js";
import {
  ProductCompositionReader,
  type ComposedIngredient,
} from "../domain/ports/product-composition.reader.js";

/** L'adaptateur : les citations d'une fiche, rangées, en une requête. */
@Injectable()
export class PrismaProductCompositionReader extends ProductCompositionReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async compositionOf(productId: string): Promise<readonly ComposedIngredient[]> {
    const rows = await this.prisma.productIngredient.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: {
        ingredient: {
          select: {
            key: true,
            name: true,
            appellation: { select: { code: true, label: true } },
          },
        },
      },
    });
    return rows.map(({ ingredient }) => ({
      key: ingredient.key,
      name: readLocalizedColumn(ingredient.name, "ingredient.name"),
      appellation:
        ingredient.appellation === null
          ? null
          : {
              code: ingredient.appellation.code,
              label: readLocalizedColumn(ingredient.appellation.label, "appellation.label"),
            },
    }));
  }
}
