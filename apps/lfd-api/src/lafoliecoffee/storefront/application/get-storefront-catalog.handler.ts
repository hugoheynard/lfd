import type { StorefrontCatalogView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StorefrontCatalogReader } from "../domain/storefront-catalog.reader.js";
import { GetStorefrontCatalogQuery } from "./get-storefront-catalog.query.js";

@QueryHandler(GetStorefrontCatalogQuery)
export class GetStorefrontCatalogHandler implements IQueryHandler<
  GetStorefrontCatalogQuery,
  StorefrontCatalogView
> {
  constructor(private readonly catalog: StorefrontCatalogReader) {}

  execute(): Promise<StorefrontCatalogView> {
    return this.catalog.read();
  }
}
