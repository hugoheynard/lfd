import type { SubAccountMenuView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { canSetMenuOf } from "../../../shared/company-standing/domain/sub-account-menu-writing.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuAccessReader } from "../../domain/ports/sub-account-menu-access.reader.js";
import { SubAccountMenuReader } from "../../domain/ports/sub-account-menu.reader.js";
import { GetSubAccountMenuQuery } from "./get-sub-account-menu.query.js";
import { subAccountMenuViewOf } from "./sub-account-menu.view.js";

/**
 * Le même mur que l'écriture (`canSetMenuOf`) : la carte se lit là où elle
 * se règle. Un frère, le site lui-même ou un étranger n'y lisent rien.
 *
 * @throws {CompanyNotFoundError} la personne n'atteint pas ce site.
 * @throws {SubAccountMenuWriterRequiredError} elle l'atteint sans administrer son principal.
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
    if (!canSetMenuOf(standing)) {
      throw new SubAccountMenuWriterRequiredError(query.subAccountId);
    }
    return subAccountMenuViewOf(query.subAccountId, await this.menus.read(query.subAccountId));
  }
}
