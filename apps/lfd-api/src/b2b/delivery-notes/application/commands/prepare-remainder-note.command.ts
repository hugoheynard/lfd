/**
 * **Le bac d'un reliquat est fermé** : son BL passe préparé (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 4, lot L4a).
 *
 * Seul l'abonné du colisage l'envoie, pour un envoi de rang > 1 : le rang 1
 * reste à `MarkOrderReadyCommand`, qui rend la COMMANDE prête et que son BL
 * suit.
 */
export class PrepareRemainderNoteCommand {
  constructor(
    readonly orderId: string,
    readonly rank: number,
    /** L'instant de la fermeture, tel que le colisage l'a constatée — pas l'heure d'ici. */
    readonly packedAt: Date,
  ) {}
}
