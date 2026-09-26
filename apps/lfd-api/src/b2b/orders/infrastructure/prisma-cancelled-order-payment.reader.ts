import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CancelledOrderPaymentReader } from "../domain/ports/cancelled-order-payment.reader.js";

/** Adaptateur Prisma : l'intention est `@unique`, donc au plus une commande. */
@Injectable()
export class PrismaCancelledOrderPaymentReader extends CancelledOrderPaymentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async cancelledOrderOf(paymentIntentId: string): Promise<string | null> {
    const row = await this.prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntentId, status: OrderStatus.cancelled },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
