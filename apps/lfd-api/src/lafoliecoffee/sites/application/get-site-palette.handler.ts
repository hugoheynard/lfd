import type { SitePaletteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { SiteReader } from "../domain/site.reader.js";
import { GetSitePaletteQuery } from "./get-site-palette.query.js";
import { sitePaletteOf } from "./site-palette.js";

/**
 * Sert la palette : chaque site, ses couleurs, et le départ des tournées tel
 * que la livraison le résout aujourd'hui. Lue à chaque appel — un changement
 * en Réglages › Sites se voit partout tout de suite. Lecture pure.
 */
@QueryHandler(GetSitePaletteQuery)
export class GetSitePaletteHandler implements IQueryHandler<GetSitePaletteQuery, SitePaletteView> {
  constructor(
    private readonly sites: SiteReader,
    private readonly departure: DepartureSiteReader,
  ) {}

  async execute(): Promise<SitePaletteView> {
    const [sites, departureId] = await Promise.all([
      this.sites.list(),
      this.departure.currentSiteId(),
    ]);
    return { sites: sitePaletteOf(sites, departureId) };
  }
}
