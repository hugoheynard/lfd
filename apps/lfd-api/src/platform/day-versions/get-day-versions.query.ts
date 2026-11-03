import type { DayJournal, StaffPermission } from "@lfd/contracts";

/**
 * Les versions d'une journée dans les journaux demandés, pour un appelant
 * dont on connaît les permissions résolues.
 */
export class GetDayVersionsQuery {
  constructor(
    readonly serviceDay: string,
    readonly journals: readonly DayJournal[],
    readonly permissions: readonly StaffPermission[],
  ) {}
}
