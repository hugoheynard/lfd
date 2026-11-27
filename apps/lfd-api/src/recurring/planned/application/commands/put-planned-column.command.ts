import type { PutPlannedColumnPayload } from "@lfd/contracts";
import type { PlannerCaller } from "../../../channels/commerce/planner-access.js";

/** Écrit une colonne entière. `actorUserId` du `Principal`, `companyId` de l'espace. */
export class PutPlannedColumnCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly columnId: string,
    readonly payload: PutPlannedColumnPayload,
    /** Qui demande, pour la clé `orderPlanner` (adresse et preuve, du `Principal`). */
    readonly caller: PlannerCaller,
  ) {}
}
