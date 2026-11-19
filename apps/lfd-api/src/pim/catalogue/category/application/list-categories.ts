import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PimContents } from "../../../changes/application/pim-contents.js";
import { listContent, PIM_CONTENT_KEYS } from "../../../changes/application/pim-content-keys.js";
import type { CategorySnapshot } from "../domain/entities/category.js";
import { AllCategoriesReader } from "../domain/ports/all-categories.reader.js";
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
    private readonly categories: AllCategoriesReader,
    private readonly products: ProductCountReader,
    private readonly contents: PimContents,
  ) {}

  /** Servie sous le numéro `pim` : familles et fiches comptées en sont. */
  execute(): Promise<CategoryListItem[]> {
    return this.contents.contentOf(
      PIM_CONTENT_KEYS.categories,
      () => this.fromBase(),
      listContent<CategoryListItem>(),
    );
  }

  /**
   * Le compte de fiches accompagne chaque famille.
   *
   * Il ne vit PAS dans l'agrégat : une famille ne voit pas les fiches qui la
   * référencent, et lui faire porter ce nombre l'obligerait à le tenir à jour à
   * chaque publication. C'est une donnée de LECTURE, jointe ici.
   *
   * Une seule requête pour toutes, jamais une par ligne.
   */
  private async fromBase(): Promise<CategoryListItem[]> {
    const [categories, counts] = await Promise.all([
      this.categories.all(),
      this.products.countByCategory(),
    ]);
    return categories.map((snapshot) => ({
      ...snapshot,
      activeProductCount: counts.get(snapshot.id) ?? 0,
    }));
  }
}
