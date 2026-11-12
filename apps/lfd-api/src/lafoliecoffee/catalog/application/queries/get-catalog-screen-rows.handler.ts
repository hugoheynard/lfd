import type { CatalogScreenRowsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CatalogAdminChangeVersionReader } from "../../domain/ports/catalog-admin-change-version.reader.js";
import { CatalogScreenReader } from "../../domain/ports/catalog-screen.reader.js";
import { GetCatalogScreenRowsQuery } from "./get-catalog-screen-rows.query.js";
import { publishedCatalogViewOf } from "./published-catalog-view.js";

/**
 * **Les lignes touchées par un geste** (`plan-catalogue-du-back-office.md`,
 * § 3.2) : les fiches des articles nommés, recomposées par la même
 * arithmétique que l'écran entier. Comptes par rayon et liste à valider ne
 * sont PAS rendus — l'écran les recalcule sur sa copie
 * (`@lfd/contracts/published-catalog-counts`).
 *
 * Le numéro `catalog-admin` est lu AVANT les lignes, pour la raison de
 * `GetCatalogScreenHandler`.
 */
@QueryHandler(GetCatalogScreenRowsQuery)
export class GetCatalogScreenRowsHandler implements IQueryHandler<
  GetCatalogScreenRowsQuery,
  CatalogScreenRowsView
> {
  constructor(
    private readonly versions: CatalogAdminChangeVersionReader,
    private readonly screen: CatalogScreenReader,
  ) {}

  async execute(query: GetCatalogScreenRowsQuery): Promise<CatalogScreenRowsView> {
    const version = await this.versions.versionOf();
    const source = await this.screen.readProductsOf(query.skus);
    return {
      version,
      entries: publishedCatalogViewOf(source.published).entries,
      items: source.items,
    };
  }
}
