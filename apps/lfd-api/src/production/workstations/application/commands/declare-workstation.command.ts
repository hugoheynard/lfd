/** Ajouter un poste au fournil, en dernier. Rend son identifiant. */
export class DeclareWorkstationCommand {
  constructor(
    readonly name: string,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne refait pas le geste, et rejouer un geste après celui de quelqu'un
     * d'autre ne le défait pas.
     */
    readonly intentKey: string,
  ) {}
}
