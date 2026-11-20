import type { PrincipalSitesMenuView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { canSetSitesMenuOf } from "../../../shared/company-standing/domain/sub-account-menu-writing.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { SitesMenuWriterRequiredError } from "../../domain/errors/sub-account-menu-errors.js";
import { PrincipalSitesMenuReader } from "../../domain/ports/principal-sites-menu.reader.js";
import { SubAccountMenuAccessReader } from "../../domain/ports/sub-account-menu-access.reader.js";
import { GetPrincipalSitesMenuQuery } from "./get-principal-sites-menu.query.js";
import { principalSitesMenuViewOf } from "./sub-account-menu.view.js";

/**
 * Le même mur que l'écriture (`canSetSitesMenuOf`) : la carte commune se lit
 * là où elle se règle. Un site lit la carte qui compte pour lui par sa
 * propre carte (`GET /companies/:id/menu`).
 *
 * @throws {CompanyNotFoundError} la personne n'atteint pas cette société.
 * @throws {SitesMenuWriterRequiredError} elle l'atteint sans l'administrer.
 */
@QueryHandler(GetPrincipalSitesMenuQuery)
export class GetPrincipalSitesMenuHandler implements IQueryHandler<
  GetPrincipalSitesMenuQuery,
  PrincipalSitesMenuView
> {
  constructor(
    private readonly access: SubAccountMenuAccessReader,
    private readonly menus: PrincipalSitesMenuReader,
  ) {}

  async execute(query: GetPrincipalSitesMenuQuery): Promise<PrincipalSitesMenuView> {
    const standing = await this.access.standingOf(query.userId, query.principalId);
    if (standing === null) {
      throw new CompanyNotFoundError(query.principalId);
    }
    if (!canSetSitesMenuOf(standing)) {
      throw new SitesMenuWriterRequiredError(query.principalId);
    }
    return principalSitesMenuViewOf(query.principalId, await this.menus.read(query.principalId));
  }
}
