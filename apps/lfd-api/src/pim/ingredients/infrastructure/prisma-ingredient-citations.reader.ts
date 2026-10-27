import { Injectable } from "@nestjs/common";

import {
  IngredientCitationsReader,
  type IngredientCitations,
} from "../../catalogue/product/domain/ports/ingredient-citations.reader.js";
import { readLocalizedColumn } from "../../catalogue/shared/infrastructure/json-readers.js";
import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { citedUnion } from "../application/ingredient-allergen-support.js";

const CODES = { allergens: { select: { entry: { select: { code: true } } } } } as const;

/**
 * La provenance sert au catalogue les fiches qui citent un ingrédient, et ce
 * que leurs AUTRES ingrédients portent — en trois requêtes quel que soit le
 * nombre de fiches. Même union que la lecture d'une fiche (`citedUnion`).
 */
@Injectable()
export class PrismaIngredientCitationsReader extends IngredientCitationsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async citationsOf(ingredientKey: string): Promise<IngredientCitations | null> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { key: ingredientKey },
      select: { id: true, key: true, name: true, ...CODES },
    });
    if (ingredient === null) {
      return null;
    }
    const citing = await this.prisma.productIngredient.findMany({
      where: { ingredientId: ingredient.id },
      select: { productId: true },
      orderBy: { productId: "asc" },
    });
    const productIds = citing.map((row) => row.productId);
    const others = await this.prisma.productIngredient.findMany({
      where: { productId: { in: productIds }, ingredientId: { not: ingredient.id } },
      select: { productId: true, ingredient: { select: CODES } },
    });
    const byProduct = new Map<string, string[][]>();
    for (const row of others) {
      const lists = byProduct.get(row.productId) ?? [];
      lists.push(row.ingredient.allergens.map((allergen) => allergen.entry.code));
      byProduct.set(row.productId, lists);
    }
    return {
      ingredient: {
        key: ingredient.key,
        name: readLocalizedColumn(ingredient.name, "ingredient.name").fr,
        allergens: citedUnion([ingredient.allergens.map((allergen) => allergen.entry.code)]),
      },
      products: productIds.map((productId) => ({
        productId,
        otherCited: citedUnion(byProduct.get(productId) ?? []),
      })),
    };
  }
}
