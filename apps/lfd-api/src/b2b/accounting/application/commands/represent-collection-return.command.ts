/**
 * Re-présente au prochain lot la ligne d'un retour bancaire (plan
 * `plan-retours-bancaires.md`, § 2 bis-2, 5, 6).
 */
export class RepresentCollectionReturnCommand {
  constructor(
    readonly returnId: string,
    readonly staffUserId: string,
  ) {}
}
