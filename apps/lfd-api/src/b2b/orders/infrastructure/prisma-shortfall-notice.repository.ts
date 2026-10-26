import { Injectable } from "@nestjs/common";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShortfallNotice } from "../domain/entities/shortfall-notice.js";
import {
  ShortfallNoticeRepository,
  type LockedShortfallNotice,
} from "../domain/ports/shortfall-notice.repository.js";
import { orderLocaleOf } from "./order-locale-column.js";

/**
 * L'adaptateur du client prévenu (E6d), sur la ligne de la décision.
 *
 * La décision de la COMMANDE — son envoi de rang 1 — depuis que la décision
 * est par envoi (plan E7 reliquat, LB) : le courrier d'un reliquat, qui
 * annonce sa date, arrive avec le reste relivré (L8, choix 17).
 */
@Injectable()
export class PrismaShortfallNoticeRepository extends ShortfallNoticeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<LockedShortfallNotice | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."order_shortfall_decision"
      WHERE "order_id" = ${orderId} AND "rank" = ${FIRST_SHIPMENT_RANK}
      FOR UPDATE`;
    const row = await this.prisma.orderShortfallDecision.findUnique({
      where: { orderId_rank: { orderId, rank: FIRST_SHIPMENT_RANK } },
      select: {
        id: true,
        customerNotifiedAt: true,
        customerNotifiedByStaffId: true,
        order: { select: { orderNumber: true, placedByUserId: true, locale: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      notice: ShortfallNotice.fromSnapshot({
        decisionId: row.id,
        orderId,
        reference: row.order.orderNumber,
        notifiedAt: row.customerNotifiedAt,
        notifiedBy: row.customerNotifiedByStaffId,
      }),
      placedByUserId: row.order.placedByUserId,
      locale: orderLocaleOf(row.order.locale),
    };
  }

  async save(notice: ShortfallNotice): Promise<void> {
    const state = notice.toSnapshot();
    await this.prisma.orderShortfallDecision.update({
      where: { id: state.decisionId },
      data: {
        customerNotifiedAt: state.notifiedAt,
        customerNotifiedByStaffId: state.notifiedBy,
      },
    });
  }
}
