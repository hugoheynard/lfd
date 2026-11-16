/** Placer des produits (références produit) sur un poste, ou les remettre « à ranger » (`null`). */
export class PlaceProductsCommand {
  constructor(
    readonly productSkus: readonly string[],
    readonly workstationId: string | null,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne refait pas le geste, et rejouer un geste après celui de quelqu'un
     * d'autre ne le défait pas.
     */
    readonly intentKey: string,
  ) {}
}
