import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { CategorySnapshot } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";

/** Lecture des familles — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListCategoriesQuery {}

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<
  ListCategoriesQuery,
  CategorySnapshot[]
> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(): Promise<CategorySnapshot[]> {
    const categories = await this.categories.listAll();
    return categories.map((category) => category.snapshot());
  }
}
