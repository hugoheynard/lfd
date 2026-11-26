/**
 * Commande **staff** : marquer une société « maison » (un de nos
 * restaurants), ou retirer ce marquage (`restaurants-maison.md`).
 * Sous `b2b_in_house_payers:write`, gardé à la route.
 */
export class SetInHousePayerCommand {
  constructor(
    readonly companyId: string,
    readonly staffUserId: string,
    readonly inHouse: boolean,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}
