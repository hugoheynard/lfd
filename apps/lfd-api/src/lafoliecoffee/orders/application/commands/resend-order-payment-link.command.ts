/**
 * **Renvoyer au client le lien de règlement** d'une commande à régler par
 * carte — geste de la comptabilité. `staffUserId` vient de la porte staff.
 */
export class ResendOrderPaymentLinkCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`,
     * plan `plan-service-e-mails.md`, revue, cas 4) : un second clic de même
     * clé ne réexécute rien ; un vrai renvoi en porte une neuve.
     */
    readonly intentKey: string,
  ) {}
}
