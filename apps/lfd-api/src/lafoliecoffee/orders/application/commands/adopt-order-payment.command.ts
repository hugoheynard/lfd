/**
 * **Adopter le paiement d'une commande** que le bloc `card-payment` ne connaît
 * pas encore — une intention ouverte par l'image d'avant le bloc (plan
 * `documentation/payment/le-bloc-payment.md`). La page de règlement, qui est une lecture, la dit « à adopter » ;
 * l'écran envoie cette commande, puis relit. Idempotente : une intention déjà
 * rattachée n'est pas rattachée deux fois.
 */
export class AdoptOrderPaymentCommand {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
