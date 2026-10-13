import type { SiteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteReader } from "../domain/site.reader.js";
import { GetSiteQuery } from "./get-site.query.js";

/** Sert un site. Lecture pure. */
@QueryHandler(GetSiteQuery)
export class GetSiteHandler implements IQueryHandler<GetSiteQuery, SiteView> {
  constructor(private readonly sites: SiteReader) {}

  /** @throws {PickupAddressNotFoundError} l'`id` n'existe pas. */
  async execute(query: GetSiteQuery): Promise<SiteView> {
    const site = await this.sites.get(query.siteId);
    if (site === null) {
      throw new PickupAddressNotFoundError(query.siteId);
    }
    return site;
  }
}
