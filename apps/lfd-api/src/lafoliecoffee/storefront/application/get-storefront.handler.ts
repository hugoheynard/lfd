import type { StorefrontView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StorefrontReader } from "../domain/storefront.reader.js";
import { GetStorefrontQuery } from "./get-storefront.query.js";

@QueryHandler(GetStorefrontQuery)
export class GetStorefrontHandler implements IQueryHandler<GetStorefrontQuery, StorefrontView> {
  constructor(private readonly reader: StorefrontReader) {}

  execute(): Promise<StorefrontView> {
    return this.reader.read();
  }
}
