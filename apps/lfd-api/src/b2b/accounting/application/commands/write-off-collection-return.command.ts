/**
 * Passe en perte la ligne d'un retour bancaire, avec un motif — un état et un
 * fait, aucune écriture comptable (plan `plan-retours-bancaires.md`, § 2 bis-9).
 */
export class WriteOffCollectionReturnCommand {
  constructor(
    readonly returnId: string,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
