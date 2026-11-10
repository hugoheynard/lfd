/**
 * Passe en perte la ligne d'un retour bancaire, avec un motif — un état et un
 * fait, aucune écriture comptable (plan `retours-bancaires.md`).
 */
export class WriteOffCollectionReturnCommand {
  constructor(
    readonly returnId: string,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
