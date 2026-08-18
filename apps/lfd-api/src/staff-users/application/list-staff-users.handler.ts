import type { StaffUserView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { ListStaffUsersQuery } from "./list-staff-users.query.js";

/** Sert la liste des users staff (triés par nom). Lecture pure. */
@QueryHandler(ListStaffUsersQuery)
export class ListStaffUsersHandler implements IQueryHandler<
  ListStaffUsersQuery,
  readonly StaffUserView[]
> {
  constructor(private readonly staff: StaffUserRepository) {}

  execute(): Promise<readonly StaffUserView[]> {
    return this.staff.list();
  }
}
