/** Saisir la quantité réellement emballée d'une ligne d'une fiche de réassort (R3b). */
export class EnterPackedResupplyLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly resupplyId: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
  ) {}
}
