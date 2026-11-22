import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransferAllocationView } from "../../channels/requests/bank-transfers.js";
import type { MovementSubject } from "../../channels/subjects/movement-subject.js";
import { TransferAllocationsReader } from "../domain/ports/transfer-allocations.reader.js";
import { dayOfColumn } from "./transfer-day.js";

/**
 * Les parts de sujets donnés, en UNE requête : un `OR` par type de sujet
 * demandé (un seul aujourd'hui), chacun sur l'unique `(subject_type,
 * subject_id)`.
 */
@Injectable()
export class PrismaTransferAllocationsReader extends TransferAllocationsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allocationsOf(
    subjects: readonly MovementSubject[],
  ): Promise<readonly TransferAllocationView[]> {
    const idsByType = new Map<string, string[]>();
    for (const subject of subjects) {
      const ids = idsByType.get(subject.type) ?? [];
      ids.push(subject.id);
      idsByType.set(subject.type, ids);
    }
    if (idsByType.size === 0) {
      return [];
    }
    const rows = await this.prisma.transferAllocation.findMany({
      where: {
        OR: [...idsByType].map(([subjectType, ids]) => ({ subjectType, subjectId: { in: ids } })),
      },
      select: {
        transferId: true,
        subjectType: true,
        subjectId: true,
        amountCents: true,
        transfer: { select: { receivedOn: true } },
      },
    });
    return rows.map((row) => ({
      transferId: row.transferId,
      subject: { type: row.subjectType, id: row.subjectId },
      amountCents: row.amountCents,
      receivedOn: dayOfColumn(row.transfer.receivedOn),
    }));
  }
}
