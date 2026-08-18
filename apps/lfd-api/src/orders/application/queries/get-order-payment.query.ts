/**
 * De quoi **régler** une commande laissée en attente : l'intention Stripe qui
 * lui est déjà rattachée.
 *
 * Une lecture et non une commande : on ne crée rien ici. L'intention a été
 * ouverte à la passation — par le client lui-même, ou par l'équipe qui a saisi
 * la commande pour lui et lui a transmis le lien.
 */
export class GetOrderPaymentQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
