import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RecordedClosureReader } from "../domain/ports/recorded-closure.reader.js";

/** La clôture du dernier lot vivant — non annulé. */
@Injectable()
export class PrismaRecordedClosureReader extends RecordedClosureReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lastClosure(legalEntityId: string | null): Promise<Date | null> {
    const row = await this.prisma.collectionBatch.findFirst({
      where: {
        status: { not: "cancelled" },
        ...(legalEntityId === null ? {} : { legalEntityId }),
      },
      orderBy: { cycleClosesAt: "desc" },
      select: { cycleClosesAt: true },
    });
    return row?.cycleClosesAt ?? null;
  }
}
