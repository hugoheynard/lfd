import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../../accounting/domain/entities/invoice.types.js";
import {
  ShortfallRefundSubjectLock,
  ShortfallRefundSubjectReader,
} from "../domain/ports/shortfall-refund-subject.js";
import { settlementRegimeOf } from "../domain/services/settlement-regime.js";
import type { ShortfallRefundSubject } from "../domain/services/shortfall-refund.js";
import { LIVE_CARD_INCREASE_STATES } from "../revision/domain/entities/card-increase-proposal.js";

const SUBJECT_SELECT = {
  id: true,
  orderNumber: true,
  paymentStatus: true,
  totalCents: true,
  billableTotalCents: true,
  shortfallDecisions: { select: { id: true }, take: 1 },
} as const satisfies Prisma.OrderSelect;

/**
 * La commande dont le reste se rembourse (plan E9, § 4.2) — la ligne
 * `orders`, la décision, la facture 380 et le projet de hausse vivant. Les
 * tables lues appartiennent toutes au bloc `lafoliecoffee`. Un adaptateur,
 * deux ports : verrouillé pour le geste et l'abonné, sans verrou pour la
 * fiche commande.
 */
@Injectable()
export class PrismaShortfallRefundSubjects
  implements ShortfallRefundSubjectLock, ShortfallRefundSubjectReader
{
  constructor(private readonly prisma: PrismaService) {}

  async lock(orderId: string): Promise<ShortfallRefundSubject | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    return this.read(orderId);
  }

  async read(orderId: string): Promise<ShortfallRefundSubject | null> {
    const [row, invoices, liveIncreases] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId }, select: SUBJECT_SELECT }),
      this.prisma.invoiceOrder.count({ where: { orderId, invoiceType: COMMERCIAL_INVOICE } }),
      this.prisma.orderRevisionProposal.count({
        where: { orderId, state: { in: [...LIVE_CARD_INCREASE_STATES] } },
      }),
    ]);
    if (row === null) {
      return null;
    }
    return {
      orderId: row.id,
      reference: row.orderNumber,
      partial: row.shortfallDecisions.length > 0,
      regime: settlementRegimeOf(row.paymentStatus, row.totalCents),
      billableTotalCents: row.billableTotalCents,
      invoiced: invoices > 0,
      increasePending: liveIncreases > 0,
    };
  }
}
