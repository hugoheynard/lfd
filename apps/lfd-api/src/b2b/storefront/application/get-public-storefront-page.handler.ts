import type { PublicStorefrontPageView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PublicStorefrontReader } from "../domain/public-storefront.reader.js";
import { GetPublicStorefrontPageQuery } from "./get-public-storefront-page.query.js";

@QueryHandler(GetPublicStorefrontPageQuery)
export class GetPublicStorefrontPageHandler implements IQueryHandler<
  GetPublicStorefrontPageQuery,
  PublicStorefrontPageView
> {
  constructor(private readonly reader: PublicStorefrontReader) {}

  execute(query: GetPublicStorefrontPageQuery): Promise<PublicStorefrontPageView> {
    return this.reader.pageOf(query.shelfKey);
  }
}
