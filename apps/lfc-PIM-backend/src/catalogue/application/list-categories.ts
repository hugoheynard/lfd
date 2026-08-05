import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  CategoryRepository,
  type CategoryRecord,
} from '../domain/ports/category.repository.js';

/** Lecture des familles — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListCategoriesQuery {}

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<
  ListCategoriesQuery,
  CategoryRecord[]
> {
  constructor(private readonly categories: CategoryRepository) {}

  execute(): Promise<CategoryRecord[]> {
    return this.categories.listAll();
  }
}
