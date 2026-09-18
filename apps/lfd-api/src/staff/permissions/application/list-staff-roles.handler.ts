import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { StaffRoleView } from "@lfd/contracts";

import { StaffRoleReader } from "../domain/staff-role.reader.js";
import { ListStaffRolesQuery } from "./list-staff-roles.query.js";

/** Tous les rôles, `superadmin` compris — cf. {@link StaffRoleReader}. */
@QueryHandler(ListStaffRolesQuery)
export class ListStaffRolesHandler implements IQueryHandler<
  ListStaffRolesQuery,
  readonly StaffRoleView[]
> {
  constructor(private readonly roles: StaffRoleReader) {}

  execute(): Promise<readonly StaffRoleView[]> {
    return this.roles.list();
  }
}
