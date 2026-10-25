/**
 * **La proposition « Écrire au client »** d'une commande dont le départ
 * incomplet est décidé (lot E6d, plan E6d (`documentation/commandes/bon-de-livraison.md`)).
 */
export class GetShortfallLetterDraftQuery {
  constructor(readonly orderId: string) {}
}
