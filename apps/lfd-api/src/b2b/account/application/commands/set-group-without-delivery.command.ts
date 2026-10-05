/**
 * Commande **staff** : cocher ou décocher « Compte de groupe, sans
 * livraison » sur un principal (plan `plan-sous-comptes.md`, §4).
 */
export class SetGroupWithoutDeliveryCommand {
  constructor(
    readonly companyId: string,
    readonly enabled: boolean,
  ) {}
}
