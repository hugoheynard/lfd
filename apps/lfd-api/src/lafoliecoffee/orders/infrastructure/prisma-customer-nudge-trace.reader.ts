import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CustomerNudgeTraceReader,
  type SentCustomerNudges,
} from "../domain/ports/customer-nudge-trace.reader.js";

/**
 * Les relances déjà faites d'une date de service, en une requête. Seules les
 * commandes qui en portent une reviennent : la Supervision n'a rien à
 * apprendre des autres.
 */
@Injectable()
export class PrismaCustomerNudgeTraceReader extends CustomerNudgeTraceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async sentOn(day: string): Promise<readonly SentCustomerNudges[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        OR: [{ pickupRemindedAt: { not: null } }, { delayWarnedAt: { not: null } }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        pickupRemindedAt: true,
        pickupRemindedByStaffId: true,
        delayWarnedAt: true,
        delayWarnedByStaffId: true,
      },
    });
    return rows.map((row) => ({
      orderId: row.id,
      pickupReminder:
        row.pickupRemindedAt === null || row.pickupRemindedByStaffId === null
          ? null
          : { at: row.pickupRemindedAt, byStaffId: row.pickupRemindedByStaffId },
      delayWarning:
        row.delayWarnedAt === null || row.delayWarnedByStaffId === null
          ? null
          : { at: row.delayWarnedAt, byStaffId: row.delayWarnedByStaffId },
    }));
  }
}
