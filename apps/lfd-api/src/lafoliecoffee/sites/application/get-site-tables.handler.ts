import type { SiteTablesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteReader } from "../domain/site.reader.js";
import { SiteTablesReader } from "../domain/site-tables.reader.js";
import { GetSiteTablesQuery } from "./get-site-tables.query.js";

/** Sert la grille de tables d'un site, avec l'adresse de chaque QR. Lecture pure. */
@QueryHandler(GetSiteTablesQuery)
export class GetSiteTablesHandler implements IQueryHandler<GetSiteTablesQuery, SiteTablesView> {
  constructor(
    private readonly sites: SiteReader,
    private readonly tables: SiteTablesReader,
  ) {}

  /** @throws {PickupAddressNotFoundError} l'`id` n'existe pas. */
  async execute(query: GetSiteTablesQuery): Promise<SiteTablesView> {
    const [site, tables] = await Promise.all([
      this.sites.get(query.siteId),
      this.tables.list(query.siteId),
    ]);
    if (site === null) {
      throw new PickupAddressNotFoundError(query.siteId);
    }
    return { tables };
  }
}
