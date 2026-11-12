import type { StaffPermission, VersionSubject } from "@lfd/contracts";

/**
 * Les numéros des sujets demandés, pour un appelant dont on connaît les
 * permissions résolues. `serviceDay` n'est `null` que si aucun sujet
 * journalier n'est demandé.
 */
export class GetVersionsQuery {
  constructor(
    readonly serviceDay: string | null,
    readonly subjects: readonly VersionSubject[],
    readonly permissions: readonly StaffPermission[],
  ) {}
}
