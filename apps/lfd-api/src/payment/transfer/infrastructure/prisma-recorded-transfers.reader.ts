import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { RecordedTransferView } from "../../channels/requests/bank-transfers.js";
import { RecordedTransfersReader } from "../domain/ports/recorded-transfers.reader.js";
import { dayOfColumn } from "./transfer-day.js";

/** Les virements depuis un instant, en UNE requête, sur l'index de `recorded_at`. */
@Injectable()
export class PrismaRecordedTransfersReader extends RecordedTransfersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordedSince(since: Date): Promise<readonly RecordedTransferView[]> {
    const rows = await this.prisma.transferReceived.findMany({
      where: { recordedAt: { gte: since } },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        receivedInto: true,
        payerRef: true,
        amountCents: true,
        receivedOn: true,
        recordedAt: true,
        allocations: {
          select: { subjectType: true, subjectId: true, amountCents: true },
          orderBy: [{ subjectType: "asc" }, { subjectId: "asc" }],
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      receivedInto: row.receivedInto,
      payerRef: row.payerRef,
      amountCents: row.amountCents,
      receivedOn: dayOfColumn(row.receivedOn),
      recordedAt: row.recordedAt,
      parts: row.allocations.map((part) => ({
        subject: { type: part.subjectType, id: part.subjectId },
        amountCents: part.amountCents,
      })),
    }));
  }
}
