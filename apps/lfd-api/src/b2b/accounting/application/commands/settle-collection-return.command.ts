/**
 * La ligne d'un retour bancaire a été réglée par un autre chemin — lien de
 * paiement, virement (plan `plan-retours-bancaires.md`, § 4).
 */
export class SettleCollectionReturnCommand {
  constructor(
    readonly returnId: string,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
