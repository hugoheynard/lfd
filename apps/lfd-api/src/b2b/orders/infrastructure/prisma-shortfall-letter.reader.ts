import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ShortfallLetterReader,
  type ShortfallLetterSubject,
} from "../domain/ports/shortfall-letter.reader.js";
import { orderLocaleOf } from "./order-locale-column.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";

/** La proposition « Écrire au client » (E6d) — par le client routé, sans verrou. */
@Injectable()
export class PrismaShortfallLetterReader extends ShortfallLetterReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async subjectOf(orderId: string): Promise<ShortfallLetterSubject | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        locale: true,
        shortfallLines: true,
        shortfallDecision: { select: { customerNotifiedAt: true } },
        lines: { select: { sku: true, productNameSnapshot: true } },
      },
    });
    if (row === null || row.shortfallDecision === null || row.shortfallLines === null) {
      return null;
    }
    return {
      reference: row.orderNumber,
      locale: orderLocaleOf(row.locale),
      notified: row.shortfallDecision.customerNotifiedAt !== null,
      lines: shortfallLinesOf(row.shortfallLines),
      names: new Map(row.lines.map((line) => [line.sku, line.productNameSnapshot])),
    };
  }
}
