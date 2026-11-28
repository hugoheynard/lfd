import type { PutPlannedColumnPayload } from "@lfd/contracts";

/** Écrit une colonne entière. `actorUserId` du `Principal`, `companyId` de l'espace. */
export class PutPlannedColumnCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly columnId: string,
    readonly payload: PutPlannedColumnPayload,
  ) {}
}
