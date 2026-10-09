/**
 * La ligne d'un retour bancaire a été réglée par un autre chemin — lien de
 * paiement, virement (plan `retours-bancaires.md`).
 */
export class SettleCollectionReturnCommand {
  constructor(
    readonly returnId: string,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
