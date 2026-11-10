/**
 * Un agent supprime définitivement une étape et sa photo.
 *
 * Sans acteur : l'auth staff garde la route, et l'agent est figé par le journal
 * au moment du fait. Même geste que celui du gestionnaire, sans le mur
 * membership.
 */
export class RemoveDeliveryStepByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
  ) {}
}
