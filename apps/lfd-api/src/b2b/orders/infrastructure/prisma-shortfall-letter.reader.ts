import { Injectable } from "@nestjs/common";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ShortfallLetterReader,
  type ShortfallLetterSubject,
} from "../domain/ports/shortfall-letter.reader.js";
import { orderLocaleOf } from "./order-locale-column.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";

/**
 * La proposition « Écrire au client » (E6d) — par le client routé, sans
 * verrou. Sur le manque de la commande, rang 1, comme son écriture
 * (`PrismaShortfallNoticeRepository`, plan E7 reliquat, LB).
 */
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
        shortfalls: {
          where: { rank: FIRST_SHIPMENT_RANK },
          select: { lines: true, decision: { select: { customerNotifiedAt: true } } },
        },
        lines: { select: { sku: true, productNameSnapshot: true } },
      },
    });
    const shortfall = row?.shortfalls[0];
    if (row === null || shortfall === undefined) {
      return null;
    }
    const { decision, lines } = shortfall;
    if (decision === null || lines === null) {
      return null;
    }
    return {
      reference: row.orderNumber,
      locale: orderLocaleOf(row.locale),
      notified: decision.customerNotifiedAt !== null,
      lines: shortfallLinesOf(lines),
      names: new Map(row.lines.map((line) => [line.sku, line.productNameSnapshot])),
    };
  }
}
