/**
 * **L'équipe écrit au client après un départ incomplet** (lot E6d,
 * plan E6d (`documentation/commandes/bon-de-livraison.md`)).
 *
 * `message` est le texte RELU — celui qui part. `staffUserId` est l'id de la
 * FICHE, reçu de la porte.
 */
export class WriteShortfallLetterCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly message: string,
  ) {}
}
