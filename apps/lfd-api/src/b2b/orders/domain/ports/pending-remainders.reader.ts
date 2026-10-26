/**
 * **Reste-t-il un envoi à remettre ?** (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 8, lot L5b).
 *
 * Port étroit, de lecture seule : les deux écrivains du solde — la remise du
 * rang 1 et celle d'un reste — ne demandent que ça. Un reste vivant est un BL
 * de rang > 1 ni remis ni annulé ; le rang 1 suit la commande et n'y compte
 * pas. L'appelant tient le verrou de la commande : la réponse vaut jusqu'à la
 * fin de sa transaction.
 */
export abstract class PendingRemaindersReader {
  abstract anyPending(orderId: string): Promise<boolean>;
}
