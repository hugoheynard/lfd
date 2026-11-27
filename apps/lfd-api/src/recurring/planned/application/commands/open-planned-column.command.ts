import type { OpenPlannedColumnPayload } from "@lfd/contracts";
import type { PlannerCaller } from "../../../channels/commerce/planner-access.js";

/**
 * Ouvre une colonne vide pour un jour et un créneau. `actorUserId` vient du
 * `Principal`, `companyId` de l'espace (`@ActingCompany`) — jamais du corps.
 */
export class OpenPlannedColumnCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly payload: OpenPlannedColumnPayload,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
    /** Qui demande, pour la clé `orderPlanner` (adresse et preuve, du `Principal`). */
    readonly caller: PlannerCaller,
  ) {}
}
