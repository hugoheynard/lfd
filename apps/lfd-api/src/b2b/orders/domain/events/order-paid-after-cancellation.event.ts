/**
 * Fait de domaine : **une carte a été encaissée sur une commande annulée** —
 * de l'argent reçu pour une commande que personne ne produira (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lot 6 bis, B1).
 *
 * La clôture annule une commande même quand Stripe n'a pas confirmé la mort
 * de son intention : une panne ne doit pas arrêter le fournil. Le prix en est
 * ce cas-ci — une intention restée vivante que le client finit de payer. La
 * base ne rouvre jamais l'annulée ; ce fait existe pour que quelqu'un
 * rembourse.
 *
 * Publié à chaque webhook d'encaissement qui trouve la commande annulée : un
 * rejeu le republie, et c'est la clé de la cloche qui dédoublonne.
 */
export class OrderPaidAfterCancellationEvent {
  constructor(readonly orderId: string) {}
}
