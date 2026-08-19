import type { StaffMeView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSelfSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { GetStaffMeQuery } from "../application/get-staff-me.query.js";

/**
 * « Qui suis-je, et que puis-je faire » — **le seul point** par lequel un écran
 * admin apprend ses droits.
 *
 * C'est aussi la couture de sortie vers un futur backend IAM : le jour où les
 * droits viennent d'ailleurs, on change qui répond à cette question, pas un
 * écran. Surface réflexive : elle exige une fiche connue et non suspendue, mais
 * aucune permission — il faudrait sinon un droit pour apprendre qu'on n'en a
 * aucun.
 */
@Controller("admin/me")
@AdminSelfSurface()
export class AdminMeController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  me(@StaffUserId() staffUserId: string): Promise<StaffMeView> {
    return this.queries.execute<GetStaffMeQuery, StaffMeView>(new GetStaffMeQuery(staffUserId));
  }
}
