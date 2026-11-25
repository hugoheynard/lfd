/** La pile d'un poste : exactement ses produits, chacun une fois, du haut vers le bas. */
export class ReorderWorkstationProductsCommand {
  constructor(
    readonly workstationId: string,
    readonly productSkus: readonly string[],
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne refait pas le geste, et rejouer une pile après celle de
     * quelqu'un d'autre ne la défait pas.
     */
    readonly intentKey: string,
  ) {}
}
