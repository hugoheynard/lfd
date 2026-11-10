/**
 * Un agent range les étapes dans un nouvel ordre — toutes, chacune une fois.
 *
 * Sans acteur : l'auth staff garde la route, et l'agent est figé par le journal
 * au moment du fait. Même geste que celui du gestionnaire, sans le mur
 * membership.
 */
export class ReorderDeliveryStepsByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepIds: readonly string[],
  ) {}
}
