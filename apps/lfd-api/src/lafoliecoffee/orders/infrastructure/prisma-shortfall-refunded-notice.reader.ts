import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ShortfallRefundedNoticeReader,
  type ShortfallRefundedNotice,
} from "../domain/ports/shortfall-refunded-notice.reader.js";
import { orderLocaleOf } from "./order-locale-column.js";

/** Le courriel du reste rendu (plan E9, § 7) — par le client routé, sans verrou. */
@Injectable()
export class PrismaShortfallRefundedNoticeReader extends ShortfallRefundedNoticeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async noticeOf(orderId: string): Promise<ShortfallRefundedNotice | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, placedByUserId: true, locale: true },
    });
    return row === null
      ? null
      : {
          reference: row.orderNumber,
          placedByUserId: row.placedByUserId,
          locale: orderLocaleOf(row.locale),
        };
  }
}
