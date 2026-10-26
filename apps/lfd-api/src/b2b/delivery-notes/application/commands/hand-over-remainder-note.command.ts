/**
 * **Un reliquat a été remis au client** : son BL passe remis (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 3, lot L4b).
 *
 * Seul l'abonné du retrait l'envoie, pour un envoi de rang > 1 : le rang 1
 * reste à `MarkOrderFulfilledCommand`, qui ferme la COMMANDE et que son BL
 * suit.
 */
export class HandOverRemainderNoteCommand {
  constructor(
    readonly orderId: string,
    readonly rank: number,
    /** L'instant du retrait, tel que le retrait l'a attesté — pas l'heure d'ici. */
    readonly handedOverAt: Date,
  ) {}
}
