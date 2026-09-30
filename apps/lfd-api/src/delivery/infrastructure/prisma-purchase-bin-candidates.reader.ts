import type { PurchaseBinCandidateView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PurchaseBinCandidatesReader } from "../domain/ports/purchase-bin-candidates.reader.js";
import { binCandidateViewOf } from "./purchase-bin-candidate.mapper.js";

/** Lecture Prisma de la bibliothèque d'achat : sa propre table, jamais celle du réel (B-D1). */
@Injectable()
export class PrismaPurchaseBinCandidatesReader extends PurchaseBinCandidatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(includeArchived: boolean): Promise<readonly PurchaseBinCandidateView[]> {
    const rows = await this.prisma.deliveryPurchaseBinCandidate.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(binCandidateViewOf);
  }
}
