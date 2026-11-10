import { Injectable } from "@nestjs/common";

import { PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderRefundStatusWriter } from "../domain/ports/order-refund-status.writer.js";

/**
 * Les deux bascules du règlement par le remboursement, conditionnées en base.
 * Pas de mur tenant : l'appelant est le canal de `card-payment`, sous le
 * verrou de la commande qu'il a pris (`lockSubject`) — aucune société ne parle.
 */
@Injectable()
export class PrismaOrderRefundStatusWriter extends OrderRefundStatusWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async markRefunded(orderId: string): Promise<boolean> {
    const written = await this.prisma.order.updateMany({
      where: { id: orderId, paymentStatus: PaymentStatus.paid },
      data: { paymentStatus: PaymentStatus.refunded },
    });
    return written.count === 1;
  }

  async restorePaid(orderId: string): Promise<boolean> {
    const written = await this.prisma.order.updateMany({
      where: { id: orderId, paymentStatus: PaymentStatus.refunded },
      data: { paymentStatus: PaymentStatus.paid },
    });
    return written.count === 1;
  }
}
