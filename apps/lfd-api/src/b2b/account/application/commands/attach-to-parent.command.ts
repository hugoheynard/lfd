/**
 * Commande **staff** : rattacher un client existant comme sous-compte de
 * `parentId` (plan `plan-sous-comptes.md`, §4). Aucun aspect n'est suivi
 * d'office : chacun se décide à part.
 */
export class AttachToParentCommand {
  constructor(
    readonly companyId: string,
    readonly parentId: string,
  ) {}
}
