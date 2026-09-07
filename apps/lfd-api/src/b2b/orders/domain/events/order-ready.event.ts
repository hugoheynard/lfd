/**
 * Fait de domaine : **une commande vient d'être déclarée prête**. Publié par le
 * contexte `orders` après persistance ; le contexte ne sait pas qui l'écoute.
 *
 * Il ne porte que l'identifiant : contrairement à `OrderPlacedEvent`, aucun
 * abonné n'a besoin d'un montant ni d'une société pour agir. Un fait qui
 * transporte plus que nécessaire finit par être lu pour ce qu'il transporte, et
 * on n'ose plus l'alléger.
 */
export class OrderReadyEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
  ) {}
}
