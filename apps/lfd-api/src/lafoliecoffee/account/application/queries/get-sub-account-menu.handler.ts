import type { SubAccountMenuView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { canReadSiteMenuOf } from "../../../shared/company-standing/domain/sub-account-menu-writing.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuAccessReader } from "../../domain/ports/sub-account-menu-access.reader.js";
import { SubAccountMenuReader } from "../../domain/ports/sub-account-menu.reader.js";
import { GetSubAccountMenuQuery } from "./get-sub-account-menu.query.js";
import { subAccountMenuViewOf } from "./sub-account-menu.view.js";

/**
 * La carte d'un site se lit là où elle se règle — le propriétaire ou l'admin
 * du principal — ET depuis le site lui-même, par tout membre accepté, en
 * lecture seule (`canReadSiteMenuOf` ; décidé par Hugo le 2026-11-20 : « le
 * site lit mais ne paramètre pas »). Un frère ou un étranger n'y lisent rien.
 *
 * @throws {CompanyNotFoundError} la personne n'atteint pas ce site.
 * @throws {SubAccountMenuWriterRequiredError} elle l'atteint sans en être membre accepté ni administrer son principal.
 */
@QueryHandler(GetSubAccountMenuQuery)
export class GetSubAccountMenuHandler implements IQueryHandler<
  GetSubAccountMenuQuery,
  SubAccountMenuView
> {
  constructor(
    private readonly access: SubAccountMenuAccessReader,
    private readonly menus: SubAccountMenuReader,
  ) {}

  async execute(query: GetSubAccountMenuQuery): Promise<SubAccountMenuView> {
    const standing = await this.access.standingOf(query.userId, query.subAccountId);
    if (standing === null) {
      throw new CompanyNotFoundError(query.subAccountId);
    }
    if (!canReadSiteMenuOf(standing)) {
      throw new SubAccountMenuWriterRequiredError(query.subAccountId);
    }
    return subAccountMenuViewOf(query.subAccountId, await this.menus.read(query.subAccountId));
  }
}
