import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { CategorySnapshot } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { ProductCountReader } from "../domain/ports/product-count.reader.js";

/** Une famille telle que la liste la rend : son état, plus ce que l'écran doit savoir. */
export type CategoryListItem = CategorySnapshot & { readonly activeProductCount: number };

/** Lecture des familles — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListCategoriesQuery {}

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<
  ListCategoriesQuery,
  CategoryListItem[]
> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly products: ProductCountReader,
  ) {}

  /**
   * Le compte de fiches accompagne chaque famille.
   *
   * Il ne vit PAS dans l'agrégat : une famille ne voit pas les fiches qui la
   * référencent, et lui faire porter ce nombre l'obligerait à le tenir à jour à
   * chaque publication. C'est une donnée de LECTURE, jointe ici.
   *
   * Une seule requête pour toutes, jamais une par ligne.
   */
  async execute(): Promise<CategoryListItem[]> {
    const [categories, counts] = await Promise.all([
      this.categories.listAll(),
      this.products.countByCategory(),
    ]);
    return categories.map((category) => {
      const snapshot = category.snapshot();
      return { ...snapshot, activeProductCount: counts.get(snapshot.id) ?? 0 };
    });
  }
}
