/**
 * Port de **lecture** de l'encaissement : l'intention payée appartient-elle à
 * une commande **annulée** ? Étroit par construction (ISP) — le webhook ne lit
 * rien d'autre, et seulement quand l'écriture n'a rien franchi.
 */
export abstract class CancelledOrderPaymentReader {
  /** L'identifiant de la commande annulée qui porte cette intention, sinon `null`. */
  abstract cancelledOrderOf(paymentIntentId: string): Promise<string | null>;
}
