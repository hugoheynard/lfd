import type { StaffMeView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { GetStaffMeQuery } from "./get-staff-me.query.js";

/**
 * Sert `/admin/me`. Relit l'annuaire **sans passer par le cache du guard** :
 * l'écran se dessine avec l'état courant, pas avec un instantané qui peut avoir
 * jusqu'à trente secondes. Un rechargement doit refléter un droit qu'on vient
 * d'accorder, sinon on croit à un bug.
 */
@QueryHandler(GetStaffMeQuery)
export class GetStaffMeHandler implements IQueryHandler<GetStaffMeQuery, StaffMeView> {
  constructor(private readonly staff: StaffUserRepository) {}

  execute(query: GetStaffMeQuery): Promise<StaffMeView> {
    return this.staff.me(query.staffUserId);
  }
}
