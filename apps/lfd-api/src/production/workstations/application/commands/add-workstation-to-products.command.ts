/** Un poste de plus pour des produits (références produit) : le premier poste d'un produit le finit. */
export class AddWorkstationToProductsCommand {
  constructor(
    readonly workstationId: string,
    readonly productSkus: readonly string[],
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double clic ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
