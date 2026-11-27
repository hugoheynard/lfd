import type { PlannerCaller } from "../../../channels/commerce/planner-access.js";

/** Retire une colonne encore en brouillon. `actorUserId` du `Principal`, `companyId` de l'espace. */
export class WithdrawPlannedColumnCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly columnId: string,
    /** Qui demande, pour la clé `orderPlanner` (adresse et preuve, du `Principal`). */
    readonly caller: PlannerCaller,
  ) {}
}
