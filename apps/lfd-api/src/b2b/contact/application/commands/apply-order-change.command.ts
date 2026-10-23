/**
 * **Appliquer une demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4). Acte
 * **staff** : la révision est faite au nom de cette fiche. Rend la révision
 * produite.
 */
export class ApplyOrderChangeCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
  ) {}
}
