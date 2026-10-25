import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShortfallNotice } from "../domain/entities/shortfall-notice.js";
import {
  ShortfallNoticeRepository,
  type LockedShortfallNotice,
} from "../domain/ports/shortfall-notice.repository.js";
import { orderLocaleOf } from "./order-locale-column.js";

/** L'adaptateur du client prévenu (E6d), sur la ligne de la décision. */
@Injectable()
export class PrismaShortfallNoticeRepository extends ShortfallNoticeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<LockedShortfallNotice | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."order_shortfall_decision" WHERE "order_id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.orderShortfallDecision.findUnique({
      where: { orderId },
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
