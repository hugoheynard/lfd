import type { SiteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SiteReader } from "../domain/site.reader.js";
import { ListSitesQuery } from "./list-sites.query.js";

/** Sert la liste des sites : le défaut en tête, les archivés à la fin. Lecture pure. */
@QueryHandler(ListSitesQuery)
export class ListSitesHandler implements IQueryHandler<ListSitesQuery, readonly SiteView[]> {
  constructor(private readonly sites: SiteReader) {}

  execute(): Promise<readonly SiteView[]> {
    return this.sites.list();
  }
}
