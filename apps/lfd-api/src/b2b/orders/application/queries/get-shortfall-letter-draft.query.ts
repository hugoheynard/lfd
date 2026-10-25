/**
 * **La proposition « Écrire au client »** d'une commande dont le départ
 * incomplet est décidé (lot E6d, `documentation/commandes/plan-e6d-ecrire-au-client.md`).
 */
export class GetShortfallLetterDraftQuery {
  constructor(readonly orderId: string) {}
}
