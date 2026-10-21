import type { ResupplyArticleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ListResupplyArticlesQuery } from "./list-resupply-articles.query.js";

/** Les articles proposables à la réception, sans prix. Lecture pure. */
@QueryHandler(ListResupplyArticlesQuery)
export class ListResupplyArticlesHandler implements IQueryHandler<
  ListResupplyArticlesQuery,
  readonly ResupplyArticleView[]
> {
  constructor(private readonly catalogue: ResupplyCatalogue) {}

  execute(): Promise<readonly ResupplyArticleView[]> {
    return this.catalogue.articles();
  }
}
