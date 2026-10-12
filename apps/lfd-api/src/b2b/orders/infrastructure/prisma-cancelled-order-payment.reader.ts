import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CancelledOrderPaymentReader } from "../domain/ports/cancelled-order-payment.reader.js";

/**
 * Adaptateur Prisma : l'intention est `@unique`, donc au plus une commande.
 *
 * `paymentStatus = failed` depuis le lot C4 (C4.11 bis, `vitruve` BLOQUANT 2) :
 * c'est le SEUL règlement d'une annulée non payée (C3.4). Une annulée `paid`
 * ou `refunded` — annulée APRÈS l'encaissement, remboursée par C4 — qui verrait
 * un `payment_intent.succeeded` relivré ne doit pas passer pour « encaissée
 * après annulation » : elle serait remboursée deux fois.
 */
@Injectable()
export class PrismaCancelledOrderPaymentReader extends CancelledOrderPaymentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async cancelledOrderOf(paymentIntentId: string): Promise<string | null> {
    const row = await this.prisma.order.findFirst({
      where: {
        stripePaymentIntentId: paymentIntentId,
        status: OrderStatus.cancelled,
        paymentStatus: PaymentStatus.failed,
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
