/**
 * Re-présente au prochain lot la ligne d'un retour bancaire (plan
 * `retours-bancaires.md`).
 */
export class RepresentCollectionReturnCommand {
  constructor(
    readonly returnId: string,
    readonly staffUserId: string,
  ) {}
}
