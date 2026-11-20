import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderNoShowReader, type OrderNoShowTraces } from "../domain/ports/order-no-show.reader.js";
import { noShowTraceOf } from "./prisma-order-no-show.repository.js";

/** Les traces d'une commande non retirée, lues sur sa ligne — sans verrou : c'est un affichage. */
@Injectable()
export class PrismaOrderNoShowReader extends OrderNoShowReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderId: string): Promise<OrderNoShowTraces | null> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, status: "no_show" },
      select: {
        noShowAt: true,
        noShowByStaffId: true,
        noShowNoticeRequestedAt: true,
        noShowNoticeRequestedByStaffId: true,
      },
    });
    const declared = row === null ? null : noShowTraceOf(row.noShowAt, row.noShowByStaffId);
    if (row === null || declared === null) {
      return null;
    }
    return {
      declared,
      noticeRequested: noShowTraceOf(
        row.noShowNoticeRequestedAt,
        row.noShowNoticeRequestedByStaffId,
      ),
    };
  }
}
