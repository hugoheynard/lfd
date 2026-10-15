import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { ProductSnapshot } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { audienceView, type AudienceView } from "./audience-view.js";

/** Une fiche telle que la liste la rend : son état, plus son audience résolue. */
export type ProductListItem = ProductSnapshot & AudienceView;

/** Lecture du catalogue — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListProductsQuery {}

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery, ProductListItem[]> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
  ) {}

  /**
   * Les familles sont lues une fois pour toutes, jamais une par fiche. Une
   * fiche rattachée à une famille inconnue est un REFUS, comme dans le lecteur
   * du catalogue : un rattachement cassé ne se maquille pas en héritage.
   */
  async execute(): Promise<ProductListItem[]> {
    const [products, categories] = await Promise.all([
      this.products.listAll(),
      this.categories.listAll(),
    ]);
    const audiences = new Map<string, Audience>(
      categories.map((category) => [category.id, category.audience]),
    );
    return products.map((product) => {
      const categoryAudience = audiences.get(product.categoryId);
      if (categoryAudience === undefined) {
        throw new CategoryNotFoundError(product.categoryId);
      }
      return { ...product.snapshot(), ...audienceView(product, categoryAudience) };
    });
  }
}
