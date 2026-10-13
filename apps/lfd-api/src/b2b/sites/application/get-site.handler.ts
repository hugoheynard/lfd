import type { SiteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteReader } from "../domain/site.reader.js";
import { GetSiteQuery } from "./get-site.query.js";

/** Sert un site, et dit s'il est le départ des tournées. Lecture pure. */
@QueryHandler(GetSiteQuery)
export class GetSiteHandler implements IQueryHandler<GetSiteQuery, SiteView> {
  constructor(
    private readonly sites: SiteReader,
    private readonly departure: DepartureSiteReader,
  ) {}

  /** @throws {PickupAddressNotFoundError} l'`id` n'existe pas. */
  async execute(query: GetSiteQuery): Promise<SiteView> {
    const [site, departureId] = await Promise.all([
      this.sites.get(query.siteId),
      this.departure.currentSiteId(),
    ]);
    if (site === null) {
      throw new PickupAddressNotFoundError(query.siteId);
    }
    return { ...site, isDeparture: site.id === departureId };
  }
}
