import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { CardRefundSweepReader } from "../domain/ports/card-refund-sweep.reader.js";

/** Les demandes à émettre dont l'échéance est passée — `dueForSweep` : `state = to_issue` seul (§3.5). */
@Injectable()
export class PrismaCardRefundSweepReader extends CardRefundSweepReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dueForSweep(wallNow: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.cardRefundRequest.findMany({
      where: { state: "to_issue", nextAttemptAt: { lte: wallNow } },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
