/** Archiver un poste qui ne porte plus aucun produit. */
export class ArchiveWorkstationCommand {
  constructor(
    readonly workstationId: string,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne refait pas le geste, et rejouer un geste après celui de quelqu'un
     * d'autre ne le défait pas.
     */
    readonly intentKey: string,
  ) {}
}
