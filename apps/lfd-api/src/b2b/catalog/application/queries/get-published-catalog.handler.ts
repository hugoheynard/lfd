import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PublishedCatalogView } from "@lfd/contracts";

import { PublishedCatalogReader } from "../../domain/ports/published-catalog.reader.js";
import { GetPublishedCatalogQuery } from "./get-published-catalog.query.js";
import { publishedCatalogViewOf } from "./published-catalog-view.js";

/**
 * **La vue « Catalogue publié »** (lot 3 de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`, H6, H9) :
 * une lecture, la composition dans `published-catalog-view.ts`.
 */
@QueryHandler(GetPublishedCatalogQuery)
export class GetPublishedCatalogHandler implements IQueryHandler<
  GetPublishedCatalogQuery,
  PublishedCatalogView
> {
  constructor(private readonly catalog: PublishedCatalogReader) {}

  async execute(): Promise<PublishedCatalogView> {
    return publishedCatalogViewOf(await this.catalog.read());
  }
}
