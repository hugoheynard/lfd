import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackingReturnLedger,
  PackingReturnReader,
  type ReturnToDecide,
} from "../domain/ports/packing-return.ledger.js";

/** L'adaptateur Prisma des demandes de retour, en écriture. */
@Injectable()
export class PrismaPackingReturnLedger extends PackingReturnLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(request: ReturnToDecide): Promise<boolean> {
    const { count } = await this.prisma.packingReturn.createMany({
      data: [
        {
          requestId: request.requestId,
          serviceDay: request.serviceDay,
          sku: request.sku,
          handoffId: request.handoffId,
          requested: request.requested,
          receivedAt: request.receivedAt,
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async decide(requestId: string, returned: number, decidedAt: Date): Promise<void> {
    await this.prisma.packingReturn.updateMany({
      where: { requestId, decidedAt: null },
      data: { returned, decidedAt },
    });
  }
}

/** L'adaptateur Prisma des demandes de retour, en lecture. */
@Injectable()
export class PrismaPackingReturnReader extends PackingReturnReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHandoffReceived(handoffId: string): Promise<boolean> {
    const found = await this.prisma.packingReceipt.findFirst({
      where: { id: handoffId, kind: "handoff" },
      select: { id: true },
    });
    return found !== null;
  }

  async pendingFor(handoffId: string): Promise<readonly ReturnToDecide[]> {
    return this.prisma.packingReturn.findMany({
      where: { handoffId, decidedAt: null },
      select: {
        requestId: true,
        serviceDay: true,
        sku: true,
        handoffId: true,
        requested: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: "asc" },
    });
  }
}
