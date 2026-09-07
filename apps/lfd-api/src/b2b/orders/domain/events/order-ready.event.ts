/**
 * Fait de domaine : **une commande vient d'être déclarée prête**. Publié par le
 * contexte `orders` après persistance ; le contexte ne sait pas qui l'écoute.
 *
 * Il ne porte ni montant ni société : contrairement à `OrderPlacedEvent`, aucun
 * abonné n'en a besoin pour agir. Un fait qui transporte plus que nécessaire
 * finit par être lu pour ce qu'il transporte, et on n'ose plus l'alléger.
 */
export class OrderReadyEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client à qui elle appartient — le sujet de la trace. */
    readonly placedByUserId: string,
    /** L'identité staff qui a scanné le colisage (claim `sub`), figée. */
    readonly readyBy: string,
    readonly readyAt: Date,
  ) {}
}
