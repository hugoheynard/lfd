import type { SubAccountMenuView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { SubAccountMenuReader } from "../../domain/ports/sub-account-menu.reader.js";
import { GetSubAccountMenuForStaffQuery } from "./get-sub-account-menu-for-staff.query.js";
import { subAccountMenuViewOf } from "./sub-account-menu.view.js";

/** La carte d'un sous-compte pour la fiche client ; `menu: null` sans carte. */
@QueryHandler(GetSubAccountMenuForStaffQuery)
export class GetSubAccountMenuForStaffHandler implements IQueryHandler<
  GetSubAccountMenuForStaffQuery,
  SubAccountMenuView
> {
  constructor(private readonly menus: SubAccountMenuReader) {}

  async execute(query: GetSubAccountMenuForStaffQuery): Promise<SubAccountMenuView> {
    return subAccountMenuViewOf(query.companyId, await this.menus.read(query.companyId));
  }
}
