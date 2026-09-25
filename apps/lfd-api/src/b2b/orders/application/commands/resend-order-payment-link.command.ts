/**
 * **Renvoyer au client le lien de règlement** d'une commande à régler par
 * carte — geste de la comptabilité. `staffUserId` vient de la porte staff.
 */
export class ResendOrderPaymentLinkCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
