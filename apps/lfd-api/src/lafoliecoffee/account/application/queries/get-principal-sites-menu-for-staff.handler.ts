import type { PrincipalSitesMenuView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PrincipalSitesMenuReader } from "../../domain/ports/principal-sites-menu.reader.js";
import { GetPrincipalSitesMenuForStaffQuery } from "./get-principal-sites-menu-for-staff.query.js";
import { principalSitesMenuViewOf } from "./sub-account-menu.view.js";

/** La carte commune d'un principal pour la fiche client ; `menu: null` sans carte. */
@QueryHandler(GetPrincipalSitesMenuForStaffQuery)
export class GetPrincipalSitesMenuForStaffHandler implements IQueryHandler<
  GetPrincipalSitesMenuForStaffQuery,
  PrincipalSitesMenuView
> {
  constructor(private readonly menus: PrincipalSitesMenuReader) {}

  async execute(query: GetPrincipalSitesMenuForStaffQuery): Promise<PrincipalSitesMenuView> {
    return principalSitesMenuViewOf(query.companyId, await this.menus.read(query.companyId));
  }
}
