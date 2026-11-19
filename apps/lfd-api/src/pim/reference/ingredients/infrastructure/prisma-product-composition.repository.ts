import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductComposition } from "../domain/entities/product-composition.entity.js";
import { IngredientNotFoundError } from "../domain/errors/ingredient-errors.js";
import { ProductCompositionRepository } from "../domain/ports/product-composition.repository.js";

/** L'adaptateur, sur `product_ingredient` : la clé de chaque ingrédient cité, par rang. */
@Injectable()
export class PrismaProductCompositionRepository extends ProductCompositionRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async load(productId: string): Promise<ProductComposition> {
    const rows = await this.prisma.productIngredient.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { ingredient: { select: { key: true } } },
    });
    return ProductComposition.rehydrate(
      productId,
      rows.map((row) => row.ingredient.key),
    );
  }

  /**
   * Table rase puis réécriture, et non un différentiel : l'ordre fait partie
   * de la donnée, et rejouer un différentiel sur des rangs revient à
   * recalculer toute la liste de toute façon. Les deux ordres partent dans la
   * transaction du handler, donc la fiche n'est jamais vue sans ses
   * ingrédients.
   *
   * @throws {IngredientNotFoundError} une clé que la base ne connaît plus
   *   entre la décision de l'agrégat et l'écriture.
   */
  async save(composition: ProductComposition): Promise<void> {
    const { productId, keys } = composition;
    const found = await this.prisma.ingredient.findMany({
      where: { key: { in: [...keys] } },
      select: { id: true, key: true },
    });
    const idOfKey = new Map(found.map((row) => [row.key, row.id]));
    const data = keys.map((key, position) => {
      const ingredientId = idOfKey.get(key);
      if (ingredientId === undefined) {
        throw new IngredientNotFoundError(key);
      }
      return { productId, ingredientId, position };
    });

    await this.prisma.productIngredient.deleteMany({ where: { productId } });
    if (data.length > 0) {
      await this.prisma.productIngredient.createMany({ data });
    }
  }
}
