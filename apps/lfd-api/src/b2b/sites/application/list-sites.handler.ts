import type { SiteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { SiteReader } from "../domain/site.reader.js";
import { ListSitesQuery } from "./list-sites.query.js";

/**
 * Sert la liste des sites : le défaut en tête, les archivés à la fin, et le
 * départ des tournées signalé. Lecture pure.
 */
@QueryHandler(ListSitesQuery)
export class ListSitesHandler implements IQueryHandler<ListSitesQuery, readonly SiteView[]> {
  constructor(
    private readonly sites: SiteReader,
    private readonly departure: DepartureSiteReader,
  ) {}

  async execute(): Promise<readonly SiteView[]> {
    const [sites, departureId] = await Promise.all([
      this.sites.list(),
      this.departure.currentSiteId(),
    ]);
    return sites.map((site) => ({ ...site, isDeparture: site.id === departureId }));
  }
}
