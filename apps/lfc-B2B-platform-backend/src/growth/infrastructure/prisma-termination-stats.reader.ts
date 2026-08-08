import { Injectable } from "@nestjs/common";
import type { TerminationStatsView } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { computeTerminationStats } from "../domain/termination-stats.js";
import { TerminationStatsReader } from "../domain/ports/termination-stats.reader.js";

/**
 * Adaptateur Prisma des analytics de churn : lit les terminaisons (raison + issue)
 * et délègue l'agrégation à `computeTerminationStats` (pur). All-time (pas de
 * fenêtre) — comme le camembert du mode d'acquisition.
 */
@Injectable()
export class PrismaTerminationStatsReader extends TerminationStatsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<TerminationStatsView> {
    const rows = await this.prisma.companyTermination.findMany({
      select: { reason: true, subReason: true, detail: true, outcome: true },
    });
    return computeTerminationStats(rows);
  }
}
