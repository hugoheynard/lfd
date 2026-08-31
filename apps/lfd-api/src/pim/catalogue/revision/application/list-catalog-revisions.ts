import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogRevisionSummaryView } from "@lfd/pim-contracts";

import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";
import { summaryOf } from "./diff-catalog-revisions.js";

/** Au-delà, un écran pagine — il ne déroule pas trois ans d'ancres. */
const MAX = 50;

export class ListCatalogRevisionsQuery {}

/** Les ancres, de la plus récente à la plus ancienne. */
@QueryHandler(ListCatalogRevisionsQuery)
export class ListCatalogRevisionsHandler implements IQueryHandler<
  ListCatalogRevisionsQuery,
  readonly CatalogRevisionSummaryView[]
> {
  constructor(private readonly revisions: CatalogRevisionRepository) {}

  async execute(): Promise<readonly CatalogRevisionSummaryView[]> {
    return (await this.revisions.list(MAX)).map((record) => summaryOf(record));
  }
}
