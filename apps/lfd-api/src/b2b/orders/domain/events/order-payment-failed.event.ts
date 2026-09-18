/**
 * Fait de domaine : **le règlement d'une commande a été refusé**.
 *
 * 🔴 **Ce fait n'existait pas, et son absence coûtait deux choses** (Hugo,
 * 2026-09-17). Le dépôt écrivait `failed` dans une colonne que personne ne
 * relisait : le client n'était averti de rien — il avait même reçu, à la
 * passation, un courriel lui annonçant que sa commande entrait en fabrication —
 * et le comptoir continuait de l'attendre.
 *
 * ⚠️ Comme son jumeau {@link OrderPaymentSettledEvent}, il ne porte que
 * l'identifiant, et n'est publié qu'au **franchissement** : un webhook rejoué ne
 * bascule aucune ligne, donc ne prévient pas deux fois.
 *
 * ⚠️ **Ce que ce fait ne dit PAS** : qu'une carte a été abandonnée. Fermer
 * l'onglet devant le formulaire n'émet aucun événement Stripe — la commande
 * reste `pending` pour toujours, et personne n'est prévenu. Fermer ce cas
 * demande d'expirer les commandes impayées, ce qui est un autre chantier
 * (`documentation/order/architecture-reglement-et-compte-de-production.md`, §8).
 */
export class OrderPaymentFailedEvent {
  constructor(readonly orderId: string) {}
}
