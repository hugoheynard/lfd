import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ListPendingStaffAccessQuery } from "./list-pending-staff-access.query.js";
import {
  PendingStaffAccessReader,
  type PendingStaffAccessView,
} from "./pending-staff-access.reader.js";

@QueryHandler(ListPendingStaffAccessQuery)
export class ListPendingStaffAccessHandler implements IQueryHandler<
  ListPendingStaffAccessQuery,
  readonly PendingStaffAccessView[]
> {
  constructor(private readonly pending: PendingStaffAccessReader) {}

  execute(): Promise<readonly PendingStaffAccessView[]> {
    return this.pending.list();
  }
}
