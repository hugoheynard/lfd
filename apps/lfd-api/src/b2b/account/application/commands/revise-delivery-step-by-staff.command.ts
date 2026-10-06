import type { DeliveryStepFields } from "@lfd/contracts";

/**
 * Un agent refait une étape : titre, texte, photo gardée / retirée / remplacée.
 *
 * Sans acteur : l'auth staff garde la route, et l'agent est figé par le journal
 * au moment du fait. Même geste que celui du gestionnaire, sans le mur
 * membership.
 */
export class ReviseDeliveryStepByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
    readonly fields: DeliveryStepFields,
    readonly removePhoto: boolean,
    readonly photo: Buffer | null,
  ) {}
}
