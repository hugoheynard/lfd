/** Le nouvel ordre des fiches : exactement les postes en service, chacun une fois. */
export class ReorderWorkstationsCommand {
  constructor(
    readonly workstationIds: readonly string[],
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne refait pas le geste, et rejouer un geste après celui de quelqu'un
     * d'autre ne le défait pas.
     */
    readonly intentKey: string,
  ) {}
}
