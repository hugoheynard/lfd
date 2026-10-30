import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { ArticleReservationView } from "@lfd/contracts";

import { CatalogItemNotFoundError } from "../../domain/errors/catalog-not-found.error.js";
import { MadeToOrderAdminReader } from "../../domain/ports/made-to-order-admin.reader.js";
import { GetArticleReservationQuery } from "./get-article-reservation.query.js";

/**
 * Le réglage d'un article, sociétés nommées (plan `plan-articles-sur-mesure.md`, § 7).
 *
 * @throws {CatalogItemNotFoundError} le SKU n'est plus au catalogue.
 */
@QueryHandler(GetArticleReservationQuery)
export class GetArticleReservationHandler implements IQueryHandler<
  GetArticleReservationQuery,
  ArticleReservationView
> {
  constructor(private readonly reader: MadeToOrderAdminReader) {}

  async execute(query: GetArticleReservationQuery): Promise<ArticleReservationView> {
    const view = await this.reader.ofArticle(query.sku);
    if (view === null) {
      throw new CatalogItemNotFoundError(query.sku);
    }
    return view;
  }
}
