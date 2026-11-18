import type { ChorusRoutingPayload } from "@lfd/contracts";

/**
 * Pose la fiche Chorus Pro d'un organisme public, relevée par le staff dans
 * l'annuaire Chorus. Acte **staff**, sans mur membership : la surface admin
 * porte l'autorisation en amont, sous le même droit que la correction
 * d'identité.
 */
export class RecordChorusRoutingCommand {
  constructor(
    readonly companyId: string,
    /** L'agent qui a relevé la fiche : sa parole est gardée sur la ligne. */
    readonly staffUserId: string,
    readonly payload: ChorusRoutingPayload,
  ) {}
}
