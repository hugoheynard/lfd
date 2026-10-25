import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ShortfallDecision } from "../domain/entities/shortfall-decision.js";
import { settlementRegimeOf } from "../domain/services/settlement-regime.js";
import {
  ShortfallDecisionRepository,
  type LockedShortfallSubject,
} from "../domain/ports/shortfall-decision.repository.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";

const SUBJECT_SELECT = {
  id: true,
  orderNumber: true,
  placedByUserId: true,
  status: true,
  paymentStatus: true,
  totalCents: true,
  voucherDiscountCents: true,
  discountCents: true,
  discountAdjustment: true,
  deliveryFeeCents: true,
  deliveryFeeAdjustment: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  shortfallReportedAt: true,
  shortfallLines: true,
  shortfallClearedAt: true,
  shortfallDecidedAt: true,
  shortfallDecision: { select: { id: true } },
} as const satisfies Prisma.OrderSelect;

type SubjectRow = Prisma.OrderGetPayload<{ select: typeof SUBJECT_SELECT }>;

function lockedOf(row: SubjectRow): LockedShortfallSubject {
  return {
    subject: {
      orderId: row.id,
      reference: row.orderNumber,
      status: row.status,
      settlementRegime: settlementRegimeOf(row.paymentStatus, row.totalCents),
      voucherDiscountCents: row.voucherDiscountCents,
      frozenTerms: [
        { amountCents: row.discountCents, hasAdjustment: row.discountAdjustment !== null },
        { amountCents: row.deliveryFeeCents, hasAdjustment: row.deliveryFeeAdjustment !== null },
        { amountCents: row.lateFeeCents, hasAdjustment: row.lateFeeAdjustment !== null },
      ],
      decided: row.shortfallDecision !== null,
    },
    placedByUserId: row.placedByUserId,
    shortfall: {
      orderId: row.id,
      reference: row.orderNumber,
      reportedAt: row.shortfallReportedAt,
      lines: row.shortfallLines === null ? null : shortfallLinesOf(row.shortfallLines),
      clearedAt: row.shortfallClearedAt,
      decidedAt: row.shortfallDecidedAt,
    },
  };
}

/** L'adaptateur de la décision du départ incomplet (E6b), par le client routé. */
@Injectable()
export class PrismaShortfallDecisionRepository extends ShortfallDecisionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockSubject(orderId: string): Promise<LockedShortfallSubject | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: SUBJECT_SELECT,
    });
    return row === null ? null : lockedOf(row);
  }

  async save(decision: ShortfallDecision): Promise<void> {
    const state = decision.toSnapshot();
    await this.prisma.orderShortfallDecision.create({
      data: {
        id: state.id,
        orderId: state.orderId,
        decidedAt: state.decidedAt,
        decidedByStaffId: state.decidedBy,
        remainder: state.remainder,
        departing: state.departing.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        signalReportedAt: state.signalReportedAt,
      },
    });
  }
}
