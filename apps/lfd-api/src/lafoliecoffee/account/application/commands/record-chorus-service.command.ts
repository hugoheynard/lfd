import type { ChorusServicePayload } from "@lfd/contracts";

/**
 * Pose la fiche du service Chorus d'une société qui commande : son code
 * service et l'engagement en cours de son bon. Acte **staff**, sans mur
 * membership : la surface admin porte l'autorisation en amont, sous le même
 * droit que la fiche Chorus Pro.
 */
export class RecordChorusServiceCommand {
  constructor(
    readonly companyId: string,
    /** L'agent qui pose la fiche : sa parole est gardée sur la ligne. */
    readonly staffUserId: string,
    readonly payload: ChorusServicePayload,
  ) {}
}
