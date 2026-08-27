import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CategoryNotFoundError } from "../domain/errors/category-errors.js";
import {
  CategoryEditorialReader,
  type CategoryEditorialView,
  type CategoryMediaRecord,
} from "../domain/ports/category-editorial-reader.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { ProductCountReader } from "../domain/ports/product-count.reader.js";
import type { CategoryListItem } from "./list-categories.js";

/** Une famille ENRICHIE : son socle, ses textes, ses visuels. */
export type CategoryDetail = CategoryListItem & {
  readonly editorial: CategoryEditorialView | null;
  readonly media: readonly CategoryMediaRecord[];
};

export class GetCategoryDetailQuery {
  constructor(readonly id: string) {}
}

/**
 * La famille pour SA page — et pour elle seule.
 *
 * Distincte de la liste, et c'est le point : mettre textes et visuels dans
 * `ListCategoriesQuery` coûterait, à chaque affichage de la liste, une jointure
 * par famille sur la bibliothèque de médias, pour des colonnes qu'aucune ligne
 * n'affiche. Une page en regarde UNE ; elle peut se permettre les trois lectures.
 */
@QueryHandler(GetCategoryDetailQuery)
export class GetCategoryDetailHandler implements IQueryHandler<
  GetCategoryDetailQuery,
  CategoryDetail
> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly products: ProductCountReader,
    private readonly editorials: CategoryEditorialReader,
  ) {}

  async execute(query: GetCategoryDetailQuery): Promise<CategoryDetail> {
    const category = await this.categories.findById(query.id);
    if (category === null) {
      throw new CategoryNotFoundError(query.id);
    }
    // Les trois lectures EN PARALLÈLE : elles ne dépendent pas les unes des
    // autres, et les enchaîner ferait payer trois allers-retours pour rien.
    const [counts, editorial, media] = await Promise.all([
      this.products.countByCategory(),
      this.editorials.findByCategory(query.id),
      this.editorials.mediaOf(query.id),
    ]);
    const snapshot = category.snapshot();
    return {
      ...snapshot,
      activeProductCount: counts.get(snapshot.id) ?? 0,
      editorial,
      media,
    };
  }
}
