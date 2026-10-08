import { Injectable } from "@nestjs/common";

import { PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderRefundLedger } from "../domain/entities/order-refund-ledger.js";
import { OrderRefundRepository } from "../domain/ports/order-refund.repository.js";

const REFUND_SELECT = {
  id: true,
  stripeRefundId: true,
  amountCents: true,
  currency: true,
  status: true,
  refundedAt: true,
  recordedAt: true,
  updatedAt: true,
  creditNoteId: true,
} as const;

/** Les deux règlements entre lesquels un remboursement fait passer une commande. */
const SETTLED: readonly PaymentStatus[] = [PaymentStatus.paid, PaymentStatus.refunded];

/**
 * Adaptateur Prisma du carnet des remboursements : `load` → `reconstitute`,
 * `save` ← `toPersistence`.
 *
 * Pas de mur tenant dans le `where`, et c'est la même raison que
 * `OrderRepository.markPaid` : l'appelant est le webhook Stripe, authentifié
 * par signature, qui ne parle au nom d'aucune société — la clé est
 * l'intention, `@unique`.
 */
@Injectable()
export class PrismaOrderRefundRepository extends OrderRefundRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadByPaymentIntent(paymentIntentId: string): Promise<OrderRefundLedger | null> {
    // Le verrou d'abord, la lecture ensuite : sous `FOR UPDATE`, un second
    // webhook attend que le premier ait écrit son remboursement.
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "stripe_payment_intent_id" = ${paymentIntentId}
      FOR UPDATE`;
    const orderId = locked[0]?.id;
    if (orderId === undefined) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalCents: true,
        paymentStatus: true,
        refunds: { select: REFUND_SELECT, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] },
      },
    });
    return OrderRefundLedger.reconstitute({
      orderId: row.id,
      orderNumber: row.orderNumber,
      chargedCents: row.totalCents,
      paymentStatus: row.paymentStatus,
      refunds: row.refunds,
    });
  }

  async save(ledger: OrderRefundLedger): Promise<void> {
    const { paymentStatus, refunds } = ledger.toPersistence();
    for (const refund of refunds) {
      const { id, stripeRefundId, ...columns } = refund;
      await this.prisma.orderRefund.upsert({
        where: { stripeRefundId },
        // Seul ce qu'un constat change : le montant, la devise et l'instant
        // Stripe sont figés à la première lecture.
        update: { status: columns.status, updatedAt: columns.updatedAt },
        create: { id, stripeRefundId, orderId: ledger.orderId, ...columns },
      });
    }
    if (paymentStatus === PaymentStatus.paid || paymentStatus === PaymentStatus.refunded) {
      await this.prisma.order.updateMany({
        where: { id: ledger.orderId, paymentStatus: { in: [...SETTLED] } },
        data: { paymentStatus },
      });
    }
  }
}
