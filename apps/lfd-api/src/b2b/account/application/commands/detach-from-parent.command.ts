/**
 * Commande **staff** : détacher un sous-compte de son principal (plan
 * `plan-sous-comptes.md`, §4). Toutes ses périodes de suivi en cours se
 * ferment : il reprend ses valeurs propres, qui dormaient.
 */
export class DetachFromParentCommand {
  constructor(readonly companyId: string) {}
}
