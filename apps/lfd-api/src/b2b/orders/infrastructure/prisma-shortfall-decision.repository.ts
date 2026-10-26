import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { FIRST_SHIPMENT_RANK } from "../../../production/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ShortfallDecision } from "../domain/entities/shortfall-decision.js";
import { settlementRegimeOf } from "../domain/services/settlement-regime.js";
import {
  ShortfallDecisionRepository,
  type LockedShortfallSubject,
} from "../domain/ports/shortfall-decision.repository.js";
import {
  SHORTFALL_STATE_SELECT,
  shortfallSnapshotOf,
} from "./prisma-order-shortfall.repository.js";

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
} as const satisfies Prisma.OrderSelect;

type SubjectRow = Prisma.OrderGetPayload<{ select: typeof SUBJECT_SELECT }>;

/** Ce que l'adaptateur relit de l'envoi, à côté de la commande. */
interface ShipmentRows {
  readonly rank: number;
  readonly shortfall: Prisma.OrderShortfallGetPayload<{
    select: typeof SHORTFALL_STATE_SELECT & { decision: { select: { id: true } } };
  }> | null;
  readonly remainderNoteStatus: string | null;
}

function lockedOf(row: SubjectRow, shipment: ShipmentRows): LockedShortfallSubject {
  return {
    subject: {
      orderId: row.id,
      reference: row.orderNumber,
      rank: shipment.rank,
      status: row.status,
      remainderNoteStatus: shipment.remainderNoteStatus,
      settlementRegime: settlementRegimeOf(row.paymentStatus, row.totalCents),
      voucherDiscountCents: row.voucherDiscountCents,
      frozenTerms: [
        { amountCents: row.discountCents, hasAdjustment: row.discountAdjustment !== null },
        { amountCents: row.deliveryFeeCents, hasAdjustment: row.deliveryFeeAdjustment !== null },
        { amountCents: row.lateFeeCents, hasAdjustment: row.lateFeeAdjustment !== null },
      ],
      decided: (shipment.shortfall?.decision ?? null) !== null,
    },
    placedByUserId: row.placedByUserId,
    shortfall: shortfallSnapshotOf(
      { orderId: row.id, rank: shipment.rank, reference: row.orderNumber },
      shipment.shortfall,
    ),
  };
}

/**
 * L'adaptateur de la décision du départ incomplet (E6b), par envoi (plan E7
 * reliquat, LB), par le client routé.
 */
@Injectable()
export class PrismaShortfallDecisionRepository extends ShortfallDecisionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockSubject(orderId: string, rank: number): Promise<LockedShortfallSubject | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: SUBJECT_SELECT,
    });
    if (row === null) {
      return null;
    }
    const [shortfall, remainderNoteStatus] = await Promise.all([
      this.prisma.orderShortfall.findUnique({
        where: { orderId_rank: { orderId, rank } },
        select: { ...SHORTFALL_STATE_SELECT, decision: { select: { id: true } } },
      }),
      this.remainderNoteStatusOf(orderId, rank),
    ]);
    return lockedOf(row, { rank, shortfall, remainderNoteStatus });
  }

  async save(decision: ShortfallDecision): Promise<void> {
    const state = decision.toSnapshot();
    await this.prisma.orderShortfallDecision.create({
      data: {
        id: state.id,
        orderId: state.orderId,
        rank: state.rank,
        decidedAt: state.decidedAt,
        decidedByStaffId: state.decidedBy,
        remainder: state.remainder,
        departing: state.departing.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        signalReportedAt: state.signalReportedAt,
      },
    });
  }

  /**
   * Le statut du BL VIVANT de ce rang, au-delà du rang 1 (plan E7 reliquat,
   * choix 11) ; `null` sans BL vivant. Le rang 1 suit sa commande : rien à lire.
   */
  private async remainderNoteStatusOf(orderId: string, rank: number): Promise<string | null> {
    if (rank === FIRST_SHIPMENT_RANK) {
      return null;
    }
    const note = await this.prisma.deliveryNote.findFirst({
      where: { orderId, rank, status: { not: "voided" } },
      select: { status: true },
    });
    return note?.status ?? null;
  }
}
