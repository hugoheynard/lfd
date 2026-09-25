import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  OrderNotFoundError,
  OrderPaymentLinkRefusedError,
} from "../../domain/errors/order-errors.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderPaymentLinkReader } from "../../domain/ports/order-payment-link.reader.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { awaitsCardPayment, paymentUrlFor } from "../../domain/services/payment-link.js";
import { ResendOrderPaymentLinkCommand } from "./resend-order-payment-link.command.js";

/**
 * Envoie à l'acheteur le **lien de règlement** de sa commande (plan liens de
 * paiement §2a), par le gabarit `customer.order-payment-link`.
 *
 * Trois refus, chacun nommé pour l'agent qui clique :
 * - la commande n'attend plus de règlement (payée, sans objet, annulée) ;
 * - l'espace client n'a pas d'adresse publique : le lien n'existe pas ;
 * - l'acheteur n'a pas d'adresse lisible.
 *
 * Comme le rappel de retrait, la clé d'idempotence porte l'instant : un renvoi
 * n'existe que pour repartir.
 */
@CommandHandler(ResendOrderPaymentLinkCommand)
export class ResendOrderPaymentLinkHandler implements ICommandHandler<
  ResendOrderPaymentLinkCommand,
  void
> {
  constructor(
    private readonly orders: OrderPaymentLinkReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async execute(command: ResendOrderPaymentLinkCommand): Promise<void> {
    const standing = await this.orders.findStanding(command.orderId);
    if (standing === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    if (!awaitsCardPayment(standing.status, standing.paymentStatus)) {
      throw new OrderPaymentLinkRefusedError(
        `La commande ${standing.reference} n'attend plus de règlement par carte : il n'y a pas de lien à renvoyer.`,
      );
    }
    const settleUrl = paymentUrlFor(this.origins.clientBaseUrl(), standing.orderId);
    if (settleUrl === null) {
      throw new OrderPaymentLinkRefusedError(
        "L'adresse publique de l'espace client (CLIENT_BASE_URL) n'est pas configurée : " +
          "aucun lien de règlement ne peut partir. Prévenez l'équipe technique.",
      );
    }
    const recipient = await this.recipients.findById(standing.placedByUserId);
    if (recipient === null) {
      throw new OrderPaymentLinkRefusedError(
        `L'acheteur de la commande ${standing.reference} n'a pas d'adresse e-mail lisible : ` +
          "copiez le lien et transmettez-le autrement.",
      );
    }
    await this.mailer.send({
      to: recipient.email,
      template: "customer.order-payment-link",
      data: { reference: standing.reference, totalCents: standing.totalCents, settleUrl },
      idempotencyKey: `order.payment-link:${standing.orderId}:${this.clock.now().toISOString()}`,
    });
  }
}
