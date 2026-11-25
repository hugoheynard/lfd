/** Un poste qui quitte des produits (références produit) ; le dernier les remet « à ranger ». */
export class RemoveWorkstationFromProductsCommand {
  constructor(
    readonly workstationId: string,
    readonly productSkus: readonly string[],
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double clic ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
